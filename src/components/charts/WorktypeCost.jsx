import { ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { useTheme } from '../../theme/ThemeContext.jsx';
import { COLORS } from '../../config.js';
import { Panel, ChartWrap, axisTick, gridStroke, tooltipStyle } from './common.jsx';

export default function WorktypeCost({ data }) {
  const { colors } = useTheme();
  return (
    <Panel title="작업유형별 비용" hint="어떤 종류의 작업에 비용이 가장 많이 들었는지 보여줍니다(USD).">
      <ChartWrap>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 8, right: 12, bottom: 0, left: 12 }}>
            <CartesianGrid stroke={gridStroke(colors)} />
            <XAxis type="number" tick={axisTick(colors)} stroke={gridStroke(colors)} />
            <YAxis type="category" dataKey="name" tick={axisTick(colors)} stroke={gridStroke(colors)} width={70} />
            <Tooltip {...tooltipStyle(colors)} cursor={{ fill: 'rgba(124,110,255,0.08)' }} />
            <Bar dataKey="value" name="비용(USD)">
              {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartWrap>
    </Panel>
  );
}
