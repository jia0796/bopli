import React,{useEffect,useState} from 'react';
export function StartupMascot({second=false}) {
  return <svg className={`startup-mascot ${second?'startup-second':'startup-first'}`} viewBox="0 0 100 100" aria-hidden="true"><ellipse cx="50" cy="50" rx="34" ry={second?31:38} fill={second?'#FFE0D5':'#F6A08B'}/><circle cx="42" cy="44" r="3.4" fill={second?'#24334F':'#FFF'}/><circle cx="58" cy="44" r="3.4" fill={second?'#24334F':'#FFF'}/><path d="M41 55q9 11 18 0" stroke={second?'#D96A55':'#FFF'} strokeWidth="3.6" fill="none" strokeLinecap="round"/></svg>;
}
export default function StartupExperience({children}) {
  const [active,setActive]=useState(true);
  const [reduced]=useState(()=>Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches));
  useEffect(()=>{const timer=setTimeout(()=>setActive(false),reduced?400:1400);return()=>clearTimeout(timer);},[reduced]);
  return <><div className={active?'startup-home entering':''} data-motion={reduced?'reduced':'full'}>{children}</div>{active&&<div className="startup-screen" data-testid="startup-screen" data-motion={reduced?'reduced':'full'} aria-hidden="true"><div className="startup-stage"><StartupMascot/><StartupMascot second/></div><div className="startup-brand"><strong>Bopli</strong><span>朋友分帳管家</span></div></div>}</>;
}
