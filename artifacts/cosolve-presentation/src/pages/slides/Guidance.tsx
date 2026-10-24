export default function Guidance() {
  return (
    <div className="relative w-screen h-screen overflow-hidden deck font-body">
      <div className="brand"><span className="brand-mark"/><span>CoSolve</span></div>
      <h2 className="slide-title content-top w-[78vw] font-display">Refresh guidance. Review the recommendation.</h2>
      <svg aria-hidden="true" className="absolute top-[43vh] right-[7vw] w-[14vw] h-[23vh] line-icon text-primary" viewBox="0 0 80 80"><path d="M66 23A29 29 0 1 0 68 54M66 8v17H49"/></svg>
      <div className="absolute top-[43vh] left-[6vw] w-[68vw] flex flex-col gap-[2.8vh]">
        <div className="row-rule pb-[2.8vh]"><p className="copy">Consider refunds, partial refunds, replacements, rework, vouchers or apologies</p></div>
        <div className="row-rule pb-[2.8vh]"><p className="copy">Review the suggested amount, rationale and policy match</p></div>
        <div className="row-rule pb-[2.8vh]"><p className="copy">Refresh to request new AI guidance</p></div>
        <p className="copy blue-text">Edit the resolution and amount before approval</p>
      </div>
      <p className="page-number">10 / 20</p>
    </div>
  );
}
