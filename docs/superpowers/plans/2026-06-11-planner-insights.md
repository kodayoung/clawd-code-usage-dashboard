# 기획자용 인사이트 대시보드 확장 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 개인 사용자/기획자가 "어떤 일을, 얼마에, 잘 쓰고 있나"를 판단할 수 있도록 `dashboard.html`에 작업(세션) 단위 뷰·작업유형 심화·작업 리듬 히트맵·변화/절감 요약을 추가한다.

**Architecture:** 단일 파일 `dashboard.html`만 수정한다. 스키마·업로더는 손대지 않고 기존 수집 데이터만 사용한다. 새 집계는 기존 dedupe 규칙(`messageRecords` = `session_id|timestamp` 단위)과 비용 함수(`costOf`)를 재사용하며, 차트는 기존 `makeChart`(Chart.js v4) 패턴을, 카드는 기존 `.summary`/`.card` 패턴을 따른다. 히트맵만 Chart.js에 기본 타입이 없어 경량 CSS grid DOM으로 구현한다.

**Tech Stack:** HTML + 바닐라 JS + Chart.js v4 + Supabase JS (모두 CDN, 기존 그대로). 빌드/번들 없음.

> **테스트 전략 메모:** 이 레포는 JS 테스트 러너가 없는 단일 HTML이다(스펙의 "검증은 브라우저 수동 확인" 참조). 따라서 순수 헬퍼 함수 1개(`sessionAgg`, Task 1)만 브라우저 콘솔 assertion으로 검증하고, 렌더 작업은 브라우저 육안 검증 단계를 둔다. 새 테스트 하네스를 도입하지 않는다(YAGNI, 기존 패턴 준수).

> **검증 공통 절차:** "브라우저에서 연다"는 매번 `open dashboard.html` (macOS) 또는 파일을 더블클릭해 기본 브라우저로 여는 것을 뜻한다. 서버 불필요. 콘솔은 개발자도구(⌥⌘I)의 Console 탭.

---

## 파일 구조

- 수정: `dashboard.html` (유일한 코드 변경 대상)
  - `<style>` 내부: 히트맵 grid 스타일 추가.
  - `.summary` 블록: 신규 카드 5개 추가.
  - `<template id="charts-tpl">`: ① 세션 표 패널, ② 작업유형 비용/추세 패널, ③ 히트맵 패널 추가.
  - `<script>`: 헬퍼 `sessionAgg` 추가, `renderAll`에 신규 렌더 코드/호출 추가, 렌더 함수 `renderSessions`·`renderWorktypeDetail`·`renderHeatmap` 추가.
- 수정: `README.md` (구현 후 기능 목록 갱신, Task 7)

각 신규 렌더 함수는 하나의 블록만 책임진다(세션/작업유형/히트맵). `renderAll`은 기존처럼 오케스트레이션만 한다.

---

## Task 1: 세션(작업) 단위 집계 헬퍼 `sessionAgg`

세션별 비용·분량·도구 호출 수·시작시각·프로젝트를 묶는 순수 함수. 비용/분량은 메시지 단위(dedupe), 도구 호출 수는 행 단위.

**Files:**
- Modify: `dashboard.html` — `messageRecords` 함수 정의 바로 뒤(`classify` 함수 앞)에 추가.

- [ ] **Step 1: 헬퍼 함수 추가**

`dashboard.html`에서 아래 텍스트(=`messageRecords`의 닫는 줄)를 찾는다:

```js
  return [...seen.values()];
}
```

그 블록 **뒤에** 다음을 삽입한다:

```js
// 세션(작업) 단위 집계: session_id별 비용·분량·도구 호출 수·시작시각·프로젝트.
// 비용/분량은 메시지 단위(dedupe), 도구 호출 수는 행 단위로 센다.
function sessionAgg(rows) {
  const agg = {};
  for (const r of messageRecords(rows)) {
    if (!agg[r.session_id]) {
      agg[r.session_id] = { cost: 0, tokens: 0, calls: 0, first: r.timestamp, project: r.project_name || 'unknown' };
    }
    const s = agg[r.session_id];
    s.cost += costOf(r);
    s.tokens += r.input_tokens + r.output_tokens;
    if (r.timestamp < s.first) s.first = r.timestamp;
  }
  for (const r of rows) {
    if (agg[r.session_id]) agg[r.session_id].calls += 1;
  }
  return agg;
}
```

