export default function SummaryCards({ s }) {
  const cards = [
    ['작업 실행 횟수', s.total, 'accent', 'Claude가 파일 읽기·수정·검색 등 작업을 실행한 총 횟수'],
    ['입력량', s.input, 'accent2', 'Claude에게 보낸 분량(질문·파일·맥락). 단위는 토큰'],
    ['출력량', s.output, 'accent3', 'Claude가 만들어낸 답변 분량. 단위는 토큰'],
    ['재활용한 분량', s.cache, 'accent4', '다시 안 읽고 재활용해 아낀 입력량(캐시)'],
    ['예상 비용', s.cost, 'accent', '사용량을 달러로 환산한 추정치(USD)'],
    ['캐시 효율', s.hit, 'accent3', '읽은 것 중 재활용으로 싸게 처리한 비율. 높을수록 절약'],
    ['스킬 사용', s.skill, '', '자동화 기능(스킬)을 실행한 횟수'],
    ['외부 연동(MCP) 사용', s.mcp, '', '외부 도구 연동(MCP)을 호출한 횟수'],
    ['작업 1건당 평균 비용', s.costPerSession, 'accent', '대화(작업) 한 건에 평균적으로 든 비용(USD)'],
    ['가장 비쌌던 작업', s.topSession, 'accent2', s.topSessionDesc],
    ['지난주 대비 비용', s.wow, 'accent3', '최근 7일 비용을 그 전 7일과 비교한 증감입니다'],
    ['아낀 비용(재활용)', s.saved, 'accent4', '맥락을 재활용(캐시)해 절약한 추정 비용(USD)'],
    ['비싼 모델 비중', s.opusShare, '', '전체 비용 중 고가 모델(Opus·모델 미상 포함)이 차지하는 비율'],
  ];

  return (
    <>
      <div className="summary">
        {cards.map(([label, value, accent, desc]) => (
          <div className="card" key={label}>
            <div className="card-label">{label}</div>
            <div className={'card-value' + (accent ? ' ' + accent : '')}>{value}</div>
            <div className="card-desc">{desc}</div>
          </div>
        ))}
      </div>
      <p className="summary-note">
        ※ <b>토큰</b>은 AI가 글을 처리하는 기본 단위예요(대략 단어 한두 조각). 숫자가 클수록 더 많이 처리했다는 뜻이고, 비용도 그만큼 커집니다.
      </p>
    </>
  );
}
