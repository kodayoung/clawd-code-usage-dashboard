import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { useTheme } from '../../theme/ThemeContext.jsx';
import { Panel, ChartWrap, axisTick, gridStroke, tooltipStyle, legendStyle } from './common.jsx';

const SERIES = [
  ['input', '입력', '#7c6eff99'],
  ['output', '출력', '#ff6eb499'],
  ['cache_creation', '캐시 저장', '#45d9a199'],
  ['cache_read', '캐시 읽기', '#ffb54599'],
];

export default function TokensChart({ data }) {
  const { colors } = useTheme();
  return (
    <div className="grid single">
      <Panel title="분량(토큰) 사용 추이" hint="입력·출력·캐시 분량이 시간에 따라 어떻게 쌓였는지 보여줍니다.">
        <ChartWrap>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
              <CartesianGrid stroke={gridStroke(colors)} />
              <XAxis dataKey="label" tick={axisTick(colors)} stroke={gridStroke(colors)} />
              <YAxis tick={axisTick(colors)} stroke={gridStroke(colors)} />
              <Tooltip {...tooltipStyle(colors)} cursor={{ fill: 'rgba(124,110,255,0.06)' }} />
              <Legend wrapperStyle={legendStyle(colors)} />
              {SERIES.map(([key, label, color]) => (
                <Bar key={key} dataKey={key} name={label} stackId="a" fill={color} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </ChartWrap>
      </Panel>
    </div>
  );
}
