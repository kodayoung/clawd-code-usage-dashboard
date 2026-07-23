import { useTheme } from '../theme/ThemeContext.jsx';

export default function Header({ lastUpdated, devices, deviceFilter, onDeviceChange, period, onPeriodChange }) {
  const { theme, toggle } = useTheme();
  const TABS = [
    ['all', '전체'], ['day', '일간'], ['week', '주간'], ['month', '월간'],
  ];

  return (
    <header>
      <h1>Claude Code 사용량</h1>
      <span>{lastUpdated}</span>
      <div className="controls">
        <select value={deviceFilter} onChange={e => onDeviceChange(e.target.value)}>
          <option value="">전체 기기</option>
          {devices.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <div className="tab-group">
          {TABS.map(([val, label]) => (
            <button
              key={val}
              className={'tab' + (period === val ? ' active' : '')}
              onClick={() => onPeriodChange(val)}
            >{label}</button>
          ))}
        </div>
        <button className="icon-btn" title="라이트/다크 모드 전환" onClick={toggle}>
          {theme === 'light' ? '☀️' : '🌙'}
        </button>
      </div>
    </header>
  );
}
