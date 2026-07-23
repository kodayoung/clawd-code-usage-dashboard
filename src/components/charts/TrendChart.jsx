import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { useTheme } from '../../theme/ThemeContext.jsx';
import { Panel, ChartWrap, axisTick, gridStroke, tooltipStyle } from './common.jsx';

export default function TrendChart({ data }) {
  const { colors } = useTheme();
  return (
    <div className="grid single">
      <Panel title="사용량 추이" hint="시간에 따라 작업을 얼마나 실행했는지 보여줍니다.">
        <ChartWrap>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
              <CartesianGrid stroke={gridStroke(colors)} />
              <XAxis dataKey="label" tick={axisTick(colors)} stroke={gridStroke(colors)} />
              <YAxis tick={axisTick(colors)} stroke={gridStroke(colors)} />
              <Tooltip {...tooltipStyle(colors)} />
              <Line type="monotone" dataKey="value" name="도구 호출" stroke="#7c6eff"
                fill="rgba(124,110,255,0.15)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartWrap>
      </Panel>
    </div>
  );
}
