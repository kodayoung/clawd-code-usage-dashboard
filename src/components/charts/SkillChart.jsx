import { ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { useTheme } from '../../theme/ThemeContext.jsx';
import { COLORS } from '../../config.js';
import { Panel, ChartWrap, axisTick, gridStroke, tooltipStyle } from './common.jsx';

export default function SkillChart({ data }) {
  const { colors } = useTheme();
  return (
    <Panel title="스킬 사용 순위" hint="어떤 자동화 기능(스킬)을 많이 썼는지 순위로 보여줍니다.">
      <ChartWrap>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
            <CartesianGrid stroke={gridStroke(colors)} />
            <XAxis dataKey="name" tick={axisTick(colors)} stroke={gridStroke(colors)} />
            <YAxis tick={axisTick(colors)} stroke={gridStroke(colors)} />
            <Tooltip {...tooltipStyle(colors)} cursor={{ fill: 'rgba(124,110,255,0.08)' }} />
            <Bar dataKey="count" name="호출 수">
              {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartWrap>
      <table>
        <tbody>
          <tr><th>스킬</th><th>사용 수</th></tr>
          {data.map(d => (
            <tr key={d.name}><td><span className="badge skill">{d.name}</span></td><td>{d.count}</td></tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}
