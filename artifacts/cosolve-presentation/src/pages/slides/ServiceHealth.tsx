export default function ServiceHealth() {
  return (
    <div className="relative w-screen h-screen overflow-hidden deck font-body">
      <div className="brand"><span className="brand-mark"/><span>CoSolve</span></div>
      <h2 className="absolute top-[17vh] left-[6vw] w-[88vw] text-[5vw] leading-[1.12] font-extrabold font-display">Find patterns beyond the individual case.</h2>
      <p className="absolute top-[45vh] left-[6vw] right-[6vw] text-[3vw] leading-[1.2] font-bold blue-text">Recurring service and product issues</p>
      <div className="absolute top-[63vh] left-[6vw] right-[6vw] grid grid-cols-3 gap-[4vw]">
        <div className="border-t-[0.1vw] border-primary pt-[3vh]"><p className="copy">Agent overview: assigned cases, resolutions and available ratings</p></div>
        <div className="border-t-[0.1vw] border-accent pt-[3vh]"><p className="copy">Customer-relations health signals</p></div>
        <div className="border-t-[0.1vw] border-primary pt-[3vh]"><p className="copy">Identify customers needing attention from recorded ratings and complaint history</p></div>
      </div>
      <p className="page-number">18 / 20</p>
    </div>
  );
}
