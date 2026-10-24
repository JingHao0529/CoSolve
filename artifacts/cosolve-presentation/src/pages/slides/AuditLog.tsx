export default function AuditLog() {
  return (
    <div className="relative w-screen h-screen overflow-hidden deck font-body">
      <div className="brand"><span className="brand-mark"/><span>CoSolve</span></div>
      <h2 className="slide-title content-top w-[84vw] font-display">Every decision leaves a record.</h2>
      <div className="absolute top-[42vh] left-[6vw] right-[6vw] flex items-center gap-[3.2vw]">
        <svg className="w-[8vw] h-[12vh] shrink-0 line-icon blue-text" viewBox="0 0 64 54"><path d="M12 3h40v48H12zM21 14h22M21 25h22M21 36h15"/><path d="m3 19 5 5 9-11"/></svg>
        <p className="copy text-[3vw]! text-white!">Trace case actions, recommendations and approvals</p>
      </div>
      <div className="absolute top-[67vh] left-[6vw] right-[6vw] grid grid-cols-3 gap-[4vw]">
        <div className="border-t-[0.1vw] border-primary pt-[3vh]"><p className="copy">Review monthly cumulative refunds</p></div>
        <div className="border-t-[0.1vw] border-primary pt-[3vh]"><p className="copy">Find approved refunds and recorded outcomes</p></div>
        <div className="border-t-[0.1vw] border-accent pt-[3vh]"><p className="copy">Track actions and improvements through case follow-up records</p></div>
      </div>
      <p className="page-number">16 / 20</p>
    </div>
  );
}
