export default function Investigation() {
  return (
    <div className="relative w-screen h-screen overflow-hidden deck font-body">
      <div className="brand"><span className="brand-mark"/><span>CoSolve</span></div>
      <h2 className="slide-title content-top w-[82vw] font-display">Investigate with the context in view.</h2>
      <div className="absolute top-[43vh] left-[6vw] w-[39vw]">
        <svg className="w-[8vw] h-[12vh] line-icon blue-text mb-[4vh]" viewBox="0 0 60 42"><circle cx="20" cy="11" r="8"/><path d="M3 40v-5a17 17 0 0 1 34 0v5M43 7h14M43 17h14M43 27h9"/></svg>
        <p className="copy text-[2.3vw]!">Matched customer and available order details</p>
        <p className="copy mt-[5vh]!">Original review, source, date and rating where provided</p>
      </div>
      <div className="absolute top-[43vh] left-[49vw] w-[0.08vw] h-[39vh] bg-white/20"/>
      <div className="absolute top-[43vh] right-[6vw] w-[39vw]">
        <svg className="w-[8vw] h-[12vh] line-icon violet-text mb-[4vh]" viewBox="0 0 60 42"><rect x="5" y="3" width="48" height="35" rx="3"/><path d="M13 12h31M13 21h18M13 30h24"/></svg>
        <p className="copy text-[2.3vw]!">Category, root cause, urgency and confidence</p>
        <p className="copy mt-[5vh]!">Case activity and relevant complaint history</p>
      </div>
      <p className="page-number">08 / 20</p>
    </div>
  );
}
