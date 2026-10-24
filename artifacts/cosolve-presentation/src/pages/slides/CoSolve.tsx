export default function CoSolve() {
  return (
    <div className="relative w-screen h-screen overflow-hidden deck font-body">
      <div className="brand"><span className="brand-mark"/><span>CoSolve</span></div>
      <div className="absolute left-[12vw] right-[12vw] top-[22vh] flex flex-col items-center text-center">
        <p className="cover-badge">AI-assisted complaint resolution</p>
        <h1 className="cover-title mt-[4vh]! font-display">CoSolve</h1>
        <p className="cover-subtitle mt-[3vh]! max-w-[63vw]">Turn negative reviews into clear, consistent resolutions.</p>
        <p className="cover-features mt-[8vh]! whitespace-nowrap">Focused intake · Manager-led decisions · Traceable outcomes</p>
      </div>
      <div aria-hidden="true" className="absolute bottom-[13vh] right-[5vw] w-[20vw] h-[12vh] rounded-[0.8vw] border border-white/10 bg-[#131726] rotate-[-5deg] p-[1.4vw] opacity-70">
        <div className="flex items-center gap-[1vw]">
          <div className="w-[1.8vw] h-[1.8vw] rounded-full bg-accent"/>
          <div className="h-[0.6vw] w-[10vw] rounded-[0.15vw] bg-white/15"/>
        </div>
        <div className="h-[0.45vw] w-[15vw] mt-[1.5vh] rounded-[0.15vw] bg-white/10"/>
        <div className="h-[0.45vw] w-[11vw] mt-[1vh] rounded-[0.15vw] bg-white/10"/>
      </div>
      <p className="brand-foot">CoSolve</p>
      <p className="page-number">01 / 20</p>
    </div>
  );
}