- [ ] **Step 2: 콘솔 assertion으로 동작 검증**

브라우저에서 `dashboard.html`을 열고 콘솔에 아래를 붙여넣어 실행한다(데이터 로딩 후, 즉 화면에 차트가 보일 때):

```js
(() => {
  const rows = [
    // 세션 A: 같은 (session,timestamp) 두 행 = tool_use 2개 → 메시지 1개로 dedupe, 호출 수는 2
    { session_id: 'A', timestamp: '2026-06-01T10:00:00Z', model: 'opus', input_tokens: 100, output_tokens: 50, cache_creation_tokens: 0, cache_read_tokens: 0, project_name: 'proj1' },
    { session_id: 'A', timestamp: '2026-06-01T10:00:00Z', model: 'opus', input_tokens: 100, output_tokens: 50, cache_creation_tokens: 0, cache_read_tokens: 0, project_name: 'proj1' },
    // 세션 A: 더 이른 메시지 → first 갱신 확인
    { session_id: 'A', timestamp: '2026-06-01T09:00:00Z', model: 'opus', input_tokens: 10, output_tokens: 0, cache_creation_tokens: 0, cache_read_tokens: 0, project_name: 'proj1' },
    // 세션 B
    { session_id: 'B', timestamp: '2026-06-02T10:00:00Z', model: 'sonnet', input_tokens: 1000, output_tokens: 200, cache_creation_tokens: 0, cache_read_tokens: 0, project_name: 'proj2' },
  ];
  const a = sessionAgg(rows);
  console.assert(Object.keys(a).length === 2, 'FAIL: 세션 수는 2여야 함');
  console.assert(a.A.calls === 3, 'FAIL: A 도구 호출 수는 3(행 기준)');
  console.assert(a.A.tokens === 160, 'FAIL: A 분량은 160(메시지 단위 dedupe: 150 + 10, 중복 150 1회만) → 실제 ' + a.A.tokens);
  console.assert(a.A.first === '2026-06-01T09:00:00Z', 'FAIL: A first는 가장 이른 시각');
  console.assert(a.B.project === 'proj2', 'FAIL: B 프로젝트');
  console.log('sessionAgg OK', a);
})();
```

Expected: 콘솔에 `sessionAgg OK`와 객체만 찍히고, `FAIL:` 메시지가 하나도 없어야 한다.

- [ ] **Step 3: 커밋**

```bash
git add dashboard.html
git commit -m "feat(dashboard): add sessionAgg helper for per-session aggregation"
```

---

## Task 2: ① 작업(세션) 단위 뷰 — 카드 2개 + 비싼 작업 Top 10 표

**Files:**
- Modify: `dashboard.html` — `.summary` 카드 추가, `charts-tpl`에 표 패널 추가, `renderAll`에 `renderSessions(data)` 호출 추가, `renderSessions` 함수 추가.

- [ ] **Step 1: 요약 카드 2개 추가**

`.summary` 블록에서 아래 줄(외부 연동 카드, 마지막 카드)을 찾는다:

```html
  <div class="card"><div class="card-label">외부 연동(MCP) 사용</div><div class="card-value" id="s-mcp">-</div><div class="card-desc">외부 도구 연동(MCP)을 호출한 횟수</div></div>
```

그 **뒤에** 다음 두 카드를 삽입한다:

```html
  <div class="card"><div class="card-label">작업 1건당 평균 비용</div><div class="card-value accent" id="s-cost-per-session">-</div><div class="card-desc">대화(작업) 한 건에 평균적으로 든 비용(USD)</div></div>
  <div class="card"><div class="card-label">가장 비쌌던 작업</div><div class="card-value accent2" id="s-top-session">-</div><div class="card-desc" id="s-top-session-desc">한 작업에서 가장 많이 든 비용(USD)</div></div>
```

- [ ] **Step 2: Top 10 표 패널을 템플릿에 추가**

`charts-tpl`에서 사용량 추이 패널이 끝나는 부분, 아래 텍스트를 찾는다:

```html
    <div class="chart-wrap"><canvas id="chart-trend"></canvas></div>
  </div>
</div>
```

그 **뒤에** 다음을 삽입한다:

