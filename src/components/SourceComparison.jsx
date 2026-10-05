import { Panel } from './charts/common.jsx';
import { fmt } from '../lib/format.js';
import { SOURCE_LABELS } from '../lib/usage.js';

export default function SourceComparison({ rows }) {
  return (
    <div className="grid single">
      <Panel title="AI 도구별 사용량" hint="선택한 기간과 기기의 도구 호출·세션·토큰을 비교합니다. 전체 토큰에는 캐시가 포함되며 추론 토큰은 출력의 일부입니다.">
        <table>
          <thead><tr><th>AI 도구</th><th>세션</th><th>도구 호출</th><th>전체 토큰</th><th>캐시 읽기</th><th>추론 토큰</th></tr></thead>
          <tbody>{rows.length === 0 && <tr><td colSpan="6">데이터 없음</td></tr>}{rows.map(r => (
            <tr key={r.source}><td>{SOURCE_LABELS[r.source]}</td><td>{fmt(r.sessions)}</td><td>{fmt(r.calls)}</td><td>{fmt(r.tokens)}</td><td>{fmt(r.cache)}</td><td>{fmt(r.reasoning)}</td></tr>
          ))}</tbody>
        </table>
        <p className="cost-note">Claude Code는 도구 호출이 있는 메시지의 토큰을 집계합니다. Codex는 모델 응답의 사용량 이벤트를 집계하며, 이벤트가 없는 로그의 토큰은 포함되지 않습니다.</p>
      </Panel>
    </div>
  );
}
