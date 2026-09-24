-- 기존 프로젝트용: anon key의 쓰기 권한 회수
-- supabase_schema.sql 을 예전 버전으로 실행한 DB에 한 번만 실행한다.
-- 실행 전에 업로더 .env 에 SUPABASE_SECRET_KEY 를 먼저 넣어 둘 것 (안 그러면 업로드가 실패한다).

DROP POLICY IF EXISTS "anon insert tool_calls"   ON tool_calls;
DROP POLICY IF EXISTS "anon read upload_cursor"   ON upload_cursor;
DROP POLICY IF EXISTS "anon insert upload_cursor" ON upload_cursor;
DROP POLICY IF EXISTS "anon update upload_cursor" ON upload_cursor;

-- 남은 정책 확인: "anon read tool_calls" 하나만 나와야 한다
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE tablename IN ('tool_calls', 'upload_cursor');