```html
<div class="grid single">
  <div class="panel">
    <h2>비싼 작업 Top 10</h2>
    <p class="hint">대화(작업) 단위로 묶어 비용이 큰 작업을 보여줍니다. "이 작업 하나에 얼마 들었지?"를 확인하세요.</p>
    <table id="tbl-sessions"><tr><th>날짜</th><th>프로젝트</th><th>비용</th><th>주고받은 분량</th><th>도구 호출</th></tr></table>
  </div>
</div>
```

- [ ] **Step 3: `renderSessions` 함수 추가**

`renderProjection` 함수 정의 **앞에** 다음을 삽입한다(아래 텍스트를 찾아 그 앞에 넣는다):

찾을 텍스트:

```js
// 최근 7일 일평균 비용으로 이번 달 총비용을 외삽
function renderProjection() {
```

삽입할 코드(찾은 텍스트 바로 앞):

```js
// ① 작업(세션) 단위 뷰 — 평균/최고 비용 카드 + 비싼 작업 Top 10 표
function renderSessions(data) {
  const agg = sessionAgg(data);
  const sessions = Object.values(agg);
  const sessionCount = sessions.length;
  const totalCost = sessions.reduce((s, x) => s + x.cost, 0);
  const avg = sessionCount > 0 ? totalCost / sessionCount : 0;
  document.getElementById('s-cost-per-session').textContent = sessionCount > 0 ? fmtCost(avg) : '-';

  const sorted = sessions.sort((a, b) => b.cost - a.cost);
  const top = sorted[0];
  document.getElementById('s-top-session').textContent = top ? fmtCost(top.cost) : '-';
  document.getElementById('s-top-session-desc').textContent =
    top ? `가장 비쌌던 작업 (${top.project})` : '한 작업에서 가장 많이 든 비용(USD)';

  const rows = sorted.slice(0, 10);
  const tbl = document.getElementById('tbl-sessions');
  const head = '<tr><th>날짜</th><th>프로젝트</th><th>비용</th><th>주고받은 분량</th><th>도구 호출</th></tr>';
  if (rows.length === 0) {
    tbl.innerHTML = head + '<tr><td colspan="5" style="color:var(--muted)">데이터 없음</td></tr>';
    return;
  }
  tbl.innerHTML = head + rows.map(s =>
    `<tr><td>${new Date(s.first).toLocaleDateString('ko-KR')}</td>` +
    `<td>${s.project}</td>` +
    `<td>${fmtCost(s.cost)}</td>` +
    `<td>${fmt(s.tokens)}</td>` +
    `<td>${s.calls}</td></tr>`
  ).join('');
}
```

- [ ] **Step 4: `renderAll`에서 호출**

`renderAll` 끝부분에서 아래 텍스트를 찾는다:

```js
  // 월말 예상 비용 — 기기 필터만 적용한 전체 데이터의 최근 7일 일평균 × 이번 달 일수
  renderProjection();
}
```

이를 다음으로 교체한다:

```js
  // ① 작업(세션) 단위 뷰
  renderSessions(data);

  // 월말 예상 비용 — 기기 필터만 적용한 전체 데이터의 최근 7일 일평균 × 이번 달 일수
  renderProjection();
}
```

- [ ] **Step 5: 브라우저 검증**

`dashboard.html`을 브라우저에서 연다. 확인:
1. 요약 카드에 "작업 1건당 평균 비용", "가장 비쌌던 작업"이 보이고 값이 `$`로 표시된다(`-`가 아님, 데이터가 있다면).
2. "비싼 작업 Top 10" 표가 비용 내림차순으로 최대 10행 보인다.
3. 상단 기간 탭(전체/일간/주간/월간)을 바꾸면 표/카드가 함께 갱신된다.
4. 콘솔에 에러가 없다.

- [ ] **Step 6: 커밋**

```bash
git add dashboard.html
git commit -m "feat(dashboard): add per-session view (avg/top cost cards + top-10 table)"
```

---

## Task 3: ② 작업유형 심화 — 유형별 비용 바 + 유형 추세 스택

기존 작업유형 도넛(`chart-worktype`)은 그대로 두고 두 차트를 추가한다. 유형별 비용은 메시지 단위 비용을 대표 행(dedupe 후 첫 행)의 작업유형에 귀속한다(근사). 유형 추세는 기존 도넛과 동일하게 행(도구 호출) 단위 구성으로 그린다.

