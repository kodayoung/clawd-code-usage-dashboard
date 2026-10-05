import { Panel } from './common.jsx';
import { fmt, fmtCost } from '../../lib/format.js';
import { SOURCE_LABELS } from '../../lib/usage.js';

export default function SessionsTable({ rows }) {
  return (
    <div className="grid single">
      <Panel title="세션별 사용량 Top 10" hint="Claude Code는 예상 비용, Codex는 토큰 사용량 순서로 표시합니다. Codex 비용은 미산정입니다.">
        <table>
          <tbody>
            <tr><th>날짜</th><th>AI 도구</th><th>프로젝트</th><th>비용</th><th>전체 토큰</th><th>도구 호출</th></tr>
            {rows.length === 0 ? (
              <tr><td colSpan="6" style={{ color: 'var(--muted)' }}>데이터 없음</td></tr>
            ) : rows.map((s, i) => (
              <tr key={i}>
                <td>{new Date(s.first).toLocaleDateString('ko-KR')}</td>
                <td>{SOURCE_LABELS[s.source]}</td>
                <td>{s.project}</td>
                <td>{s.cost === null ? '미산정' : fmtCost(s.cost)}</td>
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
