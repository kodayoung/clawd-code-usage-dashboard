#!/usr/bin/env python3
"""Codex CLI/desktop rollout JSONL 수집. 대화/도구 인수는 업로드하지 않습니다."""

import hashlib
import json
import re
from pathlib import Path

from claude_usage_uploader import classify_tool

TOKEN_FIELDS = (
    "input_tokens", "cached_input_tokens", "cache_write_input_tokens",
    "output_tokens", "reasoning_output_tokens", "total_tokens",
)
DESKTOP_TOOL_TYPES = {
    "CommandExecution": "exec_command",
    "FileChange": "apply_patch",
    "ImageView": "view_image",
    "McpToolCall": None,
    "CollabAgentToolCall": None,
}


def token_totals(usage: dict) -> dict:
    return {k: max(0, int(usage.get(k) or 0)) for k in TOKEN_FIELDS}


def project_from_cwd(cwd: str) -> str:
    # Windows 로그도 macOS/Linux에서 읽을 수 있게 경로 구분자를 정규화.
    return str(cwd or "").replace("\\", "/").rstrip("/").split("/")[-1] or "unknown"


def classify_codex_tool(name: str, arguments) -> dict:
    short_name = name.rsplit(".", 1)[-1]
    if not isinstance(arguments, dict):
        try:
            arguments = json.loads(arguments or "{}")
        except (ValueError, TypeError):
            arguments = {}
    if not isinstance(arguments, dict):
        arguments = {}
    agent_tools = {"spawn_agent", "send_input", "send_message", "followup_task", "wait_agent",
                   "wait", "close_agent", "resume_agent", "interrupt_agent", "list_agents"}
    if short_name.removeprefix("collab_") in agent_tools:
        return {**classify_tool("Agent", arguments),
                "subagent_type": arguments.get("agent_type") or arguments.get("subagent_type")}
    return classify_tool(short_name, arguments)


def _entries(jsonl_path: Path):
    """완료된 줄만 읽는다. 잘못된 줄도 커서에 포함한다."""
    with jsonl_path.open(encoding="utf-8") as f:
        for line_no, line in enumerate(f, start=1):
            if not line.endswith("\n"):
                break
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                entry = None
            yield line_no, entry if isinstance(entry, dict) else None


def _desktop_item(entry: dict):
    payload = entry.get("payload") or {}
    if (entry.get("type") == "event_msg" and isinstance(payload, dict)
            and payload.get("type") == "item_completed"):
        item = payload.get("item")
        if isinstance(item, dict) and item.get("type") in DESKTOP_TOOL_TYPES:
            return item
    return None


def _expects_response_usage(payload: dict) -> bool:
    # 0.152.1에도 paginated 메타데이터가 있지만 응답별 사용량은 없다.
    # 실제 응답별 형식이 있는 로그의 최초 버전은 0.153.4이다.
    match = re.match(r"^(\d+)\.(\d+)\.(\d+)", str(payload.get("cli_version") or ""))
    return (payload.get("history_mode") == "paginated" and match is not None
            and tuple(map(int, match.groups())) >= (0, 153, 4))