**Files:**
- Modify: `dashboard.html` — `charts-tpl`에 2-칸 grid 패널 추가, `renderAll`에 `renderWorktypeDetail(data)` 호출 추가, `renderWorktypeDetail` 함수 추가.

- [ ] **Step 1: 템플릿에 패널 2개 추가**

`charts-tpl`에서 작업유형 도넛 패널이 끝나고 2-칸 grid가 닫히는 부분을 찾는다:

```html
  <div class="panel">
    <h2>작업유형 분포</h2>
    <p class="hint">작업을 코드편집·탐색·실행 등 종류별로 묶어 비중을 보여줍니다.</p>
    <div class="chart-wrap"><canvas id="chart-worktype"></canvas></div>
  </div>
</div>
```

이를 다음으로 교체한다(닫는 `</div>` 뒤에 새 grid 추가):

```html
  <div class="panel">
    <h2>작업유형 분포</h2>
    <p class="hint">작업을 코드편집·탐색·실행 등 종류별로 묶어 비중을 보여줍니다.</p>
    <div class="chart-wrap"><canvas id="chart-worktype"></canvas></div>
  </div>
</div>
<div class="grid">
  <div class="panel">
    <h2>작업유형별 비용</h2>
    <p class="hint">어떤 종류의 작업에 비용이 가장 많이 들었는지 보여줍니다(USD).</p>
    <div class="chart-wrap"><canvas id="chart-worktype-cost"></canvas></div>
  </div>
  <div class="panel">
    <h2>작업유형 추세</h2>
    <p class="hint">시간에 따라 작업 종류 구성이 어떻게 변했는지 보여줍니다(작업 실행 횟수 기준).</p>
    <div class="chart-wrap"><canvas id="chart-worktype-trend"></canvas></div>
  </div>
</div>
```

- [ ] **Step 2: `renderWorktypeDetail` 함수 추가**

`renderSessions` 함수 정의 **뒤에**(즉 `renderProjection` 앞, Task 2에서 추가한 블록 뒤) 다음을 삽입한다:

```js
// ② 작업유형 심화 — 유형별 비용(메시지 단위, 대표 행 귀속) + 유형 추세(행 단위 구성)
function renderWorktypeDetail(data) {
  const tc = themeColors();

  // 유형별 비용: 메시지 대표 행의 작업유형에 메시지 비용을 귀속(근사)
  const costMap = {};
  messageRecords(data).forEach(r => {
    const k = classify(r);
    costMap[k] = (costMap[k] || 0) + costOf(r);
  });
  const costSorted = Object.entries(costMap).sort((a, b) => b[1] - a[1]);
  makeChart('chart-worktype-cost', 'bar',
    costSorted.map(([k]) => k),
    [{ label: '비용(USD)', data: costSorted.map(([, v]) => +v.toFixed(4)), backgroundColor: COLORS.slice(0, costSorted.length) }],
    {
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: tc.muted, font: { size: 10 } }, grid: { color: tc.grid } },
        y: { ticks: { color: tc.muted, font: { size: 10 } }, grid: { color: tc.grid } },
      },
    }
  );

  // 유형 추세: periodKey 버킷별 × 작업유형별 행 수(구성). 기존 도넛과 동일 분류 기준.
  const types = [...new Set(data.map(r => classify(r)))];
  const buckets = {};
  data.forEach(r => {
    const k = periodKey(r.timestamp);
    if (!buckets[k]) buckets[k] = {};
    const t = classify(r);
    buckets[k][t] = (buckets[k][t] || 0) + 1;
  });
  const keys = Object.keys(buckets).sort();
  const datasets = types.map((t, i) => ({
    label: t,
    data: keys.map(k => buckets[k][t] || 0),
    backgroundColor: COLORS[i % COLORS.length] + 'cc',
    stack: 'a',
  }));
  makeChart('chart-worktype-trend', 'bar', keys, datasets, {
    scales: {
      x: { stacked: true, ticks: { color: tc.muted, font: { size: 10 } }, grid: { color: tc.grid } },
      y: { stacked: true, ticks: { color: tc.muted, font: { size: 10 } }, grid: { color: tc.grid } },
    },
  });
}
```

