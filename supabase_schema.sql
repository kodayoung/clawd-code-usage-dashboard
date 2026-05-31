-- Claude Code 사용량 통계 대시보드 스키마
-- Supabase SQL Editor에 붙여넣고 실행

-- 1. tool_calls 테이블
CREATE TABLE IF NOT EXISTS tool_calls (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id             text NOT NULL,
  session_id            text NOT NULL,
  timestamp             timestamptz NOT NULL,
  tool_category         text NOT NULL CHECK (tool_category IN ('skill', 'mcp', 'subagent', 'general')),
  tool_name             text NOT NULL,
  skill_name            text,
  mcp_server            text,
  mcp_tool              text,
  subagent_type         text,
  project_name          text,
  input_tokens          int NOT NULL DEFAULT 0,
  output_tokens         int NOT NULL DEFAULT 0,
  cache_creation_tokens int NOT NULL DEFAULT 0,
  cache_read_tokens     int NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tool_calls_timestamp_idx      ON tool_calls (timestamp);
CREATE INDEX IF NOT EXISTS tool_calls_category_idx       ON tool_calls (tool_category);
CREATE INDEX IF NOT EXISTS tool_calls_device_idx         ON tool_calls (device_id);
CREATE INDEX IF NOT EXISTS tool_calls_project_idx        ON tool_calls (project_name);
CREATE INDEX IF NOT EXISTS tool_calls_session_idx        ON tool_calls (session_id);

-- 2. upload_cursor 테이블 (중복 업로드 방지)
CREATE TABLE IF NOT EXISTS upload_cursor (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id   text NOT NULL,
  file_path   text NOT NULL,
  last_line   int NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (device_id, file_path)
);

-- 3. RLS 정책 (개인 프로젝트 → anon key로 읽기/쓰기 허용)
ALTER TABLE tool_calls   ENABLE ROW LEVEL SECURITY;
ALTER TABLE upload_cursor ENABLE ROW LEVEL SECURITY;

-- tool_calls: anon 읽기 허용
CREATE POLICY "anon read tool_calls"
  ON tool_calls FOR SELECT
  TO anon
  USING (true);

-- tool_calls: anon 쓰기 허용 (업로더가 anon key 사용)
CREATE POLICY "anon insert tool_calls"
  ON tool_calls FOR INSERT
  TO anon
  WITH CHECK (true);

-- upload_cursor: anon 읽기/쓰기 허용
CREATE POLICY "anon read upload_cursor"
  ON upload_cursor FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "anon insert upload_cursor"
  ON upload_cursor FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "anon update upload_cursor"
  ON upload_cursor FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);
