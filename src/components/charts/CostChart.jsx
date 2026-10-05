import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { useTheme } from '../../theme/ThemeContext.jsx';
import { Panel, ChartWrap, axisTick, gridStroke, tooltipStyle } from './common.jsx';

export default function CostChart({ data, projection, note }) {
  const { colors } = useTheme();
  return (
    <div className="grid single">
      <Panel
        title="비용 추이 "
        hint="Claude Code의 예상 비용(USD) 변화입니다. Codex 비용은 미산정입니다."
        extra={<span className="cost-projection">{projection}</span>}
      >
        <ChartWrap>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
              <CartesianGrid stroke={gridStroke(colors)} />
              <XAxis dataKey="label" tick={axisTick(colors)} stroke={gridStroke(colors)} />
              <YAxis tick={axisTick(colors)} stroke={gridStroke(colors)} />
              <Tooltip {...tooltipStyle(colors)} />
              <Line type="monotone" dataKey="value" name="비용(USD)" stroke="#7c6eff"
                fill="rgba(124,110,255,0.15)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartWrap>
        <p className="cost-note">{note}</p>
      </Panel>
    </div>
  );
}