- [ ] **Step 3: `renderAll`에서 호출**

`renderAll`에서 Task 2가 추가한 아래 텍스트를 찾는다:

```js
  // ① 작업(세션) 단위 뷰
  renderSessions(data);
```

그 **뒤에** 다음을 추가한다:

```js
  // ② 작업유형 심화
  renderWorktypeDetail(data);
```

- [ ] **Step 4: 브라우저 검증**

`dashboard.html`을 다시 연다(이미 열려 있으면 새로고침). 확인:
1. "작업유형별 비용"(수평 바)과 "작업유형 추세"(스택 막대) 두 패널이 작업유형 도넛 아래에 보인다.
2. 비용 바는 USD 값, 추세는 누적 막대로 표시된다.
3. 기간 탭 전환 시 함께 갱신된다.
4. 라이트/다크 토글 시 축 색이 테마를 따른다.
5. 콘솔 에러 없음.

- [ ] **Step 5: 커밋**

```bash
git add dashboard.html
git commit -m "feat(dashboard): add work-type cost bar and work-type trend chart"
```

---

## Task 4: ③ 작업 리듬 히트맵 (요일 × 시간대)

Chart.js에 히트맵 기본 타입이 없어 CSS grid DOM으로 구현한다. 셀 진하기 = 해당 칸의 작업 실행 횟수(행 단위).

**Files:**
- Modify: `dashboard.html` — `<style>`에 히트맵 스타일 추가, `charts-tpl`에 히트맵 패널 추가, `renderAll`에 `renderHeatmap(data)` 호출, `renderHeatmap` 함수 추가.

- [ ] **Step 1: CSS 추가**

`<style>` 닫기 직전, 아래 텍스트를 찾는다:

```css
  @media (max-width: 768px) { .grid { grid-template-columns: 1fr; } header { padding: 16px; } .summary, .grid { padding-left: 16px; padding-right: 16px; } }
</style>
```

그 텍스트의 `@media` 줄 **앞에** 다음을 삽입한다(즉 `</style>` 위, `@media` 위):

```css
  .heatmap { display: grid; grid-template-columns: 32px repeat(24, 1fr); gap: 2px; font-size: 0.62rem; }
  .heatmap .hm-cell { aspect-ratio: 1; border-radius: 2px; background: var(--surface2); }
  .heatmap .hm-label { color: var(--muted); display: flex; align-items: center; justify-content: center; }
  .heatmap .hm-col { color: var(--muted); text-align: center; }
```

- [ ] **Step 2: 템플릿에 히트맵 패널 추가**

`charts-tpl`에서 Task 3이 추가한 "작업유형 추세" 패널과 그 grid가 닫히는 부분을 찾는다:

```html
  <div class="panel">
    <h2>작업유형 추세</h2>
    <p class="hint">시간에 따라 작업 종류 구성이 어떻게 변했는지 보여줍니다(작업 실행 횟수 기준).</p>
    <div class="chart-wrap"><canvas id="chart-worktype-trend"></canvas></div>
  </div>
</div>
```

그 **뒤에** 다음을 삽입한다:

```html
<div class="grid single">
  <div class="panel">
    <h2>작업 리듬 (요일 × 시간대)</h2>
    <p class="hint">언제 집중적으로 작업했는지 보여줍니다. 색이 진할수록 그 시간대에 더 많이 썼다는 뜻입니다.</p>
    <div id="heatmap" class="heatmap"></div>
  </div>
</div>
```

- [ ] **Step 3: `renderHeatmap` 함수 추가**

`renderWorktypeDetail` 함수 정의 **뒤에**(`renderProjection` 앞) 다음을 삽입한다:

