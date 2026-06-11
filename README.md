# Claude Code Usage Dashboard

Claude Code의 도구 호출 로그(`~/.claude/projects/`)를 파싱해 Supabase에 업로드하고, 브라우저에서 대시보드로 시각화합니다.

## 구성

| 파일 | 역할 |
|------|------|
| `claude_usage_uploader.py` | JSONL 파싱 → Supabase 업로드 |
| `dashboard.html` | 브라우저 대시보드 (Supabase 직접 조회) |
| `supabase_schema.sql` | 테이블 및 RLS 정책 DDL |

## 빠른 시작

### 1. Supabase 프로젝트 생성

[supabase.com](https://supabase.com)에서 프로젝트를 만든 뒤, SQL Editor에서 `supabase_schema.sql`을 실행합니다.

### 2. 패키지 설치

```bash
pip3 install supabase python-dotenv
```

### 3. 환경 변수 설정

```bash
cp .env.example .env
```

`.env` 파일에 Supabase 크레덴셜을 입력합니다.

```env
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_KEY=your-anon-key-here
```

Project Settings → API에서 확인할 수 있습니다.

### 4. 업로더 실행

```bash
python3 claude_usage_uploader.py
```

`~/.claude/projects/` 하위의 모든 JSONL 파일을 스캔해 Supabase에 업로드합니다. 이미 처리한 줄은 커서로 기록해 중복 업로드를 방지합니다.

> **기존 사용자 — `model` 컬럼 추가 후 재업로드**: 비용 환산을 위해 `tool_calls`에 `model` 컬럼이 추가됐습니다. 이미 데이터를 올린 적이 있다면, SQL Editor에서 아래를 실행해 기존 데이터를 비우고(커서만 지우면 중복되므로 둘 다 비웁니다) 업로더를 한 번 다시 실행하세요.
>
> ```sql
> ALTER TABLE tool_calls ADD COLUMN IF NOT EXISTS model text;
> TRUNCATE tool_calls;
> TRUNCATE upload_cursor;
> ```

### 5. 대시보드 열기

`dashboard.html` 상단의 `// ── 설정 ──` 블록에 동일한 크레덴셜을 입력합니다.

```js
const SUPABASE_URL = 'https://your-project-id.supabase.co';
const SUPABASE_KEY = 'your-anon-key-here';
```

이후 `dashboard.html`을 브라우저에서 바로 열면 됩니다 (서버 불필요).

## 대시보드 기능

- **기간 필터**: 전체 / 일간 / 주간 / 월간
- **기기 필터**: 여러 기기에서 업로드한 데이터를 기기별로 구분
- **라이트/다크 모드**: 헤더의 🌙/☀️ 토글로 전환, 선택은 브라우저에 저장됨
- **요약 카드** (각 카드에 한 줄 설명 포함): 작업 실행 횟수 · 입력량 · 출력량 · 재활용한 분량(캐시) · 예상 비용(USD) · 캐시 효율(히트율) · 스킬 사용 · 외부 연동(MCP) 사용 · 작업 1건당 평균 비용 · 가장 비쌌던 작업 · 지난주 대비 비용 · 아낀 비용(재활용) · 비싼 모델 비중
- **차트**
  - 사용량 추이 (라인)
  - 스킬 사용 순위 (바)
  - 플러그인별 스킬 사용 (바) — 스킬 이름의 `플러그인:스킬` 접두사로 묶음
  - 외부 연동(MCP) 사용 순위 (바, 서버별 펼침)
  - 보조 에이전트 사용 (바) — 종류 미지정 호출은 `미지정(기본 에이전트)`로 표기
  - 기본 도구 분포 (도넛)
  - 작업유형 분포 (도넛) — 코드편집·탐색·실행 등으로 분류
  - 비싼 작업 Top 10 (표) — 대화(세션) 단위 비용·분량·도구 호출 수
  - 작업유형별 비용 (수평 바) + 작업유형 추세 (스택 바)
  - 작업 리듬 히트맵 — 요일 × 시간대별 사용량
  - 프로젝트별 사용 분포 (수평 바)
  - 분량(토큰) 사용 추이 (스택 바)
  - 비용 추이 (라인) + 월말 예상 비용

> 토큰·비용·캐시 지표는 한 메시지의 여러 도구 호출이 중복 계상되지 않도록 `(session_id, timestamp)` 단위로 합산합니다. 비용은 모델별 단가표(Opus $5/$25, Sonnet $3/$15, Haiku $1/$5 per 1M; 캐시 쓰기 ×1.25, 읽기 ×0.1)로 환산하며, 모델을 알 수 없는 행은 Opus 단가로 보수적으로 추정합니다.

## PDF 내보내기

Node.js + Playwright로 PDF를 생성할 수 있습니다.

```bash
npm install playwright-chromium
```

```js
// export_pdf.cjs
const { chromium } = require('playwright-chromium');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('file:///path/to/dashboard.html', { waitUntil: 'networkidle' });
  await page.click('button[data-period="month"]'); // 월간 탭
  await page.waitForTimeout(3000);
  await page.pdf({ path: 'dashboard.pdf', format: 'A3', landscape: true, printBackground: true });
  await browser.close();
})();
```

```bash
node export_pdf.cjs
```

## 데이터 구조

### `tool_calls` 테이블

| 컬럼 | 설명 |
|------|------|
| `device_id` | 업로드한 기기의 hostname |
| `session_id` | Claude Code 세션 ID |
| `timestamp` | 도구 호출 시각 |
| `tool_category` | `skill` / `mcp` / `subagent` / `general` |
| `tool_name` | 원본 도구 이름 |
| `skill_name` | Skill 이름 (category=skill 시) |
| `mcp_server` | MCP 서버 이름 (category=mcp 시) |
| `mcp_tool` | MCP 도구 이름 (category=mcp 시) |
| `subagent_type` | 서브에이전트 유형 (category=subagent 시) |
| `project_name` | 프로젝트 이름 (경로 마지막 세그먼트) |
| `model` | 응답 모델 ID (비용 환산에 사용) |
| `input_tokens` | Input 토큰 수 |
| `output_tokens` | Output 토큰 수 |
| `cache_creation_tokens` | 캐시 생성 토큰 수 |
| `cache_read_tokens` | 캐시 읽기 토큰 수 |

### `upload_cursor` 테이블

파일별 마지막 처리 줄 번호를 저장해 재실행 시 신규 데이터만 업로드합니다.

## 참고

- 회사 네트워크 등 SSL 인터셉션 환경에서는 `truststore` 패키지를 설치하면 자동으로 적용됩니다.
  ```bash
  pip3 install truststore
  ```
- Supabase anon key는 RLS 정책으로 보호됩니다. 개인 프로젝트 외 용도로 사용 시 정책을 강화하세요.
