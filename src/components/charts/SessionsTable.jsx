import { Panel } from './common.jsx';
import { fmt, fmtCost } from '../../lib/format.js';

export default function SessionsTable({ rows }) {
  return (
    <div className="grid single">
      <Panel title="비싼 작업 Top 10" hint='대화(작업) 단위로 묶어 비용이 큰 작업을 보여줍니다. "이 작업 하나에 얼마 들었지?"를 확인하세요.'>
        <table>
          <tbody>
            <tr><th>날짜</th><th>프로젝트</th><th>비용</th><th>주고받은 분량</th><th>도구 호출</th></tr>
            {rows.length === 0 ? (
              <tr><td colSpan="5" style={{ color: 'var(--muted)' }}>데이터 없음</td></tr>
            ) : rows.map((s, i) => (
              <tr key={i}>
                <td>{new Date(s.first).toLocaleDateString('ko-KR')}</td>
                <td>{s.project}</td>
                <td>{fmtCost(s.cost)}</td>
                <td>{fmt(s.tokens)}</td>
                <td>{s.calls}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
