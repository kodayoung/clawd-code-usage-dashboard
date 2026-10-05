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


if __name__ == "__main__":
    unittest.main()
