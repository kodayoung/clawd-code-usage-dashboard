import { useState, Fragment } from 'react';
import { ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { useTheme } from '../../theme/ThemeContext.jsx';
import { COLORS } from '../../config.js';
import { Panel, ChartWrap, axisTick, gridStroke, tooltipStyle } from './common.jsx';

export default function McpChart({ data }) {
  const { colors } = useTheme();
  const { servers, top } = data;
  const [open, setOpen] = useState({});
  const toggle = i => setOpen(o => ({ ...o, [i]: !o[i] }));

  return (
    <Panel title="외부 연동(MCP) 사용 순위" hint="외부 도구별 사용 횟수입니다. 서버 행을 누르면 세부 도구가 펼쳐집니다.">
      <ChartWrap>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={top} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
            <CartesianGrid stroke={gridStroke(colors)} />
            <XAxis dataKey="server" tick={axisTick(colors)} stroke={gridStroke(colors)} />
            <YAxis tick={axisTick(colors)} stroke={gridStroke(colors)} />
            <Tooltip {...tooltipStyle(colors)} cursor={{ fill: 'rgba(255,110,180,0.08)' }} />
            <Bar dataKey="total" name="호출 수">
              {top.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length] + 'cc'} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartWrap>
      <table>
        <tbody>
          <tr><th></th><th>서버</th><th>호출 수</th></tr>
          {servers.map((srv, i) => (
            <Fragment key={srv.server}>
              <tr className="mcp-srv" onClick={() => toggle(i)}>
                <td><span className="caret">{open[i] ? '▼' : '▶'}</span></td>
                <td><span className="badge mcp">{srv.server}</span></td>
                <td>{srv.total}</td>
              </tr>
              {open[i] && srv.tools.map(t => (
                <tr key={srv.server + '|' + t.tool}>
                  <td></td><td className="mcp-tool-name">{t.tool}</td><td>{t.count}</td>
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}
