-- Claude Code + Codex 사용량 통계 대시보드 스키마
-- Supabase SQL Editor에 붙여넣고 실행

-- 1. tool_calls 테이블
CREATE TABLE IF NOT EXISTS tool_calls (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id             text NOT NULL,
  session_id            text NOT NULL,
  source                text NOT NULL DEFAULT 'claude' CHECK (source IN ('claude', 'codex')),
  record_type           text NOT NULL DEFAULT 'tool_call' CHECK (record_type IN ('tool_call', 'usage')),
  event_id              text,
  timestamp             timestamptz NOT NULL,
  tool_category         text NOT NULL CHECK (tool_category IN ('skill', 'mcp', 'subagent', 'general')),
  tool_name             text NOT NULL,
  skill_name            text,
  mcp_server            text,
  mcp_tool              text,
  subagent_type         text,
  project_name          text,
  model                 text,
  input_tokens          int NOT NULL DEFAULT 0,
  output_tokens         int NOT NULL DEFAULT 0,
  reasoning_output_tokens int NOT NULL DEFAULT 0,
  cache_creation_tokens int NOT NULL DEFAULT 0,
  cache_read_tokens     int NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tool_calls_timestamp_idx      ON tool_calls (timestamp);
CREATE INDEX IF NOT EXISTS tool_calls_category_idx       ON tool_calls (tool_category);
CREATE INDEX IF NOT EXISTS tool_calls_device_idx         ON tool_calls (device_id);
CREATE INDEX IF NOT EXISTS tool_calls_project_idx        ON tool_calls (project_name);
CREATE INDEX IF NOT EXISTS tool_calls_session_idx        ON tool_calls (session_id);
CREATE UNIQUE INDEX IF NOT EXISTS tool_calls_source_event_idx ON tool_calls (device_id, source, event_id);

-- 2. upload_cursor 테이블 (중복 업로드 방지)
CREATE TABLE IF NOT EXISTS upload_cursor (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id   text NOT NULL,
  file_path   text NOT NULL,
  last_line   int NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (device_id, file_path)
);

-- 3. RLS 정책
--   대시보드(브라우저, anon/publishable key) → tool_calls 읽기만 허용
--   업로더(로컬 PC, secret/service_role key) → RLS를 우회하므로 정책 불필요
--   upload_cursor 는 업로더 전용이라 anon 정책을 두지 않는다
ALTER TABLE tool_calls   ENABLE ROW LEVEL SECURITY;
ALTER TABLE upload_cursor ENABLE ROW LEVEL SECURITY;

-- tool_calls: anon 읽기 허용
CREATE POLICY "anon read tool_calls"
  ON tool_calls FOR SELECT
  TO anon
  USING (true);
