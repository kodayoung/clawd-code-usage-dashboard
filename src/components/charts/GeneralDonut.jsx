import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import { useTheme } from '../../theme/ThemeContext.jsx';
import { COLORS } from '../../config.js';
import { Panel, ChartWrap, tooltipStyle, legendStyle } from './common.jsx';

export default function GeneralDonut({ data }) {
  const { colors } = useTheme();
  return (
    <Panel title="기본 도구 분포" hint="읽기·쓰기·실행 같은 기본 도구의 사용 비중입니다.">
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
