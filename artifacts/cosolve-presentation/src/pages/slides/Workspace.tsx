export default function Workspace() {
  return (
    <div className="relative w-screen h-screen overflow-hidden deck font-body">
      <div className="brand"><span className="brand-mark"/><span>CoSolve</span></div>
      <h2 className="slide-title content-top w-[78vw] font-display">One workspace, from complaint to closure.</h2>
      <div className="absolute top-[44vh] left-[6vw] right-[6vw] grid grid-cols-2 gap-x-[6.4vw] gap-y-[6vh]">
        <div className="flex items-start gap-[2vw]">
          <svg className="icon shrink-0" viewBox="0 0 24 24"><path d="M3 4h18v13H3zM3 17l4-5h3l2 3 2-3h3l4 5M8 21h8"/></svg>
          <p className="copy"><strong className="text-white">Complaint Inbox:</strong> triage, investigation and resolution</p>
        </div>
        <div className="flex items-start gap-[2vw]">
          <svg className="icon shrink-0" viewBox="0 0 24 24"><circle cx="12" cy="7" r="4"/><path d="M4 22v-4a8 8 0 0 1 16 0v4M19 4h4m-2-2v4"/></svg>
          <p className="copy"><strong className="text-white">Customers &amp; Orders:</strong> context and history</p>
        </div>
        <div className="flex items-start gap-[2vw]">
          <svg className="icon shrink-0" viewBox="0 0 24 24"><path d="M5 3h14v18H5zM8 8h8M8 12h8M8 16h5"/></svg>
          <p className="copy"><strong className="text-white">Resolution Policies:</strong> consistent compensation rules</p>
        </div>
        <div className="flex items-start gap-[2vw]">
          <svg className="icon shrink-0" viewBox="0 0 24 24"><path d="M3 3v18h18M7 17v-5m5 5V7m5 10V3"/></svg>
          <p className="copy"><strong className="text-white">Audit Log and Analytics:</strong> accountability and insight</p>
        </div>
      </div>
      <p className="page-number">03 / 20</p>
    </div>
  );
}
