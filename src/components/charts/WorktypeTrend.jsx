import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { useTheme } from '../../theme/ThemeContext.jsx';
import { COLORS } from '../../config.js';
import { Panel, ChartWrap, axisTick, gridStroke, tooltipStyle, legendStyle } from './common.jsx';

export default function WorktypeTrend({ types, data }) {
  const { colors } = useTheme();
  return (
    <Panel title="작업유형 추세" hint="시간에 따라 작업 종류 구성이 어떻게 변했는지 보여줍니다(작업 실행 횟수 기준).">
      <ChartWrap>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
            <CartesianGrid stroke={gridStroke(colors)} />
            <XAxis dataKey="label" tick={axisTick(colors)} stroke={gridStroke(colors)} />
            <YAxis tick={axisTick(colors)} stroke={gridStroke(colors)} />
            <Tooltip {...tooltipStyle(colors)} cursor={{ fill: 'rgba(124,110,255,0.06)' }} />
            <Legend wrapperStyle={legendStyle(colors)} />
            {types.map((t, i) => (
              <Bar key={t} dataKey={t} name={t} stackId="a" fill={COLORS[i % COLORS.length] + 'cc'} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </ChartWrap>
    </Panel>
  );
}
