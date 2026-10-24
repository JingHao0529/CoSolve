export default function Workflow() {
  return (
    <div className="relative w-screen h-screen overflow-hidden deck font-body">
      <div className="brand"><span className="brand-mark"/><span>CoSolve</span></div>
      <h2 className="slide-title content-top w-[80vw] font-display">A clear path through every complaint.</h2>
      <svg aria-hidden="true" className="absolute left-[6vw] top-[39vh] w-[88vw] h-[43vh]" viewBox="0 0 1000 500" preserveAspectRatio="none">
        <path d="M110 40H890Q950 40 950 100V270H190V355H810" fill="none" stroke="#4f7fff" strokeWidth="2" opacity=".65"/>
        <path d="m240 32 12 8-12 8m260-16 12 8-12 8m260-16 12 8-12 8M180 310l10 14 10-14m140 37 12 8-12 8m310-16 12 8-12 8" className="line-icon" stroke="#8eacff"/>
      </svg>
      <div className="flow-node top-[39vh] left-[6vw]"><span className="flow-step">1</span><p className="flow-copy">Receive the complaint</p></div>
      <div className="flow-node top-[39vh] left-[29vw]"><span className="flow-step">2</span><p className="flow-copy">Match the customer and available order details</p></div>
      <div className="flow-node top-[39vh] left-[52vw]"><span className="flow-step">3</span><p className="flow-copy">Classify with AI</p></div>
      <div className="flow-node top-[39vh] left-[75vw]"><span className="flow-step">4</span><p className="flow-copy">Generate resolution guidance</p></div>
      <div className="flow-node top-[70vh] left-[13vw]"><span className="flow-step">5</span><p className="flow-copy">Review and approve as a manager</p></div>
      <div className="flow-node top-[70vh] left-[40.5vw]"><span className="flow-step">6</span><p className="flow-copy">Communicate the resolution</p></div>
      <div className="flow-node top-[70vh] left-[68vw]"><span className="flow-step">7</span><p className="flow-copy">Close, log and learn</p></div>
      <p className="page-number">04 / 20</p>
    </div>
  );
}
