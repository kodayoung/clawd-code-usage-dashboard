// 차트 공통 조각 — 패널 래퍼, 축/그리드/툴팁 스타일 (테마 색 반영)

export function Panel({ title, hint, extra, children, wrapHeight }) {
  return (
    <div className="panel">
      <h2>{title}{extra}</h2>
      {hint && <p className="hint">{hint}</p>}
      {children}
    </div>
  );
}

export function ChartWrap({ height, children }) {
  return <div className="chart-wrap" style={height ? { height } : undefined}>{children}</div>;
}

// Recharts XAxis/YAxis/CartesianGrid/Tooltip 공통 props
export function axisTick(colors) {
  return { fill: colors.muted, fontSize: 10 };
}

export function gridStroke(colors) {
  return colors.grid;
}

export function tooltipStyle(colors) {
  return {
    contentStyle: {
      background: 'var(--surface)',
      border: `1px solid ${colors.grid}`,
      borderRadius: 8,
      fontSize: 12,
      color: 'var(--text)',
    },
    labelStyle: { color: colors.muted },
    itemStyle: { color: 'var(--text)' },
  };
}

export function legendStyle(colors) {
  return { color: colors.muted, fontSize: 11 };
}
