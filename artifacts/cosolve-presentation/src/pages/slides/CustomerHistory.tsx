export default function CustomerHistory() {
  return (
    <div className="relative w-screen h-screen overflow-hidden deck font-body">
      <div className="brand"><span className="brand-mark"/><span>CoSolve</span></div>
      <h2 className="slide-title content-top w-[85vw] font-display">See the history behind every complaint.</h2>
      <svg aria-hidden="true" className="absolute top-[45vh] left-[6vw] w-[9vw] h-[35vh] text-accent line-icon" viewBox="0 0 60 160">
        <circle cx="28" cy="19" r="15"/><path d="M3 62a25 25 0 0 1 50 0v11H3zM28 74v79M28 90h25M28 120h25M28 150h25"/>
      </svg>
      <div className="absolute top-[41vh] left-[20vw] right-[6vw]">
        <div className="row-rule py-[3.2vh]"><p className="copy text-[2.5vw]!">Customer profiles and available contact details</p></div>
        <div className="row-rule py-[3.2vh]"><p className="copy text-[2.5vw]!">Order history and purchase context</p></div>
        <div className="row-rule py-[3.2vh]"><p className="copy text-[2.5vw]!">Retained complaint history</p></div>
        <div className="py-[3.2vh]"><p className="copy text-[2.5vw]!">Compensation and approved refund history</p></div>
      </div>
      <p className="page-number">14 / 20</p>
    </div>
  );
}
