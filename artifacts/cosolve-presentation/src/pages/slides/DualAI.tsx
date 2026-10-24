export default function DualAI() {
  return (
    <div className="relative w-screen h-screen overflow-hidden deck font-body">
      <div className="brand"><span className="brand-mark"/><span>CoSolve</span></div>
      <h2 className="slide-title content-top w-[82vw] font-display">Two AI roles. One reviewable workflow.</h2>
      <div className="absolute top-[42vh] left-[6vw] right-[6vw] grid grid-cols-2 gap-[3.2vw]">
        <div className="blue-surface p-[3.2vw] h-[30vh]">
          <svg className="w-[4vw] h-[6vh] line-icon text-white mb-[2.5vh]" viewBox="0 0 36 28"><path d="M2 16h6l4-11 7 19 5-14 4 6h6"/></svg>
          <p className="copy text-[2.2vw]! text-white!"><strong>Runpod:</strong> sentiment, confidence and human-review signals</p>
        </div>
        <div className="accent-surface p-[3.2vw] h-[30vh]">
          <svg className="w-[4vw] h-[6vh] line-icon text-white mb-[2.5vh]" viewBox="0 0 36 28"><path d="M4 3h28v22H4zM10 9h16M10 14h10M10 19h13"/></svg>
          <p className="copy text-[2.2vw]! text-white!"><strong>Grafilab:</strong> category, root cause, urgency and summary</p>
        </div>
      </div>
      <p className="copy absolute top-[77vh] left-[6vw] w-[43vw]">Grafilab: resolution guidance and response drafts</p>
      <p className="copy absolute top-[77vh] right-[6vw] w-[39vw]">Distinct provider confidence—not one unexplained AI score</p>
      <p className="page-number">09 / 20</p>
    </div>
  );
}
