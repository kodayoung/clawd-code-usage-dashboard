import { useMemo } from 'react';
import { costOf, isUnknownModel, messageRecords, sessionAgg, costInRange } from '../lib/cost.js';
import { classify, periodKey, filterRows } from '../lib/classify.js';
import { fmt, fmtCost } from '../lib/format.js';

// base = 기기 필터만 적용한 전체 데이터, period = 'all'|'day'|'week'|'month'
// renderAll + renderSessions + renderWorktypeDetail + renderHeatmap + renderProjection 의 계산을
// 로직 변경 없이 한 곳으로 옮긴 것.
export function useMetrics(base, period) {
  return useMemo(() => {
    const data = filterRows(base, period);
    const msgs = messageRecords(data);
    const key = ts => periodKey(ts, period);

    // ── 요약 카드 ──
    const total = data.length;
    const inputTok  = msgs.reduce((s, r) => s + r.input_tokens, 0);
    const outputTok = msgs.reduce((s, r) => s + r.output_tokens, 0);
    const cacheRead = msgs.reduce((s, r) => s + r.cache_read_tokens, 0);
    const cacheCreate = msgs.reduce((s, r) => s + r.cache_creation_tokens, 0);
    const totalCost = msgs.reduce((s, r) => s + costOf(r), 0);
    const hitDenom  = cacheRead + cacheCreate + inputTok;
    const hitRate   = hitDenom > 0 ? cacheRead / hitDenom : 0;
    const skillCnt  = data.filter(r => r.tool_category === 'skill').length;
    const mcpCnt    = data.filter(r => r.tool_category === 'mcp').length;

    // ── 트렌드 ──
    const trendMap = {};
    data.forEach(r => { const k = key(r.timestamp); trendMap[k] = (trendMap[k] || 0) + 1; });
    const trendKeys = Object.keys(trendMap).sort();
    const trend = trendKeys.map(k => ({ label: k, value: trendMap[k] }));

    // ── 스킬 ──
    const skillMap = {};
    data.filter(r => r.tool_category === 'skill').forEach(r => {
      const k = r.skill_name || '(unknown)';
      skillMap[k] = (skillMap[k] || 0) + 1;
    });
    const skill = Object.entries(skillMap).sort((a, b) => b[1] - a[1]).slice(0, 12)
      .map(([name, count]) => ({ name, count }));

    // ── 플러그인별 스킬 ──
    const pluginMap = {};
    data.filter(r => r.tool_category === 'skill').forEach(r => {
      const s = r.skill_name || '';
      const plugin = s.includes(':') ? s.split(':')[0] : '(내장 스킬)';
      pluginMap[plugin] = (pluginMap[plugin] || 0) + 1;
    });
    const plugin = Object.entries(pluginMap).sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));

    // ── MCP (서버 단위 + 도구별 펼침) ──
    const mcpServers = {};
    data.filter(r => r.tool_category === 'mcp').forEach(r => {
      const srv = r.mcp_server || '?';
      const tool = r.mcp_tool || '?';
      if (!mcpServers[srv]) mcpServers[srv] = { total: 0, tools: {} };
      mcpServers[srv].total += 1;
      mcpServers[srv].tools[tool] = (mcpServers[srv].tools[tool] || 0) + 1;
    });
    const mcpSorted = Object.entries(mcpServers).sort((a, b) => b[1].total - a[1].total)
      .map(([server, info]) => ({
        server,
        total: info.total,
        tools: Object.entries(info.tools).sort((a, b) => b[1] - a[1]).map(([tool, count]) => ({ tool, count })),
      }));
    const mcp = { servers: mcpSorted, top: mcpSorted.slice(0, 12) };

    // ── 서브에이전트 ──
    const agentMap = {};
    data.filter(r => r.tool_category === 'subagent').forEach(r => {
      const k = r.subagent_type || '미지정(기본 에이전트)';
      agentMap[k] = (agentMap[k] || 0) + 1;
    });
    const subagent = Object.entries(agentMap).sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));

    // ── 일반 도구 (도넛) ──
    const genMap = {};
    data.filter(r => r.tool_category === 'general').forEach(r => {
      genMap[r.tool_name] = (genMap[r.tool_name] || 0) + 1;
    });
    const general = Object.entries(genMap).sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([name, value]) => ({ name, value }));

    // ── 프로젝트별 ──
    const projMap = {};
    data.forEach(r => { const k = r.project_name || 'unknown'; projMap[k] = (projMap[k] || 0) + 1; });
    const project = Object.entries(projMap).sort((a, b) => b[1] - a[1]).slice(0, 15)
      .map(([name, count]) => ({ name, count }));

    // ── 토큰 추이 (스택) ──
    const tokenMap = {};
    msgs.forEach(r => {
      const k = key(r.timestamp);
      if (!tokenMap[k]) tokenMap[k] = { input: 0, output: 0, cache_creation: 0, cache_read: 0 };
      tokenMap[k].input          += r.input_tokens;
      tokenMap[k].output         += r.output_tokens;
      tokenMap[k].cache_creation += r.cache_creation_tokens;
      tokenMap[k].cache_read     += r.cache_read_tokens;
    });
    const tokens = Object.keys(tokenMap).sort().map(k => ({ label: k, ...tokenMap[k] }));

    // ── 작업유형 분포 (도넛) ──
    const wtMap = {};
    data.forEach(r => { const k = classify(r); wtMap[k] = (wtMap[k] || 0) + 1; });
    const worktype = Object.entries(wtMap).sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }));

    // ── 비용 추이 ──
    const costMap = {};
    msgs.forEach(r => { const k = key(r.timestamp); costMap[k] = (costMap[k] || 0) + costOf(r); });
    const cost = Object.keys(costMap).sort().map(k => ({ label: k, value: +costMap[k].toFixed(4) }));

    // ── 캐시 절감 + 미매칭 모델 안내 ──
    const cacheSaved = cacheRead * 5 * 0.9 / 1e6; // 보수적: opus input 단가($5) 기준 표시용
    const unknownCnt = msgs.filter(r => isUnknownModel(r.model)).length;

    // ── 변화·절감 요약 카드 ──
    const now = new Date();
    const d7 = 7 * 86400000;
    const curWeek  = costInRange(base, new Date(now.getTime() - d7), new Date(now.getTime() + 1));
    const prevWeek = costInRange(base, new Date(now.getTime() - 2 * d7), new Date(now.getTime() - d7));
    let wow;
    if (prevWeek <= 0) {
      wow = '비교 데이터 없음';
    } else {
      const pct = (curWeek - prevWeek) / prevWeek * 100;
      wow = (pct >= 0 ? '▲ ' : '▼ ') + Math.abs(pct).toFixed(0) + '%';
    }
    const opusCost = msgs
      .filter(r => (r.model || '').toLowerCase().includes('opus') || isUnknownModel(r.model))
      .reduce((s, r) => s + costOf(r), 0);
    const opusShare = totalCost > 0 ? (opusCost / totalCost * 100).toFixed(0) + '%' : '-';

    const costNote = `캐시로 약 ${fmtCost(cacheSaved)} 절감(캐시 읽기 기준).`
      + (unknownCnt > 0 ? ` 모델 미상 메시지 ${unknownCnt}건은 Opus 단가로 추정.` : '');

    // ── 작업(세션) 단위 뷰 ──
    const sessions = Object.values(sessionAgg(data)).sort((a, b) => b.cost - a.cost);
    const sessionCount = sessions.length;
    const sessionTotalCost = sessions.reduce((s, x) => s + x.cost, 0);
    const avgCost = sessionCount > 0 ? sessionTotalCost / sessionCount : 0;
    const topSession = sessions[0] || null;
    const sessionRows = sessions.slice(0, 10);

    // ── 작업유형별 비용 ──
    const wtCostMap = {};
    msgs.forEach(r => { const k = classify(r); wtCostMap[k] = (wtCostMap[k] || 0) + costOf(r); });
    const worktypeCost = Object.entries(wtCostMap).sort((a, b) => b[1] - a[1])
      .map(([name, v]) => ({ name, value: +v.toFixed(4) }));

    // ── 작업유형 추세 (스택) ──
    const types = [...new Set(data.map(r => classify(r)))];
    const buckets = {};
    data.forEach(r => {
      const k = key(r.timestamp);
      if (!buckets[k]) buckets[k] = {};
      const t = classify(r);
      buckets[k][t] = (buckets[k][t] || 0) + 1;
    });
    const wtTrendKeys = Object.keys(buckets).sort();
    const worktypeTrend = {
      types,
      data: wtTrendKeys.map(k => ({ label: k, ...Object.fromEntries(types.map(t => [t, buckets[k][t] || 0])) })),
    };

    // ── 히트맵 (요일×시간) ──
    const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
    const counts = Array.from({ length: 7 }, () => new Array(24).fill(0));
    let hmMax = 0;
    data.forEach(r => {
      const d = new Date(r.timestamp);
      const c = ++counts[d.getDay()][d.getHours()];
      if (c > hmMax) hmMax = c;
    });
    const heatmap = { days: DAYS, counts, max: hmMax };

    // ── 월말 예상 비용 ──
    const weekAgo = new Date(now.getTime() - d7);
    const recent = messageRecords(base.filter(r => new Date(r.timestamp) >= weekAgo));
    let projection = '';
    if (recent.length > 0) {
      const days = new Set(recent.map(r => new Date(r.timestamp).toISOString().slice(0, 10)));
      const dailyAvg = recent.reduce((s, r) => s + costOf(r), 0) / Math.max(days.size, 1);
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const confident = days.size >= 5;
      projection = `월말 예상 ${fmtCost(dailyAvg * daysInMonth)}` + (confident ? '' : ' (표본 부족)');
    }

    return {
      summary: {
        total: fmt(total),
        input: fmt(inputTok),
        output: fmt(outputTok),
        cache: fmt(cacheRead),
        cost: fmtCost(totalCost),
        hit: (hitRate * 100).toFixed(0) + '%',
        skill: fmt(skillCnt),
        mcp: fmt(mcpCnt),
        costPerSession: sessionCount > 0 ? fmtCost(avgCost) : '-',
        topSession: topSession ? fmtCost(topSession.cost) : '-',
        topSessionDesc: topSession ? `가장 비쌌던 작업 (${topSession.project})` : '한 작업에서 가장 많이 든 비용(USD)',
        wow,
        saved: fmtCost(cacheSaved),
        opusShare,
      },
      trend, skill, plugin, mcp, subagent, general, project, tokens,
      worktype, cost, costNote, worktypeCost, worktypeTrend, heatmap,
      sessionRows, projection,
    };
  }, [base, period]);
}
