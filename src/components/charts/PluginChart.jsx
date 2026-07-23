import { ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { useTheme } from '../../theme/ThemeContext.jsx';
import { COLORS } from '../../config.js';
import { Panel, ChartWrap, axisTick, gridStroke, tooltipStyle } from './common.jsx';

export default function PluginChart({ data }) {
  const { colors } = useTheme();
  return (
    <Panel title="플러그인별 스킬 사용" hint="스킬을 제공한 플러그인(이름 앞 접두사) 기준으로 묶은 사용량입니다.">
      <ChartWrap>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
            <CartesianGrid stroke={gridStroke(colors)} />
            <XAxis dataKey="name" tick={axisTick(colors)} stroke={gridStroke(colors)} />
            <YAxis tick={axisTick(colors)} stroke={gridStroke(colors)} />
            <Tooltip {...tooltipStyle(colors)} cursor={{ fill: 'rgba(124,110,255,0.08)' }} />
            <Bar dataKey="count" name="사용 수">
              {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartWrap>
      <table>
        <tbody>
          <tr><th>플러그인</th><th>사용 수</th></tr>
          {data.map(d => (
            <tr key={d.name}><td><span className="badge skill">{d.name}</span></td><td>{d.count}</td></tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}
