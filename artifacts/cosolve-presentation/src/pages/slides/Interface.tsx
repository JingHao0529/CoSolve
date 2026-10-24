export default function Interface() {
  return (
    <div className="relative w-screen h-screen overflow-hidden deck font-body">
      <div className="brand"><span className="brand-mark"/><span>CoSolve</span></div>
      <h2 className="slide-title content-top w-[86vw] font-display">A calm interface for a complex workflow.</h2>
      <div className="absolute top-[43vh] left-[6vw] w-[49vw] flex flex-col gap-[2.8vh]">
        <p className="copy">Light and dark modes beside the CoSolve logo</p>
        <p className="copy">Resizable, collapsible sidebar</p>
        <p className="copy">Mobile pop-out navigation</p>
        <p className="copy">Focused case workspace with clear loading and error states</p>
        <p className="copy">Smooth transitions without hiding the next action</p>
      </div>
      <svg aria-hidden="true" className="absolute top-[42vh] right-[4vw] w-[38vw] h-[44vh]" viewBox="0 0 420 340">
        <rect x="8" y="8" width="370" height="260" rx="12" fill="#294eae"/>
        <rect x="22" y="23" width="342" height="230" rx="7" fill="#edf1fa"/>
        <path d="M39 42h29M39 66h40M39 84h32M39 102h36M39 120h26" stroke="#65708c" strokeWidth="5" strokeLinecap="round"/>
        <path d="M101 43h128M101 67h235M101 84h170" stroke="#a4aec7" strokeWidth="6" strokeLinecap="round"/>
        <rect x="101" y="108" width="236" height="126" rx="4" fill="#d4dcef"/>
        <rect x="84" y="139" width="326" height="193" rx="10" fill="#44378f"/>
        <rect x="97" y="151" width="300" height="169" rx="5" fill="#151a2b"/>
        <path d="M112 168h25M112 193h28M112 215h20M112 237h24" stroke="#7e6fe0" strokeWidth="5" strokeLinecap="round"/>
        <path d="M164 171h145M164 197h214M164 214h160M164 253h214M164 270h174M164 287h189" stroke="#404b6b" strokeWidth="6" strokeLinecap="round"/>
      </svg>
      <p className="page-number">19 / 20</p>
    </div>
  );
}