```js
// ③ 작업 리듬 히트맵 — 요일(0=일)×시간대(0~23), 셀 진하기 = 작업 실행 횟수(행 단위)
function renderHeatmap(data) {
  const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
  const counts = Array.from({ length: 7 }, () => new Array(24).fill(0));
  let max = 0;
  data.forEach(r => {
    const d = new Date(r.timestamp);
    const c = ++counts[d.getDay()][d.getHours()];
    if (c > max) max = c;
  });

  const el = document.getElementById('heatmap');
  if (!el) return;
  let html = '<div class="hm-label"></div>';
  for (let h = 0; h < 24; h++) html += `<div class="hm-col">${h % 6 === 0 ? h : ''}</div>`;
  for (let day = 0; day < 7; day++) {
    html += `<div class="hm-label">${DAYS[day]}</div>`;
    for (let h = 0; h < 24; h++) {
      const v = counts[day][h];
      const alpha = max > 0 && v > 0 ? (0.12 + 0.88 * (v / max)).toFixed(3) : 0;
      const style = v > 0 ? ` style="background:rgba(124,110,255,${alpha})"` : '';
      html += `<div class="hm-cell"${style} title="${DAYS[day]} ${h}시 · ${v}회"></div>`;
    }
  }
  el.innerHTML = html;
}
```

- [ ] **Step 4: `renderAll`에서 호출**

`renderAll`에서 Task 3이 추가한 아래 텍스트를 찾는다:

```js
  // ② 작업유형 심화
  renderWorktypeDetail(data);
```

그 **뒤에** 다음을 추가한다:

```js
  // ③ 작업 리듬 히트맵
  renderHeatmap(data);
```

- [ ] **Step 5: 브라우저 검증**

`dashboard.html`을 새로고침. 확인:
1. "작업 리듬 (요일 × 시간대)" 패널에 7행×24열 격자가 보인다.
2. 왼쪽에 요일(일~토), 위에 0/6/12/18 시간 눈금이 보인다.
3. 데이터가 많은 칸일수록 보라색이 진하다. 셀에 마우스를 올리면 "화 14시 · N회" 같은 툴팁이 뜬다.
4. 기간/기기 필터, 라이트/다크 토글 후에도 정상 표시.
5. 콘솔 에러 없음.

- [ ] **Step 6: 커밋**

```bash
git add dashboard.html
git commit -m "feat(dashboard): add weekday x hour activity heatmap"
```

---

## Task 5: ④ 변화·절감 요약 카드 3개

지난주 대비 비용 증감, 재활용으로 아낀 비용, 비싼 모델 비중. WoW는 기간 필터와 무관하게 항상 최근 7일 vs 그 전 7일 고정 기준(해석 일관성). 아낀 비용은 기존 `cost-note`의 절감액 공식을 재사용. 비싼 모델 비중은 Opus(및 미상→Opus 추정) 비용 비율.

**Files:**
- Modify: `dashboard.html` — `.summary` 카드 3개 추가, 헬퍼 `costInRange` 추가, `renderAll`에 카드 채우는 코드 추가.

- [ ] **Step 1: 요약 카드 3개 추가**

`.summary` 블록에서 Task 2가 추가한 "가장 비쌌던 작업" 카드를 찾는다:

```html
  <div class="card"><div class="card-label">가장 비쌌던 작업</div><div class="card-value accent2" id="s-top-session">-</div><div class="card-desc" id="s-top-session-desc">한 작업에서 가장 많이 든 비용(USD)</div></div>
```

그 **뒤에** 다음 세 카드를 삽입한다:

```html
  <div class="card"><div class="card-label">지난주 대비 비용</div><div class="card-value accent3" id="s-wow">-</div><div class="card-desc">최근 7일 비용을 그 전 7일과 비교한 증감입니다</div></div>
  <div class="card"><div class="card-label">아낀 비용(재활용)</div><div class="card-value accent4" id="s-saved">-</div><div class="card-desc">맥락을 재활용(캐시)해 절약한 추정 비용(USD)</div></div>
  <div class="card"><div class="card-label">비싼 모델 비중</div><div class="card-value" id="s-opus-share">-</div><div class="card-desc">전체 비용 중 고가 모델(Opus·모델 미상 포함)이 차지하는 비율</div></div>
```

- [ ] **Step 2: `costInRange` 헬퍼 추가**

`sessionAgg` 함수 정의 **뒤에**(Task 1에서 추가한 블록 뒤) 다음을 삽입한다:

```js
// 기기 필터만 적용한 전체 데이터에서 [start, end) 구간의 메시지 단위 총비용(USD)
function costInRange(start, end) {
  const base = deviceFilter ? allData.filter(r => r.device_id === deviceFilter) : allData;
  const rows = base.filter(r => {
    const t = new Date(r.timestamp);
    return t >= start && t < end;
  });
  return messageRecords(rows).reduce((s, r) => s + costOf(r), 0);
}
```

