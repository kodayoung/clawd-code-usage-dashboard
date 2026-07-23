import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import { useTheme } from '../../theme/ThemeContext.jsx';
import { COLORS } from '../../config.js';
import { Panel, ChartWrap, tooltipStyle, legendStyle } from './common.jsx';

export default function WorktypeDonut({ data }) {
  const { colors } = useTheme();
  return (
    <Panel title="작업유형 분포" hint="작업을 코드편집·탐색·실행 등 종류별로 묶어 비중을 보여줍니다.">
      <ChartWrap>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="80%">
              {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip {...tooltipStyle(colors)} />
            <Legend wrapperStyle={legendStyle(colors)} />
          </PieChart>
        </ResponsiveContainer>
      </ChartWrap>
    </Panel>
  );
}
