#!/usr/bin/env python3
"""
Claude Code 사용량 업로더
~/.claude/projects/ 하위 JSONL 파일을 파싱해서 Supabase에 업로드합니다.

사용법:
  pip install supabase python-dotenv
  python3 claude_usage_uploader.py
"""

import json
import socket
import sys
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
import os

# 윈도우 콘솔(cp949)에서 이모지 출력 시 UnicodeEncodeError 방지
try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass

# 회사망 SSL 인터셉션 대응: 윈도우 인증서 저장소(회사 root CA 포함)를 사용
try:
    import truststore
    truststore.inject_into_ssl()
except ImportError:
    pass

load_dotenv(Path(__file__).parent / ".env")

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")

CLAUDE_PROJECTS_DIR = Path.home() / ".claude" / "projects"
BATCH_SIZE = 200


def get_supabase_client():
    from supabase import create_client
    if not SUPABASE_URL or not SUPABASE_KEY or "your-project" in SUPABASE_URL:
        print("❌ .env 파일에 SUPABASE_URL과 SUPABASE_KEY를 설정하세요.")
        sys.exit(1)
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def classify_tool(name: str, input_data: dict) -> dict:
    """도구를 분류하고 관련 메타데이터를 반환합니다."""
    if name == "Skill":
        return {
            "tool_category": "skill",
            "skill_name": input_data.get("skill"),
            "mcp_server": None,
            "mcp_tool": None,
            "subagent_type": None,
        }
    if name.startswith("mcp__"):
        parts = name.split("__", 2)
        return {
            "tool_category": "mcp",
            "skill_name": None,
            "mcp_server": parts[1] if len(parts) > 1 else name,
            "mcp_tool": parts[2] if len(parts) > 2 else None,
            "subagent_type": None,
        }
    if name in ("Task", "Agent"):
        return {
            "tool_category": "subagent",
            "skill_name": None,
            "mcp_server": None,
            "mcp_tool": None,
            "subagent_type": input_data.get("subagent_type"),
        }
    return {
        "tool_category": "general",
        "skill_name": None,
        "mcp_server": None,
        "mcp_tool": None,
        "subagent_type": None,
    }


def extract_project_name(jsonl_path: Path) -> str:
    """JSONL 파일 경로에서 프로젝트명을 추출합니다."""
    parts = jsonl_path.parts
    projects_idx = None
    for i, p in enumerate(parts):
        if p == "projects":
            projects_idx = i
            break
    if projects_idx is None or projects_idx + 1 >= len(parts):
        return "unknown"
    encoded = parts[projects_idx + 1]
    # -Users-kms-Code-myproject → myproject (마지막 세그먼트)
    segments = [s for s in encoded.split("-") if s]
    return segments[-1] if segments else encoded


def parse_jsonl(jsonl_path: Path, start_line: int) -> tuple[list[dict], int]:
    """JSONL 파일을 파싱해서 tool_calls 레코드 목록과 마지막 줄 번호를 반환합니다."""
    records = []
    project_name = extract_project_name(jsonl_path)
    last_line = start_line

    try:
        with open(jsonl_path, encoding="utf-8") as f:
            for line_no, line in enumerate(f, start=1):
                if line_no <= start_line:
                    continue
                last_line = line_no
                line = line.strip()
                if not line:
                    continue
                try:
                    entry = json.loads(line)
                except json.JSONDecodeError:
                    continue

                if entry.get("type") != "assistant":
                    continue

                msg = entry.get("message", {})
                content = msg.get("content", [])
                usage = msg.get("usage", {})
                model = msg.get("model")
                ts_str = entry.get("timestamp", "")
                session_id = entry.get("sessionId", entry.get("uuid", ""))

                try:
                    ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
                except (ValueError, AttributeError):
                    ts = datetime.now(timezone.utc)

                input_tokens = usage.get("input_tokens", 0) or 0
                output_tokens = usage.get("output_tokens", 0) or 0
                cache_creation = usage.get("cache_creation_input_tokens", 0) or 0
                cache_read = usage.get("cache_read_input_tokens", 0) or 0

                tool_uses = [c for c in content if isinstance(c, dict) and c.get("type") == "tool_use"]
                if not tool_uses:
                    continue

                for tool in tool_uses:
                    name = tool.get("name", "")
                    inp = tool.get("input", {}) or {}
                    meta = classify_tool(name, inp)

                    records.append({
                        "session_id": session_id,
                        "timestamp": ts.isoformat(),
                        "tool_name": name,
                        "project_name": project_name,
                        "model": model,
                        "input_tokens": input_tokens,
                        "output_tokens": output_tokens,
                        "cache_creation_tokens": cache_creation,
                        "cache_read_tokens": cache_read,
                        **meta,
                    })
    except OSError:
        pass

    return records, last_line


def load_cursors(supabase, device_id: str) -> dict[str, int]:
    """이미 처리한 파일별 마지막 줄 번호를 가져옵니다."""
    result = (
        supabase.table("upload_cursor")
        .select("file_path, last_line")
        .eq("device_id", device_id)
        .execute()
    )
    return {row["file_path"]: row["last_line"] for row in (result.data or [])}


def save_cursor(supabase, device_id: str, file_path: str, last_line: int):
    supabase.table("upload_cursor").upsert(
        {
            "device_id": device_id,
            "file_path": file_path,
            "last_line": last_line,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
        on_conflict="device_id,file_path",
    ).execute()


def upload_batch(supabase, device_id: str, records: list[dict]):
    for i in range(0, len(records), BATCH_SIZE):
        batch = [{"device_id": device_id, **r} for r in records[i : i + BATCH_SIZE]]
        supabase.table("tool_calls").insert(batch).execute()


def main():
    supabase = get_supabase_client()
    device_id = socket.gethostname()
    print(f"기기 ID: {device_id}")

    cursors = load_cursors(supabase, device_id)

    jsonl_files = sorted(CLAUDE_PROJECTS_DIR.rglob("*.jsonl"))
    print(f"JSONL 파일 {len(jsonl_files)}개 탐색 중...")

    total_new = 0
    for jsonl_path in jsonl_files:
        path_key = str(jsonl_path)
        start_line = cursors.get(path_key, 0)

        records, last_line = parse_jsonl(jsonl_path, start_line)
        if not records:
            if last_line > start_line:
                save_cursor(supabase, device_id, path_key, last_line)
            continue

        upload_batch(supabase, device_id, records)
        save_cursor(supabase, device_id, path_key, last_line)
        total_new += len(records)
        print(f"  {jsonl_path.name}: {len(records)}건 업로드")

    print(f"\n✅ 완료: 총 {total_new}건 업로드")


if __name__ == "__main__":
    main()