- [ ] **Step 3: `renderAll`에 카드 채우는 코드 추가**

`renderAll`에서 기존 캐시 절감 안내 블록을 찾는다:

```js
  // 캐시 절감 비용 + 미매칭 모델 안내
  const cacheSaved = cacheRead * priceFor('opus')[0] * 0.9 / 1e6; // 보수적: opus 단가 기준 표시용
  const unknownCnt = msgs.filter(r => isUnknownModel(r.model)).length;
```

그 블록의 `const unknownCnt ...` 줄 **뒤에** 다음을 삽입한다:

```js

  // ④ 변화·절감 요약 카드
  // 지난주 대비: 최근 7일 vs 그 전 7일 (기간 필터와 무관한 고정 기준)
  const now = new Date();
  const d7 = 7 * 86400000;
  const curWeek = costInRange(new Date(now.getTime() - d7), new Date(now.getTime() + 1));
  const prevWeek = costInRange(new Date(now.getTime() - 2 * d7), new Date(now.getTime() - d7));
  const wowEl = document.getElementById('s-wow');
  if (prevWeek <= 0) {
    wowEl.textContent = '비교 데이터 없음';
  } else {
    const pct = (curWeek - prevWeek) / prevWeek * 100;
    wowEl.textContent = (pct >= 0 ? '▲ ' : '▼ ') + Math.abs(pct).toFixed(0) + '%';
  }
  // 아낀 비용(재활용): 기존 cacheSaved 공식 재사용
  document.getElementById('s-saved').textContent = fmtCost(cacheSaved);
  // 비싼 모델 비중: Opus + 미상(→Opus 추정) 비용 / 전체 비용
  const opusCost = msgs
    .filter(r => (r.model || '').toLowerCase().includes('opus') || isUnknownModel(r.model))
    .reduce((s, r) => s + costOf(r), 0);
  document.getElementById('s-opus-share').textContent =
    totalCost > 0 ? (opusCost / totalCost * 100).toFixed(0) + '%' : '-';
```

> 주의: 이 블록은 `renderAll` 안에서 `cacheRead`, `msgs`, `totalCost`, `isUnknownModel`, `costOf`가 모두 정의된 위치(요약 카드 계산 이후, `renderProjection` 호출 이전)에 있어야 한다. 위 앵커(`const unknownCnt` 직후)가 그 조건을 만족한다.

- [ ] **Step 4: 브라우저 검증**

`dashboard.html`을 새로고침. 확인:
1. 요약 카드에 "지난주 대비 비용"(▲/▼ %  또는 "비교 데이터 없음"), "아낀 비용(재활용)"($), "비싼 모델 비중"(%)이 보인다.
2. "아낀 비용" 값이 비용 추이 패널 아래 안내문("캐시로 약 $X 절감")의 금액과 일치한다.
3. 기기 필터를 바꾸면 "지난주 대비"가 갱신된다.
4. 콘솔 에러 없음.

- [ ] **Step 5: 커밋**

```bash
git add dashboard.html
git commit -m "feat(dashboard): add WoW cost, cache savings, and expensive-model share cards"
```

---

## Task 6: 전체 회귀 검증 (수동)

**Files:** 없음(검증만).

- [ ] **Step 1: 빈/경계 데이터 시나리오 확인**

브라우저 콘솔에서 기간을 '일간'으로 두고(데이터가 적은 구간), 그리고 데이터가 거의 없는 기기를 선택해 다음을 확인:
1. 카드들이 `-` 또는 "비교 데이터 없음"으로 깨지지 않고 표시된다.
2. "비싼 작업 Top 10" 표가 비었을 때 "데이터 없음" 행을 보여준다.
3. 히트맵이 전부 빈 칸이어도 격자/레이블은 정상 표시된다.
4. 콘솔에 예외가 없다.

- [ ] **Step 2: dedupe vs 행 기준 구분 확인**

콘솔에서 다음을 실행해, 비용 계열(메시지 단위)과 도구 호출 수(행 단위)가 다르게 집계되는지 확인:

