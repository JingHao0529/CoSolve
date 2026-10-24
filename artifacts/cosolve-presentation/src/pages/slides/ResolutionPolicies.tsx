export default function ResolutionPolicies() {
  return (
    <div className="relative w-screen h-screen overflow-hidden deck font-body">
      <div className="brand"><span className="brand-mark"/><span>CoSolve</span></div>
      <h2 className="slide-title content-top w-[84vw] font-display">Make compensation rules explicit.</h2>
      <div className="absolute top-[43vh] left-[6vw] w-[39vw]">
        <svg className="w-[6vw] h-[10vh] line-icon blue-text mb-[3vh]" viewBox="0 0 55 40"><path d="M3 4h49v32H3zM13 14h29M13 25h18"/><path d="m37 23 4 4 9-10"/></svg>
        <p className="copy text-[2.4vw]!">Category-based resolution policies</p>
        <p className="copy mt-[4vh]!">Compensation limits and approval thresholds</p>
      </div>
      <div className="absolute top-[43vh] left-[49vw] h-[40vh] w-[0.08vw] bg-white/20"/>
      <div className="absolute top-[43vh] right-[6vw] w-[39vw]">
        <svg className="w-[6vw] h-[10vh] line-icon violet-text mb-[3vh]" viewBox="0 0 55 40"><circle cx="17" cy="11" r="8"/><path d="M2 38v-4a15 15 0 0 1 30 0v4m6-27 6 6 10-13"/></svg>
        <p className="copy text-[2.4vw]!">Create rules and manage their active status</p>
        <p className="copy mt-[4vh]!">Current access model: every signed-in user has manager capabilities</p>
      </div>
      <p className="page-number">15 / 20</p>
    </div>
  );
}
