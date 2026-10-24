export default function WowFactors() {
  return (
    <div className="relative w-screen h-screen overflow-hidden deck font-body">
      <div className="brand"><span className="brand-mark"/><span>CoSolve</span></div>
      <h2 className="absolute top-[17vh] left-[9vw] right-[9vw] text-[5.2vw] font-extrabold leading-[1.1] text-center font-display">The wow factors, in one workflow.</h2>
      <div className="absolute top-[44vh] left-[9vw] right-[9vw] grid grid-cols-2 gap-x-[6vw] gap-y-[5vh]">
        <p className="copy">Bulk reviews become a focused, negative-only work queue</p>
        <p className="copy">Two AI providers turn feedback into reviewable guidance</p>
        <p className="copy">Managers stay in control of compensation and communication</p>
        <p className="copy">Customer context, email and audit history stay connected</p>
      </div>
      <div className="absolute top-[82vh] left-[6vw] right-[6vw] h-[8vh] rounded-[0.5vw] bg-[#294eae] flex items-center justify-center">
        <p className="text-[2.3vw] leading-[1.2] font-bold">Import → investigate → approve → email → close</p>
      </div>
      <p className="brand-foot">CoSolve</p>
      <p className="page-number">20 / 20</p>
    </div>
  );
}
