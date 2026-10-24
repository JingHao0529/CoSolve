export default function Analytics() {
  return (
    <div className="relative w-screen h-screen overflow-hidden deck font-body">
      <div className="brand"><span className="brand-mark"/><span>CoSolve</span></div>
      <h2 className="slide-title content-top w-[86vw] font-display">See financial risk and resolution performance.</h2>
      <div className="blue-surface absolute top-[43vh] left-[6vw] w-[35vw] h-[44vh] p-[3.2vw]">
        <svg aria-hidden="true" className="w-[13vw] h-[18vh] text-white line-icon mb-[3vh]" viewBox="0 0 90 70"><path d="M9 18h72v45H9zM9 18 58 5v13M62 31h19v20H62z"/><circle cx="69" cy="41" r="2"/></svg>
        <p className="copy text-[2.5vw]! text-white!">Financial exposure and pending decisions</p>
      </div>
      <p className="copy absolute top-[43vh] left-[47vw] right-[6vw] text-[2.3vw]!">Complaint and refund trends</p>
      <div className="absolute top-[53vh] left-[47vw] right-[6vw] rule"/>
      <p className="copy absolute top-[57vh] left-[47vw] right-[6vw] text-[2.3vw]!">Resolution performance</p>
      <p className="copy absolute top-[67vh] left-[47vw] right-[6vw]">Sentiment and recurring issues within retained complaints</p>
      <p className="copy absolute top-[79vh] left-[47vw] right-[6vw]">Reporting reflects recorded complaint data—not every review of the business</p>
      <p className="page-number">17 / 20</p>
    </div>
  );
}
