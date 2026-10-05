# Claude Code + Codex Usage Dashboard

Claude Code(`~/.claude/projects/`)와 Codex(`~/.codex/sessions/`, `~/.codex/archived_sessions/`)의 JSONL 로그를 Supabase에 업로드하고, 도구별·기기별·기간별로 사용량을 비교합니다.

## 구성

| 파일 | 역할 |
|------|------|
| `usage_uploader.py` | Claude Code + Codex 통합 수집 실행 |
| `claude_usage_uploader.py` | Claude 파서 및 공통 업로드 (기존 명령도 두 도구 수집) |
| `codex_usage_uploader.py` | Codex 도구 호출·토큰 이벤트 파서 및 Codex 전용 실행 |
| `index.html` | 브라우저에서 바로 여는 대시보드 (Supabase 직접 조회) |
| `src/` · `dev.html` | 대시보드 원본 코드와 개발용 화면 |
| `start.command` | 수정 중 화면을 확인하는 개발 서버 실행 (macOS) |
| `legacy/dashboard.html` | 구버전 단일 HTML 대시보드 (참고용 보존) |
| `supabase_schema.sql` | 테이블 및 RLS 정책 DDL |
| `supabase_add_codex.sql` | 기존 데이터/커서를 보존하는 Codex 스키마 확장 |
| `supabase_restrict_anon.sql` | 기존 DB에서 anon 쓰기 권한 회수 (1회 실행) |

> **`index.html`을 브라우저에서 직접 열면 됩니다.** 실행에 필요한 React와 차트 코드는 HTML 안에 포함되어 있으며, 인터넷으로 Supabase 데이터를 가져옵니다. 로컬 서버는 필요하지 않습니다.

## 빠른 시작

### 1. Supabase 프로젝트 생성

