import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { useTheme } from '../../theme/ThemeContext.jsx';
import { Panel, ChartWrap, axisTick, gridStroke, tooltipStyle } from './common.jsx';

export default function SubagentChart({ data }) {
  const { colors } = useTheme();
  return (
    <Panel title="보조 에이전트 사용" hint="Claude가 도움을 받은 보조 AI(서브에이전트) 종류별 횟수입니다.">
      <ChartWrap>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
            <CartesianGrid stroke={gridStroke(colors)} />
            <XAxis dataKey="name" tick={axisTick(colors)} stroke={gridStroke(colors)} />
            <YAxis tick={axisTick(colors)} stroke={gridStroke(colors)} />
            <Tooltip {...tooltipStyle(colors)} cursor={{ fill: 'rgba(69,217,161,0.1)' }} />
            <Bar dataKey="count" name="호출 수" fill="#45d9a1" />
          </BarChart>
        </ResponsiveContainer>
      </ChartWrap>
      <table>
        <tbody>
          <tr><th>에이전트 유형</th><th>호출 수</th></tr>
          {data.map(d => (
            <tr key={d.name}><td><span className="badge subagent">{d.name}</span></td><td>{d.count}</td></tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}
