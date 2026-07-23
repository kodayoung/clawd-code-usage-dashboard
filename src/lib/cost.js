// 모델별 단가 (per 1M tokens, [input, output]) — 2026-06 기준
const PRICING = { opus: [5, 25], sonnet: [3, 15], haiku: [1, 5] };

export function priceFor(model) {
  const m = (model || '').toLowerCase();
  if (m.includes('haiku'))  return PRICING.haiku;
  if (m.includes('sonnet')) return PRICING.sonnet;
  if (m.includes('opus'))   return PRICING.opus;
  return PRICING.opus; // 미매칭 모델은 Opus로 보수적 추정
}

export function isUnknownModel(model) {
  const m = (model || '').toLowerCase();
  return !(m.includes('haiku') || m.includes('sonnet') || m.includes('opus'));
}

// 캐시 쓰기 = input×1.25, 캐시 읽기 = input×0.1
export function costOf(rec) {
  const [pin, pout] = priceFor(rec.model);
  return (rec.input_tokens * pin + rec.output_tokens * pout
    + rec.cache_creation_tokens * pin * 1.25 + rec.cache_read_tokens * pin * 0.1) / 1e6;
}

// 메시지 단위 dedupe: 한 assistant 메시지의 tool_use가 여러 개면 동일 토큰이 행마다 복제되어
// 있으므로 (session_id, timestamp)로 묶어 토큰·비용·캐시는 메시지당 1회만 집계한다.
export function messageRecords(rows) {
  const seen = new Map();
  for (const r of rows) {
    const key = r.session_id + '|' + r.timestamp;
    if (!seen.has(key)) seen.set(key, r);
  }
  return [...seen.values()];
}

// 세션(작업) 단위 집계: session_id별 비용·분량·도구 호출 수·시작시각·프로젝트.
// 비용/분량은 메시지 단위(dedupe), 도구 호출 수는 행 단위로 센다.
export function sessionAgg(rows) {
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

// 기기 필터만 적용한 전체 데이터(base)에서 [start, end) 구간의 메시지 단위 총비용(USD)
export function costInRange(base, start, end) {
  const rows = base.filter(r => {
    const t = new Date(r.timestamp);
    return t >= start && t < end;
  });
  return messageRecords(rows).reduce((s, r) => s + costOf(r), 0);
}
