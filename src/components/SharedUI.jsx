import { useState, useEffect, useRef, memo } from "react";
import { useT } from "../lib/LangContext";
import { C } from "../lib/constants";

const LOGO_URL = "/logo-header.png";

export function Confetti({ active }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!active || !ref.current) return;
    const cv = ref.current, ctx = cv.getContext("2d");
    cv.width = window.innerWidth; cv.height = window.innerHeight;
    const cols = [C.green,C.black,C.greyMid,C.white,C.amber,C.greenDk];
    const pts = Array.from({length:100}, () => ({
      x:Math.random()*cv.width, y:-20, vx:(Math.random()-.5)*6, vy:Math.random()*4+2,
      color:cols[Math.floor(Math.random()*cols.length)], size:Math.random()*10+4,
      rot:Math.random()*360, rotV:(Math.random()-.5)*9, circle:Math.random()>.5
    }));
    let f=0, raf;
    const draw = () => {
      ctx.clearRect(0,0,cv.width,cv.height);
      pts.forEach(p => {
        p.x+=p.vx; p.y+=p.vy; p.vy+=.09; p.rot+=p.rotV;
        ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.rot*Math.PI/180); ctx.fillStyle=p.color;
        if(p.circle){ctx.beginPath();ctx.arc(0,0,p.size/2,0,Math.PI*2);ctx.fill();}
        else ctx.fillRect(-p.size/2,-p.size/4,p.size,p.size/2);
        ctx.restore();
      });
      if(++f < 200) raf = requestAnimationFrame(draw);
      else ctx.clearRect(0,0,cv.width,cv.height);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [active]);
  return <canvas ref={ref} style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:9999}}/>;
}

/* ─── SHARED UI ──────────────────────────────────────────────────────────── */
export function Header({ onLogout }) {
  const T = useT();
  return (
    <div style={{background:C.darkHdr,paddingTop:"calc(14px + env(safe-area-inset-top))",paddingBottom:"14px",paddingLeft:"18px",paddingRight:"18px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0,boxSizing:"border-box"}}>
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        <img src={LOGO_URL} alt="ENGEL" style={{height:28,mixBlendMode:"screen",display:"block"}}/>
        <div style={{borderLeft:"1px solid rgba(255,255,255,.2)",paddingLeft:12,display:"flex",alignItems:"center",gap:6}}>
          <span style={{color:C.white,fontSize:12,fontWeight:700,letterSpacing:2}}>Expert</span>
          <span style={{color:C.white,fontSize:12,fontWeight:700,letterSpacing:2}}>Academy</span>
        </div>
      </div>
      {onLogout && <button onClick={onLogout} style={{background:"none",border:"1px solid rgba(255,255,255,.2)",padding:"6px 12px",cursor:"pointer",color:"#bbb",fontSize:11,letterSpacing:1}}>WYLOGUJ</button>}
    </div>
  );
}
export function Toggle({ value, onChange, color }) {
  return (
    <div style={{width:46,height:26,borderRadius:13,background:value?(color||C.green):C.grey,cursor:"pointer",position:"relative",transition:"background .2s",flexShrink:0}} onClick={() => onChange(!value)}>
      <div style={{position:"absolute",top:3,left:value?22:3,width:20,height:20,borderRadius:"50%",background:C.white,transition:"left .2s",boxShadow:"0 1px 3px rgba(0,0,0,.2)"}}/>
    </div>
  );
}
export function SecTitle({ children }) {
  return <div style={{padding:"14px 18px",borderBottom:`1px solid ${C.grey}`,fontSize:12,fontWeight:700,letterSpacing:1,color:C.greyDk,textTransform:"uppercase"}}>{children}</div>;
}

// NAPRAWA: autoComplete przyjmowany jako prop zamiast hardkodowanego "off".
// Poprawne wartości: "email", "current-password", "new-password", "off", undefined.
// Menedżery haseł (1Password, Bitwarden, Chrome) działają tylko gdy autoComplete
// ma właściwą wartość — "off" blokuje autouzupełnianie i zmusza do słabych haseł.
export function Field({ label, value, onChange, type="text", placeholder="", note, readOnly, green, autoComplete }) {
  return (
    <div style={{marginBottom:16}}>
      <label style={{display:"block",fontSize:11,fontWeight:700,color:C.greyDk,marginBottom:6,letterSpacing:.5}}>{label}</label>
      <input readOnly={readOnly}
        style={{width:"100%",border:"none",borderBottom:`2px solid ${green?C.green:readOnly?"#ccc":C.grey}`,padding:"10px 0",fontSize:15,color:readOnly?C.greyMid:C.black,outline:"none",boxSizing:"border-box",background:readOnly?"#f7f7f7":"transparent",cursor:readOnly?"default":"text"}}
        type={type} value={value} placeholder={placeholder}
        autoComplete={autoComplete || (readOnly ? "off" : undefined)}
        onFocus={e => { setTimeout(() => e.target.scrollIntoView({ behavior: "smooth", block: "center" }), 300); }}
        onChange={e => onChange && onChange(e.target.value)}/>
      {note && <div style={{fontSize:11,color:C.greyMid,marginTop:4}}>{note}</div>}
    </div>
  );
}
export function Spinner() {
  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",padding:48}}>
      <div style={{width:32,height:32,border:`3px solid ${C.grey}`,borderTop:`3px solid ${C.green}`,borderRadius:"50%",animation:"spin 1s linear infinite"}}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
export function ClipboardSvg() {
  return (
    <svg width="110" height="120" viewBox="0 0 140 150" fill="none" stroke={C.greyDk} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="20" y="18" width="72" height="94" rx="3" fill="white" stroke={C.greyDk}/>
      <rect x="46" y="12" width="20" height="12" rx="3" fill="white" stroke={C.greyDk}/>
      <rect x="50" y="14" width="12" height="6" rx="1" fill={C.grey} stroke="none"/>
      <rect x="30" y="38" width="10" height="10" rx="1" fill={C.grey}/>
      <polyline points="32,43 35,46 40,41" strokeWidth="2" stroke={C.greyDk} fill="none"/>
      <line x1="46" y1="43" x2="80" y2="43"/>
      <rect x="30" y="54" width="10" height="10" rx="1" fill={C.grey}/>
      <polyline points="32,59 35,62 40,57" strokeWidth="2" stroke={C.greyDk} fill="none"/>
      <line x1="46" y1="59" x2="80" y2="59"/>
      <line x1="30" y1="74" x2="80" y2="74"/>
      <line x1="30" y1="80" x2="74" y2="80"/>
      <rect x="58" y="78" width="52" height="62" rx="3" fill="white" stroke={C.greyDk}/>
      <rect x="64" y="86" width="40" height="14" rx="1" fill={C.grey}/>
      {[0,1,2].map(r => [0,1,2].map(c => <rect key={`${r}${c}`} x={64+c*13} y={106+r*11} width="10" height="8" rx="1" fill={C.grey}/>))}
    </svg>
  );
}