```js
(() => {
  const f = (typeof filtered === 'function') ? filtered() : allData;
  const agg = sessionAgg(f);
  const vals = Object.values(agg);
  const anyMulti = vals.find(s => s.calls > 1);
  console.log('세션 수:', vals.length, '| 멀티 호출 세션 예시:', anyMulti);
  console.assert(vals.every(s => s.calls >= 1), 'FAIL: 모든 세션 calls>=1');
  console.log('회귀 확인 OK');
})();
```

Expected: `회귀 확인 OK`가 찍히고 `FAIL` 없음. (멀티 호출 세션이 존재하면 calls가 메시지 수보다 큼 = dedupe가 비용에만 적용됨을 방증.)

- [ ] **Step 3: 라이트/다크 + 기간 전회전 스모크**

라이트/다크를 토글하고 전체/일간/주간/월간 탭을 차례로 눌러, 모든 신규 패널(세션 표·작업유형 비용/추세·히트맵)과 카드가 매번 갱신되고 색이 테마를 따르는지 확인. 콘솔 에러 없음.

---

## Task 7: README 기능 목록 갱신

**Files:**
- Modify: `README.md` — "대시보드 기능" 절.

- [ ] **Step 1: 요약 카드 목록 갱신**

`README.md`에서 아래 줄을 찾는다:

```markdown
- **요약 카드** (각 카드에 한 줄 설명 포함): 작업 실행 횟수 · 입력량 · 출력량 · 재활용한 분량(캐시) · 예상 비용(USD) · 캐시 효율(히트율) · 스킬 사용 · 외부 연동(MCP) 사용
```

이를 다음으로 교체한다:

```markdown
- **요약 카드** (각 카드에 한 줄 설명 포함): 작업 실행 횟수 · 입력량 · 출력량 · 재활용한 분량(캐시) · 예상 비용(USD) · 캐시 효율(히트율) · 스킬 사용 · 외부 연동(MCP) 사용 · 작업 1건당 평균 비용 · 가장 비쌌던 작업 · 지난주 대비 비용 · 아낀 비용(재활용) · 비싼 모델 비중
```

- [ ] **Step 2: 차트 목록에 신규 항목 추가**

`README.md` 차트 목록에서 아래 줄을 찾는다:

```markdown
  - 작업유형 분포 (도넛) — 코드편집·탐색·실행 등으로 분류
```

그 **뒤에** 다음 줄들을 삽입한다:

```markdown
  - 비싼 작업 Top 10 (표) — 대화(세션) 단위 비용·분량·도구 호출 수
  - 작업유형별 비용 (수평 바) + 작업유형 추세 (스택 바)
  - 작업 리듬 히트맵 — 요일 × 시간대별 사용량
```

- [ ] **Step 3: 커밋**

```bash
git add README.md
git commit -m "docs: document planner-oriented dashboard additions"
```

---

## 자가 검토 결과 (작성자 체크)

**스펙 커버리지:**
- ① 작업 단위 뷰(카드 2 + Top10 표) → Task 2 ✅
- ② 작업유형 심화(유형별 비용 + 추세) → Task 3 ✅
- ③ 작업 리듬 히트맵 → Task 4 ✅
- ④ 변화·절감(WoW + 아낀 비용 + 보조 비싼 모델 비중) → Task 5 ✅
- dedupe 규칙 준수: `sessionAgg`/비용 계열은 `messageRecords` 사용, 호출 수/히트맵/추세는 행 단위 → Task 1·3·4 ✅
- 스키마·업로더 무수정 → 어떤 Task도 `.py`/`.sql` 미수정 ✅
- 빈 데이터/직전기간 0/모델 미상 처리 → Task 2·5 코드 + Task 6 검증 ✅
- 평이한 언어 표기 → 모든 카드/힌트 한국어 평문 ✅

**플레이스홀더 스캔:** "TBD"/"적절히 처리" 등 없음. 모든 코드 단계에 실제 코드 포함 ✅

**타입/이름 일관성:** 헬퍼 `sessionAgg`·`costInRange`, 렌더 `renderSessions`·`renderWorktypeDetail`·`renderHeatmap`, DOM id `s-cost-per-session`·`s-top-session`·`s-top-session-desc`·`s-wow`·`s-saved`·`s-opus-share`·`tbl-sessions`·`chart-worktype-cost`·`chart-worktype-trend`·`heatmap` — Task 간 표기 일치 확인 ✅