def parse_codex_jsonl(jsonl_path: Path, start_line: int = 0) -> tuple[list[dict], int]:
    """메타데이터와 중복 상태는 처음부터 복원하고, 커서 이후만 반환.

    desktop의 usage는 응답별 사용량이며 turn/thread 합계를 더하지 않는다.
    같은 파일에 함께 기록된 CLI token_count/도구 wrapper는 중복 집계하지 않는다.
    input_tokens는 캐시를 제외한 입력, reasoning은 output의 부분집합이다.
    """
    desktop_usage = False
    desktop_tools = False
    scan_end = 0
    # 출력 순서와 커서 위치에 관계없이 파일 전체에서 정식 표현을 선택한다.
    for line_no, entry in _entries(jsonl_path):
        scan_end = line_no
        if entry is None:
            continue
        payload = entry.get("payload")
        # 새 paginated 로그는 미완성 응답 이전부터 desktop 표현을 사용한다.
        # 먼저 나온 wrapper/한도 알림을 올린 뒤 완료 이벤트를 또 올리지 않는다.
        if (entry.get("type") == "session_meta" and isinstance(payload, dict)
                and _expects_response_usage(payload)):
            desktop_usage = True
            desktop_tools = True
        if (entry.get("type") == "token_usage_record" and isinstance(payload, dict)
                and isinstance(payload.get("usage"), dict)):
            desktop_usage = True
        desktop_tools = desktop_tools or _desktop_item(entry) is not None

    records = []
    session_id = jsonl_path.stem
    project_name = "unknown"
    model = None
    previous = {k: 0 for k in TOKEN_FIELDS}
    seen_calls = set()
    seen_usage = set()
    last_line = 0
    for line_no, entry in _entries(jsonl_path):
        # 읽는 동안 붙은 줄은 다음 실행에서 처리해 두 번의 스캔을 일치시킨다.
        if line_no > scan_end:
            break
        last_line = line_no
        if entry is None:
            continue
        payload = entry.get("payload") or {}
        if not isinstance(payload, dict):
            continue
        kind = entry.get("type")
        if kind == "session_meta":
            session_id = payload.get("id") or payload.get("session_id") or session_id
            project_name = project_from_cwd(payload.get("cwd"))
            model = payload.get("model") or model
            continue
        if kind == "turn_context":
            model = payload.get("model") or model
            if payload.get("cwd"):
                project_name = project_from_cwd(payload["cwd"])
            continue
        if kind == "event_msg" and payload.get("type") == "model_reroute":
            model = payload.get("to_model") or model
            continue

        timestamp = entry.get("timestamp")
        usage_delta = None
        usage_id = None
        record_session = session_id
        tool = None
        if kind == "token_usage_record" and isinstance(payload.get("usage"), dict):
            usage_delta = token_totals(payload["usage"])
            record_session = payload.get("thread_id") or session_id
            response_id = payload.get("response_id")
            identity = (["codex", "usage", response_id] if response_id else
                        [session_id, "usage", timestamp, payload.get("turn_id"), usage_delta])
            usage_id = json.dumps(identity, sort_keys=True)
        elif (not desktop_usage and kind == "event_msg"
              and payload.get("type") == "token_count"):
            info = payload.get("info") or {}
            total = info.get("total_token_usage") if isinstance(info, dict) else None
            if not isinstance(total, dict):
                continue
            current = token_totals(total)
            if current["input_tokens"] < previous["input_tokens"] or current["output_tokens"] < previous["output_tokens"]:
                previous = current
                continue
            usage_delta = {k: max(0, current[k] - previous[k]) for k in TOKEN_FIELDS}
            previous = current
            usage_id = json.dumps([session_id, "usage", timestamp, previous], sort_keys=True)
        elif desktop_tools:
            item = _desktop_item(entry)
            if item is not None:
                record_session = payload.get("thread_id") or session_id
                item_type = item["type"]
                name = DESKTOP_TOOL_TYPES[item_type]
                if item_type == "McpToolCall":
                    name = f"mcp__{item.get('server') or 'unknown'}__{item.get('tool') or 'unknown'}"
                elif item_type == "CollabAgentToolCall":
                    name = item.get("tool") or "unknown"
                arguments = item.get("arguments") or {}
                if item_type == "CollabAgentToolCall":
                    arguments = {"agent_type": item.get("agent_type"),
                                 "subagent_type": item.get("subagent_type")}
                tool = (name, item.get("call_id") or item.get("id"), arguments)
        elif kind == "response_item" and payload.get("type") in ("function_call", "custom_tool_call"):
            tool = (payload.get("name") or "unknown", payload.get("call_id") or payload.get("id"),
                    payload.get("arguments", payload.get("input")))

        # 커서 이전 중복 이벤트도 기억해야 이후의 반복 기록을 다시 세지 않는다.
        if usage_delta is not None:
            if not (usage_delta["input_tokens"] or usage_delta["output_tokens"]):
                continue
            if usage_id in seen_usage:
                continue
            seen_usage.add(usage_id)
        elif tool is not None:
            name, call_id, arguments = tool
            call_id = call_id or f"{timestamp}:{line_no}"
            if call_id in seen_calls:
                continue
            seen_calls.add(call_id)
        else:
            continue
        if line_no <= start_line or not timestamp:
            continue

        base = {
            "source": "codex", "session_id": record_session, "timestamp": timestamp,
            "project_name": project_name, "model": model,
            "input_tokens": 0, "output_tokens": 0,
            "cache_creation_tokens": 0, "cache_read_tokens": 0,
            "reasoning_output_tokens": 0,
        }
        if usage_delta is not None:
            cached = min(usage_delta["cached_input_tokens"], usage_delta["input_tokens"])
            written = min(usage_delta["cache_write_input_tokens"], usage_delta["input_tokens"] - cached)
            records.append({
                **base, "record_type": "usage", "tool_name": "token_count",
                "event_id": hashlib.sha256(usage_id.encode()).hexdigest(),
                "input_tokens": usage_delta["input_tokens"] - cached - written,
                "output_tokens": usage_delta["output_tokens"],
                "cache_creation_tokens": written, "cache_read_tokens": cached,
                "reasoning_output_tokens": min(usage_delta["reasoning_output_tokens"], usage_delta["output_tokens"]),
                **classify_tool("token_count", {}),
            })
        else:
            identity = json.dumps([record_session, "tool_call", call_id])
            records.append({
                **base, "record_type": "tool_call", "tool_name": name,
                "event_id": hashlib.sha256(identity.encode()).hexdigest(),
                **classify_codex_tool(name, arguments),
            })
    return records, last_line


if __name__ == "__main__":
    from claude_usage_uploader import main
    main(default_source="codex")
