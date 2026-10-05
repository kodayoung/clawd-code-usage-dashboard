-- 기존 Claude 데이터와 커서를 보존하는 Codex 지원 확장.
ALTER TABLE public.tool_calls
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'claude' CHECK (source IN ('claude', 'codex')),
  ADD COLUMN IF NOT EXISTS record_type text NOT NULL DEFAULT 'tool_call' CHECK (record_type IN ('tool_call', 'usage')),
  ADD COLUMN IF NOT EXISTS event_id text,
  ADD COLUMN IF NOT EXISTS reasoning_output_tokens int NOT NULL DEFAULT 0;

-- NULL인 기존 행은 그대로 두고, 새 이벤트는 재시도/아카이브 이동 후에도 중복 방지.
CREATE UNIQUE INDEX IF NOT EXISTS tool_calls_source_event_idx
  ON public.tool_calls (device_id, source, event_id);

NOTIFY pgrst, 'reload schema';
