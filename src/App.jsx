import { useMemo, useState } from 'react';
import { isConfigured } from './config.js';
import { useUsageData } from './hooks/useUsageData.js';
import { useMetrics } from './hooks/useMetrics.js';
import ConfigBanner from './components/ConfigBanner.jsx';
import Header from './components/Header.jsx';
import SummaryCards from './components/SummaryCards.jsx';
import TrendChart from './components/charts/TrendChart.jsx';
import SessionsTable from './components/charts/SessionsTable.jsx';
import SkillChart from './components/charts/SkillChart.jsx';
import PluginChart from './components/charts/PluginChart.jsx';
import McpChart from './components/charts/McpChart.jsx';
import SubagentChart from './components/charts/SubagentChart.jsx';
import GeneralDonut from './components/charts/GeneralDonut.jsx';
import WorktypeDonut from './components/charts/WorktypeDonut.jsx';
import WorktypeCost from './components/charts/WorktypeCost.jsx';
import WorktypeTrend from './components/charts/WorktypeTrend.jsx';
import Heatmap from './components/charts/Heatmap.jsx';
import CostChart from './components/charts/CostChart.jsx';
import ProjectChart from './components/charts/ProjectChart.jsx';
import TokensChart from './components/charts/TokensChart.jsx';

export default function App() {
  const configured = isConfigured();
  const { rows, lastUpdated, loading, error } = useUsageData();
  const [period, setPeriod] = useState('all');
  const [deviceFilter, setDeviceFilter] = useState('');

  const devices = useMemo(
    () => [...new Set(rows.map(r => r.device_id))].sort(),
    [rows]
  );
  const base = useMemo(
    () => (deviceFilter ? rows.filter(r => r.device_id === deviceFilter) : rows),
    [rows, deviceFilter]
  );
  const m = useMetrics(base, period);

  if (!configured) {
    return (
      <>
        <ConfigBanner />
        <div className="err">환경변수 VITE_SUPABASE_URL과 VITE_SUPABASE_KEY를 설정하고 다시 여세요.</div>
      </>
    );
  }

  return (
    <>
      <Header
        lastUpdated={lastUpdated}
        devices={devices}
        deviceFilter={deviceFilter}
        onDeviceChange={setDeviceFilter}
        period={period}
        onPeriodChange={setPeriod}
      />
      <SummaryCards s={m.summary} />

      {loading && <div className="loading">데이터 로딩 중...</div>}
      {error && <div className="err">❌ 데이터 로딩 실패: {error}</div>}

      {!loading && !error && (
        <>
          <TrendChart data={m.trend} />
          <SessionsTable rows={m.sessionRows} />
          <div className="grid">
            <SkillChart data={m.skill} />
            <PluginChart data={m.plugin} />
            <McpChart data={m.mcp} />
            <SubagentChart data={m.subagent} />
            <GeneralDonut data={m.general} />
            <WorktypeDonut data={m.worktype} />
          </div>
          <div className="grid">
            <WorktypeCost data={m.worktypeCost} />
            <WorktypeTrend types={m.worktypeTrend.types} data={m.worktypeTrend.data} />
          </div>
          <Heatmap days={m.heatmap.days} counts={m.heatmap.counts} max={m.heatmap.max} />
          <CostChart data={m.cost} projection={m.projection} note={m.costNote} />
          <ProjectChart data={m.project} />
          <TokensChart data={m.tokens} />
        </>
      )}
    </>
  );
}
