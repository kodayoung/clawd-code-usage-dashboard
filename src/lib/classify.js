// 도구 호출을 작업유형으로 분류 (tool_name/category 기반, 스키마 변경 불필요)
export function classify(r) {
  if (r.record_type === 'usage') return '모델 응답';
  if (r.tool_category === 'skill')    return '스킬';
  if (r.tool_category === 'mcp')      return 'MCP';
  if (r.tool_category === 'subagent') return '서브에이전트';
  const n = (r.tool_name || '').split('.').pop();
  if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'apply_patch'].includes(n)) return '코드편집';
  if (['Read', 'Grep', 'Glob', 'LS'].includes(n))                 return '탐색·읽기';
  if (['Bash', 'BashOutput', 'KillShell', 'exec_command', 'write_stdin', 'shell', 'shell_command'].includes(n)) return '실행';
  if (['WebFetch', 'WebSearch', 'web', 'web_search'].includes(n)) return '웹';
  if (['TodoWrite', 'ExitPlanMode', 'update_plan'].includes(n)) return '계획';
  return '기타';
}

// 선택된 기간의 [시작, 끝) 구간 — 현재 시각 기준 롤링 윈도우
// 일간=최근 1일, 주간=최근 7일, 월간=최근 30일
export function periodRange(period) {
  const now = new Date();
  const days = period === 'day' ? 1 : period === 'week' ? 7 : 30;
  return [new Date(now.getTime() - days * 86400000), new Date(now.getTime() + 1)];
}

// 트렌드 차트 묶음 단위: 전체=월별, 일간=시간별, 주간/월간=일별
export function periodKey(ts, period) {
  const d = new Date(ts);
  const p = n => String(n).padStart(2, '0');
  if (period === 'all') return `${d.getFullYear()}-${p(d.getMonth() + 1)}`;
  if (period === 'day') return `${p(d.getHours())}:00`;
  return `${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// 기기 필터만 적용한 전체(base)에서 기간 필터까지 적용한 행
export function filterRows(base, period) {
  if (period === 'all') return base;
  const [start, end] = periodRange(period);
  return base.filter(r => {
    const t = new Date(r.timestamp);
    return t >= start && t < end;
  });
}
