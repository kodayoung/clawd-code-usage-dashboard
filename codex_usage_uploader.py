#!/usr/bin/env python3
"""Codex rollout JSONL 수집. 대화/도구 인수는 업로드하지 않습니다."""

import hashlib
import json
from pathlib import Path

from claude_usage_uploader import classify_tool

TOKEN_FIELDS = (
    "input_tokens", "cached_input_tokens", "cache_write_input_tokens",
    "output_tokens", "reasoning_output_tokens", "total_tokens",
)


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
    if short_name in ("spawn_agent", "send_input", "wait_agent", "wait", "close_agent", "resume_agent"):
        return {**classify_tool("Agent", arguments),
                "subagent_type": arguments.get("agent_type") or arguments.get("subagent_type")}
    return classify_tool(short_name, arguments)


def parse_codex_jsonl(jsonl_path: Path, start_line: int = 0) -> tuple[list[dict], int]:
    """메타데이터와 누적 토큰은 처음부터 복원하고, 커서 이후 이벤트만 반환.

    input_tokens는 캐시를 제외한 입력, reasoning은 output의 부분집합으로 저장.
    반복 token_count(한도 갱신)는 누적값 차이가 없으면 무시한다.
    """
    records = []
    session_id = jsonl_path.stem
    project_name = "unknown"
    model = None
    previous = {k: 0 for k in TOKEN_FIELDS}
    seen_calls = set()
    last_line = 0
    with jsonl_path.open(encoding="utf-8") as f:
        for line_no, line in enumerate(f, start=1):
            # 작성 중인 마지막 줄은 다음 실행에서 다시 읽는다.
            if not line.endswith("\n"):
                break
            last_line = line_no
            if not line.strip():
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue
            if not isinstance(entry, dict):
                continue
            payload = entry.get("payload") or {}
            if not isinstance(payload, dict):
                continue
            kind = entry.get("type")
            if kind == "session_meta":
                session_id = payload.get("id") or session_id
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

            # 저장된 줄도 누적 상태를 복원해 다음 이벤트의 차분 기준으로 삼는다.
            usage_delta = None
            if kind == "event_msg" and payload.get("type") == "token_count":
                info = payload.get("info") or {}
                total = info.get("total_token_usage") if isinstance(info, dict) else None
                if not isinstance(total, dict):
                    continue
                current = token_totals(total)
                # 누적값이 감소하는 보정 이벤트는 사용량으로 세지 않고 기준만 갱신.
                if current["input_tokens"] < previous["input_tokens"] or current["output_tokens"] < previous["output_tokens"]:
                    previous = current
                    continue
                usage_delta = {k: max(0, current[k] - previous[k]) for k in TOKEN_FIELDS}
                previous = current
                if not (usage_delta["input_tokens"] or usage_delta["output_tokens"]):
                    continue

            if line_no <= start_line:
                continue
            timestamp = entry.get("timestamp")
            if not timestamp:
                continue
            base = {
                "source": "codex", "session_id": session_id, "timestamp": timestamp,
                "project_name": project_name, "model": model,
                "input_tokens": 0, "output_tokens": 0,
                "cache_creation_tokens": 0, "cache_read_tokens": 0,
                "reasoning_output_tokens": 0,
            }
            if usage_delta is not None:
                cached = min(usage_delta["cached_input_tokens"], usage_delta["input_tokens"])
                written = min(usage_delta["cache_write_input_tokens"], usage_delta["input_tokens"] - cached)
                identity = json.dumps([session_id, "usage", timestamp, previous], sort_keys=True)
                records.append({
                    **base, "record_type": "usage", "tool_name": "token_count",
                    "event_id": hashlib.sha256(identity.encode()).hexdigest(),
                    "input_tokens": usage_delta["input_tokens"] - cached - written,
                    "output_tokens": usage_delta["output_tokens"],
                    "cache_creation_tokens": written, "cache_read_tokens": cached,
                    "reasoning_output_tokens": min(usage_delta["reasoning_output_tokens"], usage_delta["output_tokens"]),
                    **classify_tool("token_count", {}),
                })
            elif kind == "response_item" and payload.get("type") in ("function_call", "custom_tool_call"):
                name = payload.get("name") or "unknown"
                call_id = payload.get("call_id") or payload.get("id") or f"{timestamp}:{line_no}"
                if call_id in seen_calls:
                    continue
                seen_calls.add(call_id)
                identity = json.dumps([session_id, "tool_call", call_id])
                records.append({
                    **base, "record_type": "tool_call", "tool_name": name,
                    "event_id": hashlib.sha256(identity.encode()).hexdigest(),
                    **classify_codex_tool(name, payload.get("arguments", payload.get("input"))),
                })
    return records, last_line


if __name__ == "__main__":
    from claude_usage_uploader import main
    main(default_source="codex")
