# 사용량 대시보드 확장: 비용 / 캐시 효율 / 작업유형

작성일: 2026-06-07 · oh-my-hi 레퍼런스 분석에서 도출

## 배경
oh-my-hi(같은 도메인 플러그인) 분석 결과, 우리 스택(Python 업로더 → Supabase → 정적 dashboard.html)에
바로 반영할 가치가 높은 3가지를 이식한다. 헬스 스코어·회귀 탐지·지연 분석은 이번 범위 제외.

## 공통 선결 사항: 토큰 메시지 단위 집계 (버그 수정)
- **문제**: 업로더는 assistant 메시지 1개에 tool_use가 N개면 동일 토큰 값을 가진 행 N개를 만든다
  (`claude_usage_uploader.py` parse_jsonl). 대시보드는 행마다 토큰을 합산해 N배 과다 계상.
- **수정**: dashboard.html에 `(session_id, timestamp)` 기준 dedupe 헬퍼를 추가해 "메시지 단위 레코드"를 만든다.
  - 토큰/비용/캐시 집계 → 메시지 단위
  - 도구 호출 수 집계 → 기존처럼 행 단위(정확함)

## 1. 비용 + 월말 예측 (스키마 + 업로더 + 대시보드)
- 스키마: `tool_calls`에 `model text` 컬럼 추가.
- 업로더: `msg.get("model")` 추출해 레코드에 포함.
- 재업로드: `tool_calls` + `upload_cursor` 전체 비우고 업로더 1회 재실행 (커서만 지우면 중복되므로 둘 다 비움).
- 단가표(2026-06 기준, per 1M):
  - opus 계열 input 5 / output 25, sonnet 3 / 15, haiku 1 / 5
  - 캐시 쓰기 = input 단가 × 1.25, 캐시 읽기 = input 단가 × 0.1
  - 모델 ID는 substring 매칭(opus/sonnet/haiku). 미매칭 → opus로 보수적 추정 + ⚠️ 표기.
- 메시지당 비용 = (in×price_in + out×price_out + cache_creation×price_in×1.25 + cache_read×price_in×0.1)/1e6
- UI: "예상 비용" 요약 카드, 비용 트렌드 차트, 월말 예상 비용(최근 7일 일평균 × 해당 월 총 일수).

## 2. 캐시 효율 (대시보드만)
- 캐시 히트율 카드 = cache_read / (cache_read + cache_creation + input) (메시지 단위 합).
- 캐시로 아낀 비용 = cache_read × price_in × 0.9 / 1e6.

## 3. 작업유형 분류 (대시보드만, 스키마 변경 없음)
- 이미 저장 중인 tool_name/tool_category에서 JS로 파생(`classify`).
- 카테고리: 코드편집(Edit/Write/MultiEdit/NotebookEdit) · 탐색읽기(Read/Grep/Glob/LS) · 실행(Bash) ·
  웹(WebFetch/WebSearch) · 계획(TodoWrite/ExitPlanMode) · 스킬(category=skill) · MCP(category=mcp) ·
  서브에이전트(category=subagent) · 기타.
- UI: 작업유형 분포 도넛 차트.

## 범위 / 변경 파일
- dashboard.html — 세 기능 전부 + dedupe 헬퍼
- claude_usage_uploader.py, supabase_schema.sql — model 컬럼
- README.md — model 컬럼/재업로드 안내
- 라이브러리 추가 없음(Chart.js 그대로)
