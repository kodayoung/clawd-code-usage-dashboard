import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { useTheme } from '../../theme/ThemeContext.jsx';
import { Panel, ChartWrap, axisTick, gridStroke, tooltipStyle } from './common.jsx';

export default function ProjectChart({ data }) {
  const { colors } = useTheme();
  return (
    <div className="grid single">
      <Panel title="프로젝트별 사용 분포" hint="어떤 프로젝트에서 많이 작업했는지 보여줍니다.">
        <ChartWrap height={280}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 8, right: 12, bottom: 0, left: 20 }}>
              <CartesianGrid stroke={gridStroke(colors)} />
              <XAxis type="number" tick={axisTick(colors)} stroke={gridStroke(colors)} />
              <YAxis type="category" dataKey="name" tick={axisTick(colors)} stroke={gridStroke(colors)} width={140} />
              <Tooltip {...tooltipStyle(colors)} cursor={{ fill: 'rgba(124,110,255,0.08)' }} />
              <Bar dataKey="count" name="호출 수" fill="#7c6eff99" />
            </BarChart>
          </ResponsiveContainer>
        </ChartWrap>
      </Panel>
    </div>
  );
}
