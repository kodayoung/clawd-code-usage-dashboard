import { Panel } from './common.jsx';

// 요일(0=일)×시간대(0~23), 셀 진하기 = 작업 실행 횟수
export default function Heatmap({ days, counts, max }) {
  const cells = [];
  // 헤더 행: 좌상단 빈칸 + 시간 라벨(6시간 간격)
  cells.push(<div className="hm-label" key="corner" />);
  for (let h = 0; h < 24; h++) {
    cells.push(<div className="hm-col" key={'col' + h}>{h % 6 === 0 ? h : ''}</div>);
  }
  for (let day = 0; day < 7; day++) {
    cells.push(<div className="hm-label" key={'lbl' + day}>{days[day]}</div>);
    for (let h = 0; h < 24; h++) {
      const v = counts[day][h];
      const alpha = max > 0 && v > 0 ? (0.12 + 0.88 * (v / max)).toFixed(3) : 0;
      const style = v > 0 ? { background: `rgba(124,110,255,${alpha})` } : undefined;
      cells.push(
        <div className="hm-cell" key={day + '-' + h} style={style} title={`${days[day]} ${h}시 · ${v}회`} />
      );
    }
  }

  return (
    <div className="grid single">
      <Panel title="작업 리듬 (요일 × 시간대)" hint="언제 집중적으로 작업했는지 보여줍니다. 색이 진할수록 그 시간대에 더 많이 썼다는 뜻입니다.">
        <div className="heatmap">{cells}</div>
      </Panel>
    </div>
  );
}
