# Claude Code Usage Dashboard

Claude Code의 도구 호출 로그(`~/.claude/projects/`)를 파싱해 Supabase에 업로드하고, 브라우저에서 대시보드로 시각화합니다.

## 구성

| 파일 | 역할 |
|------|------|
| `claude_usage_uploader.py` | JSONL 파싱 → Supabase 업로드 |
| `src/` · `index.html` | React 대시보드 (Vite, Supabase 직접 조회) |
| `start.command` | 대시보드 원클릭 실행 (macOS, 더블클릭) |
| `legacy/dashboard.html` | 구버전 단일 HTML 대시보드 (참고용 보존) |
| `supabase_schema.sql` | 테이블 및 RLS 정책 DDL |
| `supabase_restrict_anon.sql` | 기존 DB에서 anon 쓰기 권한 회수 (1회 실행) |

> 대시보드는 **Vite + React + Recharts**로 작성되어 있으며, 로컬에서 실행합니다. 실행 방법은 아래 5번 참고.

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
SUPABASE_SECRET_KEY=your-secret-key-here
```

Project Settings → API Keys에서 확인할 수 있습니다. 업로더에는 **secret key**(`sb_secret_…`, 또는 legacy `service_role` key)를 넣습니다. anon key에는 쓰기 권한이 없습니다. secret key는 RLS를 우회하는 관리자 키이므로 `.env`에만 두고 절대 커밋하거나 대시보드(`VITE_`)에 넣지 마세요.

> **기존 사용자 — anon 쓰기 권한 회수**: 예전 스키마는 anon key로 쓰기까지 허용했습니다. `.env`에 `SUPABASE_SECRET_KEY`를 넣은 뒤, SQL Editor에서 `supabase_restrict_anon.sql`을 한 번 실행하세요. new API key를 쓰려면 `pip3 install -U supabase`로 최신 버전을 받으세요.

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

### 5. 대시보드 실행 (로컬)

`.env`에 대시보드용 크레덴셜(`VITE_` 접두사)을 함께 입력합니다.

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_KEY=your-anon-key-here
```

#### 원클릭 실행 (macOS, 권장)

Finder에서 **`start.command` 파일을 더블클릭**하세요. 최초 1회는 패키지를 자동 설치하고, 이후에는 서버를 띄우고 브라우저를 자동으로 엽니다. 종료하려면 열린 터미널 창에서 `Ctrl+C`를 누르거나 창을 닫습니다.

> 처음 더블클릭 시 "확인되지 않은 개발자" 경고가 뜨면, 파일을 **오른쪽 클릭 → 열기**로 한 번 실행하면 이후엔 그냥 더블클릭으로 열립니다. Node.js가 없으면 [nodejs.org](https://nodejs.org)에서 먼저 설치하세요.

#### 명령어로 직접 실행

```bash
npm install
npm run start    # 서버 실행 + 브라우저 자동 열기
npm run dev      # 서버만 실행 (http://localhost:5173)
npm run build    # dist/ 로 정적 빌드
npm run preview  # 빌드 결과 미리보기
```

## 대시보드 기능

- **증분 로드 캐시**: 받은 행을 브라우저 IndexedDB에 저장하고, 이후에는 신규 행만 내려받아 Supabase egress를 절감. 서버에서 데이터를 지우거나 재업로드하면(행 수 불일치) 자동으로 전체를 다시 받아 캐시를 재구축
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
  // 배포 URL 또는 로컬 미리보기(npm run preview) 주소
  await page.goto('https://your-dashboard.vercel.app', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '월간' }).click(); // 월간 탭
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
- 대시보드용 anon(publishable) key는 브라우저에 그대로 노출되는 공개 키입니다. RLS로 `tool_calls` 읽기만 허용하므로 키를 가진 누구나 사용 기록을 **읽을 수는** 있습니다. 읽기까지 막으려면 Supabase Auth 로그인을 붙이고 `authenticated` 역할에만 읽기를 허용하세요.
