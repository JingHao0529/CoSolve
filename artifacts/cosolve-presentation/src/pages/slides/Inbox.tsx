export default function Inbox() {
  return (
    <div className="relative w-screen h-screen overflow-hidden deck font-body">
      <div className="brand"><span className="brand-mark"/><span>CoSolve</span></div>
      <h2 className="slide-title content-top w-[84vw] font-display">Know what needs attention next.</h2>
      <div className="absolute top-[42vh] left-[6vw] right-[6vw]">
        <div className="row-rule flex items-center gap-[3vw] py-[2.8vh]">
          <svg className="icon shrink-0" viewBox="0 0 24 24"><path d="M3 3h18v18H3zM7 8h10M7 12h10M7 16h6"/></svg>
          <p className="copy text-[2.4vw]!">Browse all retained complaints in one Inbox</p>
        </div>
        <div className="row-rule flex items-center gap-[3vw] py-[2.8vh]">
          <svg className="icon shrink-0" viewBox="0 0 24 24"><path d="m12 2 10 19H2zM12 8v5m0 3v2"/></svg>
          <p className="copy text-[2.4vw]!">Use the priority queue for urgent cases</p>
        </div>
        <div className="row-rule flex items-center gap-[3vw] py-[2.8vh]">
          <svg className="icon shrink-0" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 5v7l4 2"/></svg>
          <p className="copy text-[2.4vw]!">Find cases awaiting approval</p>
        </div>
        <div className="flex items-center gap-[3vw] py-[2.8vh]">
          <svg className="icon shrink-0" viewBox="0 0 24 24"><circle cx="10" cy="10" r="7"/><path d="m15 15 7 7"/></svg>
          <p className="copy text-[2.4vw]!">Search and filter to reach the right case</p>
        </div>
      </div>
      <p className="page-number">07 / 20</p>
    </div>
  );
}
