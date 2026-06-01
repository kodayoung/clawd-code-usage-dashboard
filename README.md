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

### 5. 대시보드 열기

`dashboard.html` 140~141번 줄에 동일한 크레덴셜을 입력합니다.

```js
const SUPABASE_URL = 'https://your-project-id.supabase.co';
const SUPABASE_KEY = 'your-anon-key-here';
```

이후 `dashboard.html`을 브라우저에서 바로 열면 됩니다 (서버 불필요).

## 대시보드 기능

- **기간 필터**: 전체 / 일간 / 주간 / 월간
- **기기 필터**: 여러 기기에서 업로드한 데이터를 기기별로 구분
- **요약 카드**: 총 도구 호출 수, Input/Output 토큰, 캐시 절감 토큰, Skill/MCP 호출 수
- **차트**
  - 사용량 트렌드 (라인)
  - Skill 호출 통계 (바)
  - MCP 도구 통계 (바, 서버별 펼침)
  - Sub-agent 사용 통계 (바)
  - 일반 도구 분포 (도넛)
  - 프로젝트별 사용 분포 (수평 바)
  - 토큰 사용량 추이 (스택 바)

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
