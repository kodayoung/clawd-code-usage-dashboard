import json
import tempfile
import unittest
from pathlib import Path

from codex_usage_uploader import parse_codex_jsonl
from claude_usage_uploader import upload_batch


def entry(kind, payload, second=0):
    return {"timestamp": f"2026-10-05T10:00:{second:02d}Z", "type": kind, "payload": payload}


def usage(input_tokens, cached, output, reasoning=0, second=2):
    return entry("event_msg", {"type": "token_count", "info": {
        "total_token_usage": {"input_tokens": input_tokens, "cached_input_tokens": cached,
                              "output_tokens": output, "reasoning_output_tokens": reasoning,
                              "total_tokens": input_tokens + output},
        "last_token_usage": {"input_tokens": 99999},
    }}, second)


def desktop_usage(response_id, input_tokens=100, cached=30, output=20, second=2):
    return entry("token_usage_record", {
        "thread_id": "desktop-thread", "turn_id": "turn-1", "session_id": "desktop-runtime",
        "root_turn_id": "turn-1", "response_id": response_id,
        "usage": {"input_tokens": input_tokens, "cached_input_tokens": cached,
                  "cache_write_input_tokens": 10, "output_tokens": output,
                  "reasoning_output_tokens": 5, "total_tokens": input_tokens + output},
        # These cumulative summaries must not be added as response usage.
        "turn_token_usage": {"input_tokens": 9000, "output_tokens": 9000},
        "thread_token_usage": {"input_tokens": 18000, "output_tokens": 18000},
    }, second)


def completed(item, second=1):
    return entry("event_msg", {"type": "item_completed", "thread_id": "desktop-thread",
                               "turn_id": "turn-1", "item": item}, second)


class CodexParsingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "rollout.jsonl"
        self.entries = [
            entry("session_meta", {"id": "session-1", "cwd": r"C:\Code\my-project"}),
            entry("turn_context", {"model": "gpt-5-codex"}),
            entry("response_item", {"type": "function_call", "name": "functions.exec_command", "call_id": "call-1", "arguments": '{"cmd":"private command"}'}, 1),
            entry("response_item", {"type": "function_call_output", "call_id": "call-1", "output": "private output"}, 1),
            usage(1000, 600, 100, 40),
            usage(1000, 600, 100, 40, 3),  # rate limit refresh repeats totals
            entry("event_msg", {"type": "token_count", "info": None}, 4),
            entry("turn_context", {"model": "gpt-5.1-codex"}, 5),
            entry("response_item", {"type": "custom_tool_call", "name": "apply_patch", "call_id": "call-2", "input": "private patch"}, 6),
            entry("response_item", {"type": "function_call", "name": "mcp__supabase__list_tables", "call_id": "call-3", "arguments": "{}"}, 6),
            usage(1100, 650, 140, 50, 7),
        ]
        self.write(self.entries)

    def write(self, entries):
        self.path.write_text("".join(json.dumps(e) + "\n" for e in entries), encoding="utf-8")

    def test_cumulative_usage_is_counted_once_and_cache_is_not_added_twice(self):
        records, cursor = parse_codex_jsonl(self.path)
        calls = [r for r in records if r["record_type"] == "tool_call"]
        tokens = [r for r in records if r["record_type"] == "usage"]
        self.assertEqual(cursor, len(self.entries))
        self.assertEqual(len(calls), 3)
        self.assertEqual(len(tokens), 2)
        self.assertEqual(sum(r["input_tokens"] for r in tokens), 450)
        self.assertEqual(sum(r["cache_read_tokens"] for r in tokens), 650)
        self.assertEqual(sum(r["output_tokens"] for r in tokens), 140)
        self.assertEqual(sum(r["reasoning_output_tokens"] for r in tokens), 50)
        self.assertEqual([r["model"] for r in tokens], ["gpt-5-codex", "gpt-5.1-codex"])
        self.assertEqual(calls[-1]["mcp_server"], "supabase")
        self.assertTrue(all(r["project_name"] == "my-project" for r in records))
        self.assertNotIn("private", json.dumps(records))

    def test_incremental_read_restores_model_and_previous_token_totals(self):
        records, _ = parse_codex_jsonl(self.path, start_line=7)
        tokens = [r for r in records if r["record_type"] == "usage"]
        self.assertEqual(len(tokens), 1)
        self.assertEqual(tokens[0]["input_tokens"], 50)
        self.assertEqual(tokens[0]["output_tokens"], 40)
        self.assertEqual(tokens[0]["model"], "gpt-5.1-codex")
        self.assertEqual(parse_codex_jsonl(self.path, len(self.entries))[0], [])

    def test_unfinished_line_is_retried_after_append(self):
        pending = json.dumps(usage(1200, 700, 180, 60, 8))
        with self.path.open("a", encoding="utf-8") as f:
            f.write(pending[:40])
        _, cursor = parse_codex_jsonl(self.path)
        self.assertEqual(cursor, len(self.entries))
        with self.path.open("a", encoding="utf-8") as f:
            f.write(pending[40:] + "\n")
        records, cursor = parse_codex_jsonl(self.path, cursor)
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]["output_tokens"], 40)
        self.assertEqual(cursor, len(self.entries) + 1)

    def test_event_identity_survives_archive_and_upload_retry(self):
        original, _ = parse_codex_jsonl(self.path)
        archive = self.path.parent / "archived_sessions" / self.path.name
        archive.parent.mkdir()
        archive.write_bytes(self.path.read_bytes())
        archived, _ = parse_codex_jsonl(archive)
        self.assertEqual(original, archived)

        class FakeDatabase:
            def __init__(self):
                self.rows = {}

            def table(self, name):
                self.name = name
                return self

            def upsert(self, batch, on_conflict, ignore_duplicates):
                self.batch = batch
                self.keys = on_conflict.split(",")
                self.ignore = ignore_duplicates
                return self

            def execute(self):
                for row in self.batch:
                    key = tuple(row[k] for k in self.keys)
                    if key not in self.rows or not self.ignore:
                        self.rows[key] = row

        db = FakeDatabase()
        upload_batch(db, "device", original)
        upload_batch(db, "device", archived)
        self.assertEqual(len(db.rows), len(original))

    def test_text_only_session_still_has_token_usage(self):
        self.write([self.entries[0], self.entries[1], usage(100, 0, 30)])
        records, _ = parse_codex_jsonl(self.path)
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]["record_type"], "usage")

    def test_cumulative_reset_does_not_create_negative_or_fabricated_tokens(self):
        self.write(self.entries + [usage(20, 0, 0, second=8), usage(120, 10, 30, 5, second=9)])
        records, _ = parse_codex_jsonl(self.path)
        last = records[-1]
        self.assertEqual(last["input_tokens"], 90)
        self.assertEqual(last["cache_read_tokens"], 10)
        self.assertEqual(last["output_tokens"], 30)

    def test_desktop_response_usage_deduplicates_and_ignores_cli_mirror(self):
        first = desktop_usage("response-1")
        second = desktop_usage("response-2", input_tokens=80, cached=20, output=15, second=4)
        self.write([
            entry("session_meta", {"session_id": "desktop-thread", "cwd": "/repo/mac-project"}),
            entry("turn_context", {"model": "gpt-6.1-sol"}),
            # Whole-file preference also handles a CLI mirror preceding its desktop record.
            usage(100, 30, 20), first, first,
            usage(180, 50, 35, second=4), second,
        ])
        records, cursor = parse_codex_jsonl(self.path)
        self.assertEqual(cursor, 7)
        self.assertEqual(len(records), 2)
        self.assertEqual(sum(r["input_tokens"] for r in records), 110)
        self.assertEqual(sum(r["cache_read_tokens"] for r in records), 50)
        self.assertEqual(sum(r["cache_creation_tokens"] for r in records), 20)
        self.assertEqual(sum(r["output_tokens"] for r in records), 35)
        self.assertTrue(all(r["session_id"] == "desktop-thread" for r in records))
        self.assertTrue(all(r["project_name"] == "mac-project" for r in records))
        self.assertTrue(all(r["model"] == "gpt-6.1-sol" for r in records))
        new, _ = parse_codex_jsonl(self.path, start_line=4)
        self.assertEqual(new, records[1:])

    def test_desktop_completed_tools_replace_wrappers_and_ignore_messages_and_lifecycle(self):
        items = [
            {"type": "CommandExecution", "id": "command-1", "command": "private command", "stdout": "private output"},
            {"type": "McpToolCall", "id": "mcp-1", "server": "supabase", "tool": "list_tables", "arguments": {"query": "private query"}, "result": "private result"},
            {"type": "FileChange", "id": "patch-1", "changes": {"private path": "private diff"}},
            {"type": "ImageView", "id": "image-1", "path": "private image"},
            {"type": "CollabAgentToolCall", "id": "agent-1", "tool": "functions.collab_spawn_agent", "agent_type": "explorer"},
            {"type": "AgentMessage", "id": "message-1", "content": "private answer"},
            {"type": "SubAgentActivity", "id": "lifecycle-1", "kind": "started"},
        ]
        self.write([self.entries[0], self.entries[2]] + [completed(i) for i in items]
                   + [completed(items[0]), completed(items[1])])
        records, cursor = parse_codex_jsonl(self.path)
        self.assertEqual(len(records), 5)
        self.assertEqual([r["tool_name"] for r in records],
                         ["exec_command", "mcp__supabase__list_tables", "apply_patch", "view_image", "functions.collab_spawn_agent"])
        self.assertEqual(records[1]["mcp_server"], "supabase")
        self.assertEqual(records[-1]["tool_category"], "subagent")
        self.assertEqual(records[-1]["subagent_type"], "explorer")
        self.assertTrue(all(r["session_id"] == "desktop-thread" for r in records))
        self.assertNotIn("private", json.dumps(records))
        self.assertEqual(parse_codex_jsonl(self.path, start_line=9)[0], [])
        self.assertEqual(cursor, 11)

    def test_desktop_usage_identity_survives_replay_and_archive_filename_change(self):
        self.write([self.entries[0], self.entries[1], desktop_usage("stable-response")])
        records, _ = parse_codex_jsonl(self.path)
        archived = self.path.parent / "other-rollout.jsonl"
        archived.write_bytes(self.path.read_bytes())
        self.assertEqual(parse_codex_jsonl(archived)[0], records)
        self.assertEqual(parse_codex_jsonl(self.path)[0], records)
        self.assertEqual(records[0]["record_type"], "usage")  # Text-only desktop session.

    def test_cli_tool_duplicates_before_cursor_are_restored(self):
        self.write(self.entries + [self.entries[2]])
        self.assertEqual(parse_codex_jsonl(self.path, start_line=len(self.entries))[0], [])

    def test_partial_desktop_record_and_following_cli_mirror_are_retried_once(self):
        self.write([self.entries[0]])
        pending = json.dumps(desktop_usage("pending-response", second=5))
        with self.path.open("a", encoding="utf-8") as f:
            f.write(pending[:80])
        records, cursor = parse_codex_jsonl(self.path)
        self.assertEqual(cursor, 1)
        self.assertEqual(records, [])
        with self.path.open("a", encoding="utf-8") as f:
            f.write(pending[80:] + "\n")
            f.write(json.dumps(usage(100, 30, 20, second=5)) + "\n")
        records, cursor = parse_codex_jsonl(self.path, start_line=cursor)
        self.assertEqual(cursor, 3)
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]["output_tokens"], 20)

    def test_paginated_metadata_selects_desktop_before_completion_arrives(self):
        meta = entry("session_meta", {"id": "desktop-thread", "session_id": "desktop-runtime",
                                      "history_mode": "paginated", "cli_version": "0.160.0",
                                      "cwd": "/repo/project"})
        wrapper = entry("response_item", {"type": "function_call", "name": "functions.exec",
                                          "call_id": "wrapper-1", "arguments": "private command"}, 1)
        # A live scan can finish before the definitive completion is written.
        self.write([meta, wrapper, usage(100, 30, 20)])
        records, cursor = parse_codex_jsonl(self.path)
        self.assertEqual(records, [])
        with self.path.open("a", encoding="utf-8") as f:
            for e in [completed({"type": "CommandExecution", "id": "exec-1"}),
                      desktop_usage("response-1")]:
                f.write(json.dumps(e) + "\n")
        records, cursor = parse_codex_jsonl(self.path, start_line=cursor)
        self.assertEqual(len(records), 2)
        self.assertEqual(sum(r["output_tokens"] for r in records), 20)
        self.assertEqual(sum(r["record_type"] == "tool_call" for r in records), 1)
        self.assertEqual(parse_codex_jsonl(self.path, start_line=cursor)[0], [])

    def test_older_paginated_desktop_archive_preserves_cli_token_totals(self):
        meta = entry("session_meta", {"id": "old-desktop", "history_mode": "paginated",
                                      "cli_version": "0.152.1"})
        self.write([meta, usage(23979, 1408, 63),
                    completed({"type": "CommandExecution", "id": "old-exec"}),
                    usage(51139, 25344, 138, second=3)])
        records, _ = parse_codex_jsonl(self.path)
        tokens = [r for r in records if r["record_type"] == "usage"]
        self.assertEqual(len(tokens), 2)
        self.assertEqual(sum(r["input_tokens"] + r["cache_read_tokens"] for r in tokens), 51139)
        self.assertEqual(sum(r["output_tokens"] for r in tokens), 138)
        self.assertEqual(sum(r["record_type"] == "tool_call" for r in records), 1)


if __name__ == "__main__":
    unittest.main()