[supabase.com](https://supabase.com)에서 프로젝트를 만든 뒤, SQL Editor에서 `supabase_schema.sql`을 실행합니다.

기존 DB에는 `supabase_add_codex.sql`을 한 번 실행하세요. 기존 행은 `source='claude'`, `record_type='tool_call'`로 분류됩니다. 데이터를 삭제하거나 Claude 커서를 초기화할 필요가 없습니다.

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
python3 usage_uploader.py
```

두 도구의 로그를 모두 스캔합니다. 기존 예약 작업의 `python3 claude_usage_uploader.py` 명령도 이제 두 도구를 수집하므로 예약 명령을 바꿀 필요가 없습니다. 로그가 없는 도구는 파일 0개로 표시합니다. 실제 수집은 **로그가 저장된 PC에서** 실행해야 합니다.

```bash
python3 usage_uploader.py --source codex       # Codex만 수집
python3 usage_uploader.py --source claude      # Claude만 수집
python3 codex_usage_uploader.py                # Codex 전용 실행
python3 usage_uploader.py --dry-run            # DB 연결 없이 파싱 확인
python3 usage_uploader.py --codex-dir /path/to/.codex
```

Codex 홈 디렉터리는 `CODEX_HOME` 환경변수도 지원합니다. `--codex-dir`에는 `sessions` 폴더의 상위 디렉터리를 지정합니다. `--claude-dir`과 `--device-id`로 Claude 로그 경로와 기기 ID도 지정할 수 있습니다.

Claude는 기존 줄 커서를 유지합니다. Codex는 별도 커서와 이벤트 고유 키로 재실행, 업로드 재시도, 로그 아카이브 이동 시 중복을 방지합니다. 작성 중인 마지막 줄은 다음 실행에서 다시 처리하며, 업로드에 실패한 파일은 커서를 갱신하지 않습니다.

> **오래된 DB의 `model` 컬럼**: 컬럼이 없는 DB라면 아래를 먼저 실행하세요. 기존 행의 모델 미상 값은 대시보드에서 추정치로 안내합니다.
>
> ```sql
> ALTER TABLE tool_calls ADD COLUMN IF NOT EXISTS model text;
> ```

### 5. 대시보드 열기

**`index.html`을 더블클릭하거나 브라우저로 끌어다 놓으세요.** 로컬 서버를 띄우지 않아도 Supabase 데이터를 가져와 대시보드를 표시합니다. 데이터 조회에는 인터넷 연결이 필요합니다.

처음 연결하거나 Supabase 설정을 바꿀 때는 `.env`에 대시보드용 **공개 키**를 입력합니다. 업로더용 secret key를 넣지 마세요.

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_KEY=your-anon-key-here
```

그런 다음 아래 명령으로 `index.html`을 한 번 생성하세요. 이미 생성된 파일을 여는 데에는 Node.js나 서버가 필요하지 않습니다.

```bash
npm install
npm run build:standalone
```

`src/`의 화면 코드를 수정하거나 `.env`의 공개 설정을 변경한 뒤에도 `npm run build:standalone`을 실행하면 변경 사항이 `index.html`에 반영됩니다. 생성된 HTML에는 공개 URL과 anon 또는 publishable key만 포함됩니다. HTML 안에 사용 기록을 저장하지 않으므로 열 때마다 Supabase에서 데이터를 조회합니다.

#### 화면을 수정하면서 확인할 때 (선택)

수정 사항을 바로 확인하려면 개발 서버를 실행하세요. **`start.command`를 더블클릭**하거나 아래 명령을 사용하면 개발용 화면(`/dev.html`)이 열립니다. 서버를 끝내려면 터미널에서 `Ctrl+C`를 누릅니다.

```bash
npm run dev      # 개발용 화면을 브라우저에서 열기
npm run start    # 개발용 화면을 브라우저에서 열기
npm run build    # index.html 재생성 + 배포용 dist/index.html 생성
npm run preview  # 배포 결과 미리보기
```

Node.js가 필요하면 [nodejs.org](https://nodejs.org)에서 설치하세요. Vercel에서도 `VITE_SUPABASE_URL`과 `VITE_SUPABASE_KEY`를 환경 변수로 등록하면 빌드할 때 반영됩니다.

## 대시보드 기능

- **증분 로드 캐시**: 받은 행을 브라우저 IndexedDB에 저장하고, 이후에는 신규 행만 내려받아 Supabase egress를 절감. 서버에서 데이터를 지우거나 재업로드하면(행 수 불일치) 자동으로 전체를 다시 받아 캐시를 재구축
- **기간 필터**: 전체 / 일간 / 주간 / 월간
- **기기 필터**: 여러 기기에서 업로드한 데이터를 기기별로 구분
- **AI 도구 필터**: 전체 / Claude Code / Codex — 모든 차트·요약에 함께 적용
- **AI 도구별 비교**: 세션·도구 호출·전체 토큰·캐시 읽기·추론 토큰
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
  - 세션별 사용량 Top 10 (표) — 도구별 비용·전체 토큰·호출 수 (Codex 비용은 미산정)
  - 작업유형별 비용 (수평 바) + 작업유형 추세 (스택 바)
  - 작업 리듬 히트맵 — 요일 × 시간대별 사용량
  - 프로젝트별 사용 분포 (수평 바)
  - 분량(토큰) 사용 추이 (스택 바)
  - 비용 추이 (라인) + 월말 예상 비용

> Claude 토큰은 도구 호출이 있는 메시지를 `(source, device_id, session_id, timestamp)` 단위로 중복 제거해 합산합니다. Codex 데스크톱 앱 기록은 응답별 토큰 사용량(`token_usage_record`)과 완료된 도구 호출(`item_completed`)을 수집합니다. 같은 파일에 명령줄 형식의 기록도 있으면 앱 기록을 우선해 중복 집계를 막습니다. 명령줄 기록만 있는 파일은 누적 토큰(`token_count.info.total_token_usage`)의 증가분을 합산하며, 누적값이 같은 한도 갱신 기록은 제외합니다. 도구 호출이 없는 Codex 답변도 토큰에 포함됩니다. 캐시는 입력에 포함된 분량을 분리해 저장하며, 추론은 출력의 일부이므로 전체 토큰에 다시 더하지 않습니다. 도구 호출과 토큰 이벤트를 별도로 집계해 사용량 이벤트가 호출 횟수를 늘리지 않습니다.
>
> 비용 지표는 Claude 모델 단가표(Opus $5/$25, Sonnet $3/$15, Haiku $1/$5 per 1M; 캐시 쓰기 ×1.25, 읽기 ×0.1)를 사용합니다. **Codex 로그에는 청구 비용이 없어 비용·절감액·비용 예측에서 제외**하며, Codex만 선택하면 비용은 `미산정`으로 표시합니다. 토큰을 요금제 사용 한도 비율로 환산하지 않습니다. 사용량 이벤트가 없는 Codex 로그에서는 도구 호출만 집계됩니다. Codex 스킬은 별도 호출 이벤트가 없는 경우 추정하지 않습니다.

## 검증

```bash
npm test                 # 토큰 차분·증분 커서·재시도·부분 줄·혼합 통계 테스트
npm run test:standalone  # 단일 HTML 생성 및 공개 설정 검사
npm run build
```

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
| `session_id` | Claude Code 또는 Codex 세션 ID |
| `source` | `claude` / `codex` (기존 행은 `claude`) |
| `record_type` | `tool_call` / `usage` (Codex 토큰 이벤트는 `usage`) |
| `event_id` | Codex 이벤트 고유 키. 기기·도구별 중복 방지 |
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
| `reasoning_output_tokens` | Codex 출력 중 추론 토큰 수 (출력의 부분집합) |
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
