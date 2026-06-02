// ─────────────────────────────────────────────────────────────────────────────
// SERVICE REPORT FORM v4
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useRef, useEffect, useCallback } from "react";
const React = { useState, useEffect };

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia("(min-width: 1025px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1025px)");
    const handler = e => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isDesktop;
}

import { createPortal } from "react-dom";
import { C, TRAINERS } from "../lib/constants";
import { generateServiceReportPdf } from "../lib/serviceReportPdfGenerator";
import {
  saveReportData, loadReportData, saveSignatures, loadSignatures, pruneExpired,
  savePendingSync, loadPendingSync, markSynced, isSynced,
} from "../lib/reportStorage";
import { db, session } from "../lib/supabase";

function isoToDisplay(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function todayDisplay() {
  const d = new Date();
  return `${String(d.getDate()).padStart(2,"0")}.${String(d.getMonth()+1).padStart(2,"0")}.${d.getFullYear()}`;
}

function diffMins(a, b) {
  if (!a || !b) return 0;
  const [ah, am] = a.split(":").map(Number);
  const [bh, bm] = b.split(":").map(Number);
  const d = (bh * 60 + bm) - (ah * 60 + am);
  return d > 0 ? d : 0;
}

function diffTime(a, b) {
  const mins = diffMins(a, b);
  if (!mins) return "—";
  return `${String(Math.floor(mins/60)).padStart(2,"0")}:${String(mins%60).padStart(2,"0")}`;
}

function diffLabel(a, b) {
  const mins = diffMins(a, b);
  if (!mins) return "—";
  const h = Math.floor(mins/60), m = mins%60;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function totalWorkHours(rows) {
  let total = 0;
  for (const r of rows) {
    if (r.mode === "depOnly" || r.mode === "retOnly") continue;
    const d = diffMins(r.arrTime, r.retDepTime);
    if (d > 0) total += d;
  }
  const h = Math.floor(total/60), m = total%60;
  return `${h},${String(Math.round(m/60*100)).padStart(2,"0")} godz`;
}

function totalKm(rows) {
  return rows.reduce((sum, r) => {
    const m = r.mode || "full";
    if (m === "depOnly") return sum + (parseInt(r.km) || 0);
    if (m === "retOnly") return sum + (parseInt(r.retKm) || 0);
    return sum + (parseInt(r.km) || 0) + (parseInt(r.retKm) || 0);
  }, 0);
}

function makeRowFromPrev(dateIso, prev) {
  const nextDepFrom = prev
    ? (prev.mode === "depOnly" ? (prev.depTo || "") : (prev.retTo || prev.depFrom || ""))
    : "";
  const nextDepTo = prev
    ? (prev.mode === "depOnly" ? "" : (prev.retFrom || prev.depTo || ""))
    : "";
  const base = prev ? {
    depFrom: nextDepFrom, depTo: nextDepTo,
    depTime: prev.depTime, arrTime: prev.arrTime,
    workStart: prev.workStart, workEnd: prev.workEnd,
    retDepTime: prev.retDepTime, retArrTime: prev.retArrTime,
    retFrom: nextDepTo, retTo: nextDepFrom,
    km: prev.km, retKm: prev.retKm || "", mode: "full",
  } : {
    depFrom:"", depTo:"", depTime:"07:00", arrTime:"08:00",
    workStart:"08:00", workEnd:"16:00", retDepTime:"16:00", retArrTime:"17:00",
    retFrom:"", retTo:"", km:"0", retKm:"", mode:"full",
  };
  return { date: isoToDisplay(dateIso), ...base };
}

const FONT = "'Helvetica Neue',Helvetica,Arial,sans-serif";

const inp = (ex={}) => ({
  width:"100%", padding:"8px 10px", border:`1.5px solid ${C.grey}`,
  borderRadius:6, fontSize:13, fontFamily:FONT, color:C.black,
  background:C.white, boxSizing:"border-box", outline:"none", ...ex,
});

const lbl = (ex={}) => ({
  fontSize:11, fontWeight:700, color:C.greyDk, letterSpacing:0.3,
  marginBottom:4, display:"block", ...ex,
});

const secTitle = (ex={}) => ({
  fontSize:11, fontWeight:700, color:C.greyMid, letterSpacing:1,
  textTransform:"uppercase", marginBottom:8, paddingBottom:4,
  borderBottom:`1px solid ${C.grey}`, ...ex,
});

const timeInpStyle = {
  padding:"6px 8px", border:`1.5px solid ${C.grey}`, borderRadius:6,
  fontSize:13, fontFamily:FONT, width:"100%", textAlign:"center",
  color:C.black, outline:"none", background:C.white, boxSizing:"border-box",
};

const routeInpStyle = {
  border:"none", borderBottom:`1.5px solid ${C.grey}`, borderRadius:0,
  padding:"3px 4px", fontSize:13, fontFamily:FONT, color:C.black,
  background:"transparent", outline:"none", width:"100%",
  boxSizing:"border-box", minWidth:60,
};

function TimeInput({ value, onChange, style }) {
  const [raw, setRaw] = React.useState(value || "");
  React.useEffect(() => { setRaw(value || ""); }, [value]);
  function handleChange(e) {
    let v = e.target.value.replace(/[^0-9:]/g, "");
    if (v.length === 2 && !v.includes(":") && raw.length < 2) v = v + ":";
    if (v.length > 5) v = v.slice(0, 5);
    setRaw(v);
    if (/^\d{2}:\d{2}$/.test(v)) {
      const [hh, mm] = v.split(":").map(Number);
      if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) onChange(v);
    }
    if (v === "") onChange("");
  }
  function handleBlur() {
    if (!/^\d{2}:\d{2}$/.test(raw)) { setRaw(""); onChange(""); }
  }
  return (
    <input type="text" inputMode="numeric" value={raw} onChange={handleChange}
      onBlur={handleBlur} placeholder="HH:MM" maxLength={5} style={style || timeInpStyle} />
  );
}

function DayCard({ row, idx, totalRows, onUpdate, onRemove }) {
  const mode = row.mode || "full";
  const workDuration = diffLabel(row.arrTime, row.retDepTime);
  const tripDuration = diffLabel(row.depTime, row.arrTime);
  const retDuration = diffLabel(row.retDepTime, row.retArrTime);
  const km = mode === "depOnly" ? (parseInt(row.km)||0)
    : mode === "retOnly" ? (parseInt(row.retKm)||0)
    : (parseInt(row.km)||0) + (parseInt(row.retKm)||0);
  const isFirstDay = idx === 0;
  const isLastDay = idx === totalRows - 1;
  const dots = { dep:"#3B82F6", work:"#8AB73E", ret:"#9CA3AF" };
  const modeCbLabel = { display:"flex", alignItems:"center", gap:4, marginLeft:"auto", fontSize:10, color:C.greyMid, cursor:"pointer", userSelect:"none", fontWeight:600 };

  return (
    <div style={{ background:C.white, borderRadius:12, marginBottom:10, border:`1px solid ${C.grey}`, overflow:"hidden", boxShadow:"0 1px 4px rgba(0,0,0,0.06)" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px 8px", borderBottom:`1px solid ${C.grey}`, background:"#FAFAFA" }}>
        <div>
          <span style={{ fontSize:14, fontWeight:800, color:C.black }}>Dzień {idx+1}</span>
          <input value={row.date} onChange={e => onUpdate("date", e.target.value)} placeholder="DD.MM.RRRR"
            style={{ ...routeInpStyle, display:"inline-block", width:"auto", marginLeft:8, fontSize:12, color:C.greyMid, fontWeight:500, borderBottom:`1px dashed ${C.grey}` }} />
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          {km > 0 && <span style={{ background:C.greenBg, color:C.greenDk, fontSize:11, fontWeight:700, borderRadius:20, padding:"3px 10px", whiteSpace:"nowrap" }}>{km} km</span>}
          {totalRows > 1 && <button onClick={onRemove} style={{ background:"none", border:"none", color:C.greyMid, fontSize:16, cursor:"pointer", padding:"0 2px", lineHeight:1 }}>×</button>}
        </div>
      </div>
      <div style={{ padding:"10px 14px 12px" }}>
        {(mode === "full" || mode === "depOnly") && (
          <div style={{ marginBottom: mode === "full" ? 10 : 0 }}>
            <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:6 }}>
              <span style={{ width:10, height:10, borderRadius:"50%", background:dots.dep, flexShrink:0, display:"inline-block" }} />
              <span style={{ fontSize:12, fontWeight:700, color:C.black }}>Odjazd</span>
              {isFirstDay && (<label style={modeCbLabel}><input type="checkbox" checked={mode==="depOnly"} onChange={()=>onUpdate("mode",mode==="depOnly"?"full":"depOnly")} style={{ accentColor:dots.dep, cursor:"pointer" }} />Tylko dojazd</label>)}
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:6, paddingLeft:17 }}>
              <input value={row.depFrom} onChange={e=>onUpdate("depFrom",e.target.value)} placeholder="Skąd" style={{ ...routeInpStyle, flex:1 }} />
              <span style={{ color:C.greyMid, fontSize:13, flexShrink:0 }}>→</span>
              <input value={row.depTo} onChange={e=>onUpdate("depTo",e.target.value)} placeholder="Dokąd" style={{ ...routeInpStyle, flex:1 }} />
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:6, paddingLeft:17 }}>
              <div style={{ flex:1 }}><div style={{ fontSize:9, color:C.greyMid, textAlign:"center", marginBottom:3 }}>Odjazd</div><TimeInput value={row.depTime} onChange={v=>onUpdate("depTime",v)} /></div>
              <span style={{ color:C.greyMid, fontSize:13, flexShrink:0, marginTop:14 }}>→</span>
              <div style={{ flex:1 }}><div style={{ fontSize:9, color:C.greyMid, textAlign:"center", marginBottom:3 }}>Przyjazd</div><TimeInput value={row.arrTime} onChange={v=>onUpdate("arrTime",v)} /></div>
              <div style={{ flex:"0 0 40px" }}><div style={{ fontSize:9, color:C.greyMid, textAlign:"center", marginBottom:3 }}>KM</div><input value={row.km} onChange={e=>onUpdate("km",e.target.value)} placeholder="km" inputMode="numeric" style={{ ...timeInpStyle, padding:"6px 2px", width:"100%", boxSizing:"border-box" }} /></div>
              <div style={{ flex:"0 0 auto", textAlign:"center", marginTop:14 }}><span style={{ fontSize:11, color:C.greyMid, whiteSpace:"nowrap" }}>{tripDuration !== "—" ? `• ${tripDuration}` : ""}</span></div>
            </div>
          </div>
        )}
        {mode === "full" && (
          <>
            <div style={{ borderTop:`1px solid ${C.grey}`, margin:"10px 0" }} />
            <div style={{ marginBottom:10 }}>
              <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:6 }}>
                <span style={{ width:10, height:10, borderRadius:"50%", background:dots.work, flexShrink:0, display:"inline-block" }} />
                <span style={{ fontSize:12, fontWeight:700, color:C.black }}>Work</span>
              </div>
              <div style={{ paddingLeft:17 }}>
                <div style={{ display:"flex", alignItems:"center", gap:6, background:C.greenBg, borderRadius:8, padding:"8px 10px" }}>
                  <div style={{ flex:1 }}><div style={{ fontSize:9, color:C.greenDk, textAlign:"center", marginBottom:3, fontWeight:700 }}>Start</div><div style={{ ...timeInpStyle, border:`1.5px solid #B8D97A`, background:"rgba(255,255,255,0.7)", fontWeight:700, textAlign:"center", color:C.black, cursor:"default" }}>{row.arrTime || "—"}</div></div>
                  <span style={{ color:C.greenDk, fontSize:13, flexShrink:0, marginTop:14 }}>→</span>
                  <div style={{ flex:1 }}><div style={{ fontSize:9, color:C.greenDk, textAlign:"center", marginBottom:3, fontWeight:700 }}>Koniec</div><div style={{ ...timeInpStyle, border:`1.5px solid #B8D97A`, background:"rgba(255,255,255,0.7)", fontWeight:700, textAlign:"center", color:C.black, cursor:"default" }}>{row.retDepTime || "—"}</div></div>
                  <div style={{ flex:"0 0 auto", textAlign:"center", background:C.green, color:"white", borderRadius:8, padding:"6px 12px", marginTop:14, fontSize:13, fontWeight:800, minWidth:38 }}>{workDuration}</div>
                </div>
              </div>
            </div>
          </>
        )}
        {(mode === "full" || mode === "retOnly") && (
          <>
            {mode === "full" && <div style={{ borderTop:`1px solid ${C.grey}`, margin:"10px 0" }} />}
            <div>
              <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:6 }}>
                <span style={{ width:10, height:10, borderRadius:"50%", background:dots.ret, flexShrink:0, display:"inline-block" }} />
                <span style={{ fontSize:12, fontWeight:700, color:C.black }}>Powrót</span>
                {isLastDay && (<label style={modeCbLabel}><input type="checkbox" checked={mode==="retOnly"} onChange={()=>onUpdate("mode",mode==="retOnly"?"full":"retOnly")} style={{ accentColor:dots.ret, cursor:"pointer" }} />Tylko powrót</label>)}
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:6, paddingLeft:17 }}>
                <input value={row.retFrom !== undefined ? row.retFrom : (row.depTo||"")} onChange={e=>onUpdate("retFrom",e.target.value)} placeholder="Skąd" style={{ ...routeInpStyle, flex:1 }} />
                <span style={{ color:C.greyMid, fontSize:13, flexShrink:0 }}>→</span>
                <input value={row.retTo !== undefined ? row.retTo : (row.depFrom||"")} onChange={e=>onUpdate("retTo",e.target.value)} placeholder="Dokąd" style={{ ...routeInpStyle, flex:1 }} />
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:6, paddingLeft:17 }}>
                <div style={{ flex:1 }}><div style={{ fontSize:9, color:C.greyMid, textAlign:"center", marginBottom:3 }}>Odjazd</div><TimeInput value={row.retDepTime} onChange={v=>onUpdate("retDepTime",v)} /></div>
                <span style={{ color:C.greyMid, fontSize:13, flexShrink:0, marginTop:14 }}>→</span>
                <div style={{ flex:1 }}><div style={{ fontSize:9, color:C.greyMid, textAlign:"center", marginBottom:3 }}>Przyjazd</div><TimeInput value={row.retArrTime} onChange={v=>onUpdate("retArrTime",v)} /></div>
                {mode === "retOnly" && (<div style={{ flex:"0 0 40px" }}><div style={{ fontSize:9, color:C.greyMid, textAlign:"center", marginBottom:3 }}>KM</div><input value={row.km} onChange={e=>onUpdate("km",e.target.value)} placeholder="km" inputMode="numeric" style={{ ...timeInpStyle, padding:"6px 2px", width:"100%", boxSizing:"border-box" }} /></div>)}
                {mode === "full" && (<div style={{ flex:"0 0 40px" }}><div style={{ fontSize:9, color:C.greyMid, textAlign:"center", marginBottom:3 }}>KM</div><input value={row.retKm||""} onChange={e=>onUpdate("retKm",e.target.value)} placeholder="km" inputMode="numeric" style={{ ...timeInpStyle, padding:"6px 2px", width:"100%", boxSizing:"border-box" }} /></div>)}
                <div style={{ flex:"0 0 auto" }}><div style={{ fontSize:9, color:C.greyMid, textAlign:"center", marginBottom:3 }}>&nbsp;</div><div style={{ ...timeInpStyle, border:"none", background:"transparent", fontSize:11, color:C.greyMid, textAlign:"center", paddingTop:8 }}>{retDuration !== "—" ? `• ${retDuration}` : ""}</div></div>
                <div style={{ flex:"0 0 auto", minWidth:10 }} />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SignatureCanvas({ padLabel, hint, onSave, onCancel }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const lastPos = useRef(null);
  const [rotated, setRotated] = useState(false);
  const CW = 900, CH = 360;
  useEffect(() => { const ctx = canvasRef.current.getContext("2d"); ctx.fillStyle = "#ffffff"; ctx.fillRect(0,0,CW,CH); }, []);
  function getPos(e) {
    const canvas = canvasRef.current; const rect = canvas.getBoundingClientRect();
    const touch = e.touches ? e.touches[0] : e;
    const rx = touch.clientX - rect.left, ry = touch.clientY - rect.top;
    if (!rotated) return { x: rx*(CW/rect.width), y: ry*(CH/rect.height) };
    return { x: ry*(CW/rect.height), y: CH - rx*(CH/rect.width) };
  }
  function startDraw(e) { e.preventDefault(); drawing.current = true; lastPos.current = getPos(e); }
  function draw(e) {
    e.preventDefault(); if (!drawing.current) return;
    const ctx = canvasRef.current.getContext("2d"); const pos = getPos(e);
    ctx.beginPath(); ctx.moveTo(lastPos.current.x, lastPos.current.y); ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = "#1A1A1A"; ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.stroke();
    lastPos.current = pos;
  }
  function endDraw(e) { e.preventDefault(); drawing.current = false; lastPos.current = null; }
  function clearCanvas() { const ctx = canvasRef.current.getContext("2d"); ctx.fillStyle = "#ffffff"; ctx.fillRect(0,0,CW,CH); }
  function save() {
    const canvas = canvasRef.current; const data = canvas.getContext("2d").getImageData(0,0,CW,CH).data;
    let hasContent = false;
    for (let i = 0; i < data.length; i += 4) { if (data[i] < 245 || data[i+1] < 245 || data[i+2] < 245) { hasContent = true; break; } }
    if (!hasContent) { alert("Proszę złożyć podpis przed zapisaniem."); return; }
    onSave(canvas.toDataURL("image/png"));
  }
  const canvasStyle = rotated
    ? { display:"block", touchAction:"none", cursor:"crosshair", width:CW, height:CH, transform:"rotate(-90deg)", transformOrigin:"center center", borderRadius:8, border:"3px solid #8AB73E" }
    : { display:"block", touchAction:"none", cursor:"crosshair", width:"100%", height:"auto", maxWidth:CW, borderRadius:8, border:"3px solid #8AB73E" };
  return (
    <div style={{ position:"fixed", inset:0, zIndex:3000, background:"#111", display:"flex", flexDirection:"column", height:"100dvh" }}>
      <div style={{ background:"#1A1A1A", color:"#fff", padding:"12px 16px", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div><div style={{ fontSize:15, fontWeight:800 }}>✍️ {padLabel}</div><div style={{ fontSize:11, opacity:0.6, marginTop:2 }}>{hint}</div></div>
        <div style={{ display:"flex", gap:8 }}><button onClick={clearCanvas} style={{ background:"#333", border:"none", color:"#fff", borderRadius:8, padding:"8px 14px", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:FONT }}>🗑</button></div>
      </div>
      <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden", background:"#222", padding:16 }}>
        {rotated ? (
          <div style={{ width:CH, height:CW, display:"flex", alignItems:"center", justifyContent:"center" }}>
            <canvas ref={canvasRef} width={CW} height={CH} style={canvasStyle} onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw} onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw} />
          </div>
        ) : (
          <canvas ref={canvasRef} width={CW} height={CH} style={canvasStyle} onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw} onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw} />
        )}
      </div>
      <div style={{ background:"#1A1A1A", padding:"12px 16px", paddingBottom:"calc(12px + env(safe-area-inset-bottom, 0px))", flexShrink:0, display:"flex", gap:10 }}>
        <button onClick={onCancel} style={{ flex:1, padding:12, background:"#333", border:"none", color:"#fff", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:FONT }}>Anuluj</button>
        <button onClick={save} style={{ flex:2, padding:12, background:"#8AB73E", border:"none", color:"#fff", borderRadius:8, fontSize:14, fontWeight:800, cursor:"pointer", fontFamily:FONT }}>✅ Zapisz podpis</button>
      </div>
    </div>
  );
}

function SignaturePreview({ sigLabel, base64, onRetake, onClear }) {
  return (
    <div>
      <div style={{ fontSize:11, fontWeight:700, color:C.greyMid, marginBottom:6 }}>{sigLabel}</div>
      <div style={{ border:"2px solid #8AB73E", borderRadius:8, overflow:"hidden", marginBottom:8, background:"#FAFAFA" }}>
        <img src={base64} alt={sigLabel} style={{ width:"100%", maxHeight:90, objectFit:"contain", display:"block" }} />
      </div>
      <div style={{ display:"flex", gap:8 }}>
        <button onClick={onClear} style={{ flex:1, padding:8, background:C.greyBg, color:C.greyDk, border:`1.5px solid ${C.grey}`, borderRadius:7, fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:FONT }}>🗑 Usuń</button>
        <button onClick={onRetake} style={{ flex:1, padding:8, background:"#EBF5FB", color:C.blue, border:`1.5px solid ${C.blue}`, borderRadius:7, fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:FONT }}>✏️ Ponów</button>
      </div>
    </div>
  );
}

export function ServiceReportForm({ entry, trainerNum, onClose }) {
  const trainerName = TRAINERS[trainerNum] || `Trener ${trainerNum}`;
  const entryDate = entry?.date || "nodate";
  const isDesktop = useIsDesktop();
  const cached = loadReportData(trainerNum, entryDate);
  const cachedSigs = loadSignatures(trainerNum, entryDate);

  const [clientName, setClientName] = useState(cached?.clientName || "");
  const [clientAddress, setClientAddress] = useState(cached?.clientAddress || "");
  const [clientCity, setClientCity] = useState(cached?.clientCity || "");
  const [signerName, setSignerName] = useState(cached?.signerName || "");
  const [rows, setRows] = useState(() => {
    if (cached?.rows?.length) return cached.rows.map(r => ({ ...r, retKm: r.retKm ?? r.km ?? "" }));
    const baseDate = entry?.date || "", endDate = entry?.endDate || baseDate, result = [];
    if (baseDate) {
      let cur = new Date(baseDate + "T12:00:00"); const end = new Date(endDate + "T12:00:00"); let prev = null;
      while (cur <= end && result.length < 7) { const row = makeRowFromPrev(cur.toISOString().slice(0,10), prev); result.push(row); prev = row; cur.setDate(cur.getDate()+1); }
    } else { result.push(makeRowFromPrev("", null)); }
    return result;
  });
  const [workDescription, setWorkDescription] = useState(cached?.workDescription ?? (entry?.title ? `1. Szkolenie: ${entry.title}.` : ""));
  const [clientNotes, setClientNotes] = useState(cached?.clientNotes || "");
  const [signatureDate, setSignatureDate] = useState(cached?.signatureDate || todayDisplay());
  const [signaturePad, setSignaturePad] = useState(null);
  const [clientSig, setClientSig] = useState(cachedSigs?.clientSig || null);
  const [technicianSig, setTechnicianSig] = useState(cachedSigs?.technicianSig || null);
  const [nearbyList, setNearbyList] = useState([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [nearbyErr, setNearbyErr] = useState("");
  const [showNearby, setShowNearby] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState("");
  const [syncStatus, setSyncStatus] = useState(() => {
    const hasPending = !!loadPendingSync(trainerNum, entryDate);
    const hasLocal = !!localStorage.getItem(`engel_report_${trainerNum}_${entryDate}_service`);
    if (hasPending) return "pending";
    if (!hasLocal) return "idle";
    return isSynced(trainerNum, entryDate) ? "synced" : "idle";
  });
  const [reportStatus, setReportStatus] = useState(null);
  const [dbReportId, setDbReportId] = useState(null);
  const localUuidRef = useRef(crypto.randomUUID());
  const pollRef = useRef(null);
  const [sending, setSending] = useState(false);
  const [isLoading, setIsLoading] = useState(navigator.onLine && !!entry?.id);
  const [isLocked, setIsLocked] = useState(() => {
    try { return localStorage.getItem(`engel_report_${trainerNum}_${entryDate}_lock`) === "1"; } catch { return false; }
  });
  function toggleLock() {
    const next = !isLocked; setIsLocked(next);
    try { if (next) localStorage.setItem(`engel_report_${trainerNum}_${entryDate}_lock`, "1"); else localStorage.removeItem(`engel_report_${trainerNum}_${entryDate}_lock`); } catch {}
  }
  const lockedFieldsStyle = isLocked ? { pointerEvents:"none", opacity:0.65, userSelect:"none" } : {};

  useEffect(() => { pruneExpired(); }, []);
  useEffect(() => {
    async function tryAutoSync() {
      const pending = loadPendingSync(trainerNum, entryDate); if (!pending) return;
      if (!navigator.onLine) { setSyncStatus("pending"); return; }
      setSyncStatus("syncing");
      try { const tok = session.getToken(); if (!tok) { setSyncStatus("pending"); return; }
        await db.upsert(tok, "service_reports", pending, "local_uuid"); markSynced(trainerNum, entryDate); setSyncStatus("synced");
      } catch (e) { console.warn("[ServiceReport] Auto-sync nieudany:", e.message); setSyncStatus("pending"); }
    } tryAutoSync();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    async function checkExisting() {
      if (!navigator.onLine) { setIsLoading(false); return; }
      const entryId = entry?.id ? String(entry.id) : null; if (!entryId) { setIsLoading(false); return; }
      try {
        const tok = session.getToken(); if (!tok) { setIsLoading(false); return; }
        const data = await db.get(tok, "service_reports", `entry_id=eq.${entryId}&trainer_id=eq.${trainerNum}&order=created_at.desc&limit=1`);
        if (!Array.isArray(data) || !data.length) { setIsLoading(false); return; }
        const existing = data[0]; setDbReportId(existing.id); setReportStatus(existing.status);
        localUuidRef.current = existing.local_uuid || localUuidRef.current;
        const d = existing.report_data || {};
        if (d.clientName) setClientName(d.clientName); if (d.clientAddress) setClientAddress(d.clientAddress);
        if (d.clientCity) setClientCity(d.clientCity); if (d.signerName) setSignerName(d.signerName);
        if (d.signatureDate) setSignatureDate(d.signatureDate); if (d.workDescription) setWorkDescription(d.workDescription);
        if (d.clientNotes) setClientNotes(d.clientNotes);
        if (Array.isArray(d.rows) && d.rows.length) setRows(d.rows.map(r => ({ ...r, retKm: r.retKm ?? r.km ?? "" })));
        if (existing.status === "awaiting_signature") startSignaturePoll(existing.id, tok);
        if (existing.status === "signed" || existing.status === "submitted") { if (d.clientSig) setClientSig(d.clientSig); if (d.technicianSig) setTechnicianSig(d.technicianSig); }
      } catch (e) { console.warn("[ServiceReport] checkExisting:", e.message); } finally { setIsLoading(false); }
    } checkExisting(); return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { saveReportData(trainerNum, entryDate, { clientName, clientAddress, clientCity, signerName, rows, workDescription, clientNotes, signatureDate }); }, [trainerNum, entryDate, clientName, clientAddress, clientCity, signerName, rows, workDescription, clientNotes, signatureDate]);
  useEffect(() => { saveSignatures(trainerNum, entryDate, { clientSig, technicianSig }); }, [trainerNum, entryDate, clientSig, technicianSig]);

  async function fetchNearbyCompanies() {
    setNearbyErr(""); setShowNearby(false); setNearbyLoading(true);
    try {
      const pos = await new Promise((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000 })
      );
      const { latitude: lat, longitude: lng } = pos.coords;
      const apiKey = import.meta.env.VITE_GOOGLE_PLACES_KEY;
      if (!apiKey) throw new Error("Dodaj VITE_GOOGLE_PLACES_KEY do .env.local");
      const res = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.location",
        },
        body: JSON.stringify({
          locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radiusMeters: 3000 } },
          includedTypes: ["establishment"],
          maxResultCount: 5,
          rankPreference: "DISTANCE",
        }),
      });
      if (!res.ok) throw new Error(`Places API błąd: ${res.status}`);
      const data = await res.json();
      const places = (data.places || []).slice(0, 3).map(p => {
        const parts = (p.formattedAddress || "").split(",").map(s => s.trim());
        const address = parts[0] || "";
        const city = parts.slice(1, parts.length - 1).join(", ");
        const dLat = (p.location?.latitude - lat) * 111000;
        const dLng = (p.location?.longitude - lng) * 111000 * Math.cos(lat * Math.PI / 180);
        const distance = p.location ? Math.round(Math.sqrt(dLat * dLat + dLng * dLng)) : null;
        return { name: p.displayName?.text || "", address, city, distance };
      });
      setNearbyList(places); setShowNearby(true);
    } catch (e) {
      if (e.code === 1) setNearbyErr("Brak zgody na lokalizację — zezwól w przeglądarce.");
      else if (e.code === 2) setNearbyErr("Nie można ustalić lokalizacji GPS.");
      else setNearbyErr(e.message || "Błąd pobierania firm.");
    } finally { setNearbyLoading(false); }
  }
  function pickCompany(place) {
    setClientName(place.name);
    setClientAddress(place.address);
    setClientCity(place.city);
    setShowNearby(false); setNearbyErr("");
  }

  function updateRow(idx, field, val) {
    setRows(prev => {
      const fieldsToPropagate = new Set(["depFrom","depTo","depTime","arrTime","workStart","workEnd","retDepTime","retArrTime","retFrom","retTo","km","retKm"]);
      const result = prev.map((r, i) => {
        if (i !== idx) return r;
        const next = { ...r, [field]: val };
        if (field === "arrTime") next.workStart = val; if (field === "retDepTime") next.workEnd = val;
        if (field === "depFrom") next.retTo = val; if (field === "depTo") next.retFrom = val;
        if (field === "km" && (r.retKm === "" || r.retKm === "0" || r.retKm === undefined)) next.retKm = val;
        return next;
      });
      if (field === "date") {
        const parts = val.split(".");
        if (parts.length === 3) { const [dd, mm, yyyy] = parts; const base = new Date(`${yyyy}-${mm}-${dd}T12:00:00`);
          if (!isNaN(base.getTime())) { for (let i = idx+1; i < result.length; i++) { const next = new Date(base); next.setDate(base.getDate()+(i-idx)); result[i] = { ...result[i], date: `${String(next.getDate()).padStart(2,"0")}.${String(next.getMonth()+1).padStart(2,"0")}.${next.getFullYear()}` }; } }
        } return result;
      }
      // --- NOWE: automatyczna korekta tras przy zmianie trybu ---
if (field === "mode") {
  const changed = result[idx];

  if (val === "depOnly") {
    // Dzień N = "Tylko dojazd" (np. Pułtusk → Hotel)
    // Kolejne dni: startują z Hotel, wracają do Hotel
    for (let i = idx + 1; i < result.length; i++) {
      result[i] = {
        ...result[i],
        depFrom: changed.depTo || "",   // Hotel
        retTo:   changed.depTo || "",   // Hotel
        depTo:   "",                     // do ustalenia
        retFrom: "",                     // do ustalenia
      };
    }
  }

  if (val === "retOnly") {
    // Dzień N = "Tylko powrót" (np. Hotel → Pułtusk)
    // Poprzednie dni nie ruszamy, ale ten dzień
    // powinien mieć retFrom/retTo z poprzedniego kontekstu
    // — to już działa poprawnie z istniejącej propagacji
  }
if (val === "full" && changed.depFrom && changed.depTo) {
  for (let i = idx + 1; i < result.length; i++) {
    result[i] = {
      ...result[i],
      depFrom: changed.depFrom,
      depTo:   changed.depTo,
      retFrom: changed.depTo,
      retTo:   changed.depFrom,
    };
  }
}
  return result;
}
// --- KONIEC NOWEGO ---
      if (fieldsToPropagate.has(field)) {
        for (let i = idx+1; i < result.length; i++) {
          let nextRow = { ...result[i], [field]: val };
          if (field === "arrTime") nextRow.workStart = val; if (field === "retDepTime") nextRow.workEnd = val;
          if (field === "depFrom") nextRow.retTo = val; if (field === "depTo") nextRow.retFrom = val;
          if (field === "km") nextRow.retKm = val;
          if (field === "retTo") { nextRow.depFrom = val; nextRow.retTo = val; }
          result[i] = nextRow;
        }
      } return result;
    });
  }
  function addRow() { setRows(prev => { const updated = [...prev]; const last = updated[updated.length-1]; return [...updated, makeRowFromPrev("", last)]; }); }
  function removeRow(idx) { setRows(prev => prev.filter((_,i) => i !== idx)); }
  function startSignaturePoll(reportId, tok) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try { const data = await db.get(tok, "service_reports", `id=eq.${reportId}&select=status,report_data`);
        if (!Array.isArray(data) || !data.length) return; const { status, report_data } = data[0];
        if (status === "signed" || status === "submitted") { clearInterval(pollRef.current); setReportStatus(status); if (report_data?.clientSig) setClientSig(report_data.clientSig); if (report_data?.technicianSig) setTechnicianSig(report_data.technicianSig); }
      } catch {}
    }, 5000);
  }
  async function handleSendToPhone() {
    if (!clientName.trim()) { setSaveErr("Podaj nazwę klienta przed wysłaniem."); return; }
    if (!navigator.onLine) { setSaveErr("Brak internetu. Nie można przesłać raportu."); return; }
    setSending(true); setSaveErr("");
    try { const tok = session.getToken(); if (!tok) throw new Error("Brak sesji.");
      const firstRowDate = rows[0]?.date ? (() => { const [d,m,y] = rows[0].date.split("."); return `${y}-${m}-${d}`; })() : new Date().toISOString().slice(0,10);
      const payload = { local_uuid: localUuidRef.current, entry_id: entry?.id ? String(entry.id) : null, trainer_id: trainerNum, trainer_name: trainerName, client_name: clientName.trim(), report_date: firstRowDate, status: "awaiting_signature",
        report_data: { clientName, clientAddress, clientCity, signerName, signatureDate, technicianName: trainerName, rows, workDescription, clientNotes, clientSig: null, technicianSig: null } };
      const saved = await db.upsert(tok, "service_reports", payload, "local_uuid"); const savedId = saved?.[0]?.id || dbReportId;
      if (savedId) { setDbReportId(savedId); startSignaturePoll(savedId, tok); } setReportStatus("awaiting_signature");
    } catch (e) { setSaveErr("Błąd wysyłania: " + (e.message || "nieznany")); } finally { setSending(false); }
  }
  async function handleSaveMobileSignatures() {
    if (!clientSig || !technicianSig) { setSaveErr("Oba podpisy są wymagane."); return; }
    if (!navigator.onLine) { setSaveErr("Brak internetu. Nie można zapisać podpisów."); return; }
    setSaving(true); setSaveErr("");
    try { const tok = session.getToken(); if (!tok) throw new Error("Brak sesji."); const id = dbReportId; if (!id) throw new Error("Brak ID raportu.");
      const current = await db.get(tok, "service_reports", `id=eq.${id}&select=report_data`); const existingData = current?.[0]?.report_data || {};
      await db.update(tok, "service_reports", `id=eq.${id}`, { status: "signed", report_data: { ...existingData, clientSig, technicianSig } });
      setReportStatus("signed"); if (pollRef.current) clearInterval(pollRef.current);
    } catch (e) { setSaveErr("Błąd zapisu podpisów: " + (e.message || "nieznany")); } finally { setSaving(false); }
  }
  async function handleCancelWaiting() {
    if (pollRef.current) clearInterval(pollRef.current); setReportStatus("draft");
    try { const tok = session.getToken(); if (tok && dbReportId) await db.update(tok, "service_reports", `id=eq.${dbReportId}`, { status: "cancelled" }); } catch {}
  }
  async function handleClose() {
    const protectedStatuses = ["submitted", "awaiting_signature", "signed"];
    if (navigator.onLine && !protectedStatuses.includes(reportStatus)) {
      try { const tok = session.getToken(); if (tok) {
        const firstDate = rows[0]?.date ? (() => { const [d,m,y] = rows[0].date.split("."); return `${y}-${m}-${d}`; })() : new Date().toISOString().slice(0,10);
        await db.upsert(tok, "service_reports", { local_uuid: localUuidRef.current, entry_id: entry?.id ? String(entry.id) : null, trainer_id: trainerNum, trainer_name: trainerName, client_name: clientName.trim() || null, report_date: firstDate, status: "draft",
          report_data: { clientName, clientAddress, clientCity, signerName, signatureDate, technicianName: trainerName, rows, workDescription, clientNotes } }, "local_uuid");
      }} catch (e) { console.warn("[ServiceReport] handleClose draft save:", e.message); }
    } onClose();
  }
  async function handleGenerate() {
    if (!clientName.trim()) { setSaveErr("Podaj nazwę klienta."); return; }
    setSaving(true); setSaveErr("");
    try {
      await generateServiceReportPdf({ clientName, clientAddress, clientCity, signerName, signatureDate, technicianName: trainerName, rows, workDescription, clientNotes, clientSig, technicianSig });
      try { const tok = session.getToken(); if (tok) {
        const firstRowDate = rows[0]?.date ? (() => { const [d,m,y] = rows[0].date.split("."); return `${y}-${m}-${d}`; })() : new Date().toISOString().slice(0,10);
        const supabasePayload = { local_uuid: localUuidRef.current, entry_id: entry?.id ? String(entry.id) : null, trainer_id: trainerNum, trainer_name: trainerName, client_name: clientName.trim(), report_date: firstRowDate, status: "submitted",
          report_data: { clientName, clientAddress, clientCity, signerName, signatureDate, technicianName: trainerName, rows, workDescription, clientNotes, clientSig: clientSig || null, technicianSig: technicianSig || null } };
        savePendingSync(trainerNum, entryDate, supabasePayload); setSyncStatus("syncing");
        if (navigator.onLine) { try { await db.upsert(tok, "service_reports", supabasePayload, "local_uuid"); markSynced(trainerNum, entryDate); setSyncStatus("synced"); setReportStatus("submitted"); } catch (dbErr) { console.warn("[ServiceReport] Błąd zapisu do Supabase:", dbErr.message); setSyncStatus("pending"); } }
        else { setSyncStatus("pending"); setReportStatus("submitted"); }
      }} catch (dbErr) { console.warn("[ServiceReport] Nieoczekiwany błąd sync:", dbErr.message); }
    } catch (e) { setSaveErr(e.message || "Błąd generowania PDF."); } finally { setSaving(false); }
  }

  return (
    <>
      {signaturePad === "client" && createPortal(<SignatureCanvas padLabel="Podpis klienta" hint="Poproś klienta o złożenie podpisu." onSave={b64 => { setClientSig(b64); setSignaturePad(null); }} onCancel={() => setSignaturePad(null)} />, document.body)}
      {signaturePad === "technician" && createPortal(<SignatureCanvas padLabel="Podpis trenera" hint="Złóż swój podpis." onSave={b64 => { setTechnicianSig(b64); setSignaturePad(null); }} onCancel={() => setSignaturePad(null)} />, document.body)}
      {createPortal(
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:1200, display:"flex", visibility: signaturePad ? "hidden" : "visible", flexDirection:"column", fontFamily:FONT }}>
          <div style={{ display:"flex", flexDirection:"column", maxWidth:520, width:"100%", margin:"0 auto", minHeight:"100%", background:C.greyBg, overflowY:"auto", position:"relative" }}>
            {/* Nagłówek */}
            <div style={{ background:C.black, color:C.white, padding:"14px 16px", paddingTop:"calc(14px + env(safe-area-inset-top))", display:"flex", alignItems:"center", gap:10, position:"sticky", top:0, zIndex:10 }}>
              <button onClick={handleClose} style={{ background:"none", border:"none", color:"#fff", fontSize:20, cursor:"pointer", padding:"0 6px 0 0", lineHeight:1 }}>←</button>
              <div><div style={{ fontSize:14, fontWeight:800 }}>📋 Raport serwisowy</div><div style={{ fontSize:11, opacity:0.7, marginTop:2 }}>{trainerName}</div></div>
              <div style={{ marginLeft:"auto", fontSize:10, opacity:0.4, fontWeight:700 }}>Auto-zapis ✓</div>
            </div>
            {syncStatus === "pending" && (<div style={{ background:"#FEF9E7", borderBottom:"1px solid #F9CA24", padding:"8px 16px", fontSize:11, color:"#856404", display:"flex", alignItems:"center", gap:8 }}><span>⚠️</span><span>Raport oczekuje na synchronizację z systemem.</span></div>)}
            {syncStatus === "syncing" && (<div style={{ background:"#EBF5FB", borderBottom:"1px solid #AED6F1", padding:"8px 16px", fontSize:11, color:"#1A5276", display:"flex", alignItems:"center", gap:8 }}><span>🔄</span><span>Synchronizowanie z systemem…</span></div>)}
            {syncStatus === "synced" && (<div style={{ background:"#EAFAF1", borderBottom:"1px solid #A9DFBF", padding:"8px 16px", fontSize:11, color:"#1E8449", display:"flex", alignItems:"center", gap:8 }}><span>✅</span><span>Raport zsynchronizowany z systemem.</span></div>)}
            <div style={{ padding:"16px 16px 100px", flex:1, opacity: reportStatus === "awaiting_signature" && isDesktop ? 0.65 : 1, transition:"opacity 0.2s", position:"relative" }}>
              {isLoading && (<div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"60px 20px", gap:12 }}><div style={{ fontSize:24 }}>🔄</div><div style={{ fontSize:13, fontWeight:700, color:C.greyDk }}>Ładowanie danych…</div><div style={{ fontSize:11, color:C.greyMid }}>Pobieram raport z systemu</div></div>)}
              {!isLoading && (
                <>
                  {isLocked && (<div style={{ marginBottom:12, padding:"9px 12px", background:"#FDEDEC", border:"1px solid #F5B7B1", borderRadius:8, fontSize:11, color:"#922B21", fontWeight:700, lineHeight:1.4 }}>🔒 Raport serwisowy jest zablokowany — pola są tylko do odczytu. Możesz nadal wygenerować PDF, zamknąć formularz lub odblokować raport.</div>)}
                  <div style={lockedFieldsStyle}>
                    <div style={{ background:C.white, borderRadius:10, padding:14, marginBottom:12, border:`1px solid ${C.grey}` }}>
                      <div style={secTitle()}>{"🏭 Dane klienta"}</div>
                      <div style={{ marginBottom:10 }}>
                        <span style={lbl()}>{"Nazwa firmy *"}</span>
                        <div style={{ position:"relative" }}>
                          <div style={{ display:"flex", gap:6 }}>
                            <input value={clientName} onChange={e=>{ setClientName(e.target.value); setShowNearby(false); }} placeholder="np. HORIZONT ROLOS Sp. z o.o." style={{ ...inp(), flex:1 }} />
                            <button onClick={fetchNearbyCompanies} disabled={nearbyLoading} title="Znajdź pobliskie firmy" style={{ flexShrink:0, width:42, background:nearbyLoading?"#EBF5FB":C.blue, color:"#fff", border:"none", borderRadius:6, fontSize:17, cursor:nearbyLoading?"default":"pointer", fontFamily:FONT, display:"flex", alignItems:"center", justifyContent:"center" }}>
                              {nearbyLoading ? "⏳" : "📍"}
                            </button>
                          </div>
                          {nearbyErr && <div style={{ fontSize:11, color:C.red, marginTop:4, paddingLeft:2 }}>⚠️ {nearbyErr}</div>}
                          {showNearby && nearbyList.length > 0 && (
                            <div style={{ position:"absolute", top:"100%", left:0, right:0, zIndex:200, background:C.white, border:`1.5px solid ${C.blue}`, borderRadius:8, boxShadow:"0 4px 20px rgba(0,0,0,0.13)", overflow:"hidden", marginTop:4 }}>
                              <div style={{ padding:"7px 12px", background:"#EBF5FB", borderBottom:`1px solid ${C.grey}`, fontSize:11, fontWeight:700, color:"#1A5276" }}>📍 3 najbliższe firmy</div>
                              {nearbyList.map((place, i) => (
                                <button key={i} onClick={()=>pickCompany(place)} style={{ width:"100%", padding:"9px 12px", background:i%2===0?C.white:"#FAFAFA", border:"none", borderBottom:i<nearbyList.length-1?`1px solid ${C.grey}`:"none", textAlign:"left", cursor:"pointer", fontFamily:FONT, display:"block" }}>
                                  <div style={{ fontSize:13, fontWeight:700, color:C.black }}>{place.name}</div>
                                  <div style={{ fontSize:11, color:C.greyMid, marginTop:2 }}>{[place.address, place.city].filter(Boolean).join(", ")}</div>
                                  {place.distance != null && <div style={{ fontSize:10, color:C.blue, marginTop:2, fontWeight:600 }}>~ {place.distance} m od Ciebie</div>}
                                </button>
                              ))}
                              <button onClick={()=>setShowNearby(false)} style={{ width:"100%", padding:"7px 12px", background:C.greyBg, border:"none", borderTop:`1px solid ${C.grey}`, textAlign:"center", cursor:"pointer", fontFamily:FONT, fontSize:11, color:C.greyMid }}>Zamknij</button>
                            </div>
                          )}
                        </div>
                      </div>
                      <div style={{ marginBottom:10 }}><span style={lbl()}>Ulica i numer</span><input value={clientAddress} onChange={e=>setClientAddress(e.target.value)} placeholder="np. Henryka Sienkiewicza 2" style={inp()} /></div>
                      <div style={{ marginBottom:10 }}><span style={lbl()}>Kod pocztowy i miasto</span><input value={clientCity} onChange={e=>setClientCity(e.target.value)} placeholder="np. 07-200 Wyszków" style={inp()} /></div>
                      <div><span style={lbl()}>Osoba podpisująca</span><input value={signerName} onChange={e=>setSignerName(e.target.value)} placeholder="np. Jan Kowalski — Kierownik Produkcji" style={inp()} /></div>
                    </div>
                    <div style={{ background:C.white, borderRadius:10, padding:14, marginBottom:12, border:`1px solid ${C.grey}` }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                        <div style={secTitle({ marginBottom:0, borderBottom:"none", paddingBottom:0 })}>🚗 Wyjazdy</div>
                        <div style={{ display:"flex", gap:8, alignItems:"center" }}><span style={{ fontSize:11, color:C.greyMid }}><strong style={{ color:C.black }}>{totalKm(rows)} km</strong></span><span style={{ fontSize:10, color:C.greyMid }}>•</span><span style={{ fontSize:11, color:C.greenDk, fontWeight:700 }}>{totalWorkHours(rows)}</span></div>
                      </div>
                      {rows.map((r, idx) => (<DayCard key={idx} row={r} idx={idx} totalRows={rows.length} onUpdate={(field, val) => updateRow(idx, field, val)} onRemove={() => removeRow(idx)} />))}
                      <button onClick={addRow} style={{ width:"100%", padding:9, background:"none", border:`1.5px dashed ${C.grey}`, borderRadius:8, color:C.greyMid, fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:FONT }}>{"+ Dodaj dzień"}</button>
                    </div>
                    <div style={{ background:C.white, borderRadius:10, padding:14, marginBottom:12, border:`1px solid ${C.grey}` }}>
                      <div style={secTitle()}>📝 Opis pracy</div>
                      <textarea value={workDescription} onChange={e=>setWorkDescription(e.target.value)} rows={4} placeholder="np. 1. Szkolenie z podstaw obsługi i programowania robotów viper..." style={{ ...inp(), resize:"vertical", lineHeight:1.5 }} />
                    </div>
                    <div style={{ background:C.white, borderRadius:10, padding:14, marginBottom:12, border:`1px solid ${C.grey}` }}>
                      <div style={secTitle()}>💬 Uwagi klienta</div>
                      <textarea value={clientNotes} onChange={e=>setClientNotes(e.target.value)} rows={3} placeholder="Uwagi lub spostrzeżenia klienta (opcjonalnie)..." style={{ ...inp(), resize:"vertical", lineHeight:1.5 }} />
                    </div>
                    <div style={{ background:C.white, borderRadius:10, padding:14, marginBottom:12, border:`1px solid ${C.grey}` }}>
                      <div style={secTitle()}>✍️ Podpisy</div>
                      {reportStatus === "awaiting_signature" ? (
                        isDesktop ? (
                          <div style={{ textAlign:"center", padding:"16px 8px" }}>
                            <div style={{ fontSize:28, marginBottom:8 }}>📱</div>
                            <div style={{ fontWeight:700, fontSize:14, color:C.black, marginBottom:6 }}>Oczekiwanie na podpis na telefonie…</div>
                            <div style={{ fontSize:12, color:C.greyMid, marginBottom:16 }}>Zaloguj się na telefonie i otwórz ten raport — zobaczysz możliwość zebrania podpisu.</div>
                            <div style={{ display:"flex", gap:8, justifyContent:"center", flexWrap:"wrap" }}>
                              <div style={{ fontSize:11, color:C.greyMid, background:C.greyBg, borderRadius:20, padding:"4px 12px" }}>🔄 Sprawdzam co 5 sekund…</div>
                              <button onClick={handleCancelWaiting} style={{ fontSize:11, color:C.red, background:"transparent", border:`1px solid ${C.red}`, borderRadius:20, padding:"4px 12px", cursor:"pointer", fontFamily:FONT }}>Edytuj ponownie</button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ padding:"8px 0" }}>
                            <div style={{ background:"#F4F0FF", border:"2px solid #9B7FE8", borderRadius:10, padding:"12px 14px", marginBottom:14, textAlign:"center" }}>
                              <div style={{ fontSize:13, fontWeight:700, color:"#6C3CE1", marginBottom:4 }}>📋 Ten raport oczekuje na podpis</div>
                              <div style={{ fontSize:11, color:"#6C3CE1", opacity:0.8 }}>Zbierz podpisy klienta i trenera na tym telefonie.</div>
                            </div>
                            <div style={{ marginBottom:12 }}>
                              {clientSig ? (<SignaturePreview sigLabel={`Podpis klienta${signerName ? ` — ${signerName}` : ""}`} base64={clientSig} onRetake={()=>setSignaturePad("client")} onClear={()=>setClientSig(null)} />
                              ) : (<button onClick={()=>setSignaturePad("client")} style={{ width:"100%", padding:13, background:"#F0F7E0", color:"#6E9430", border:"2px dashed #8AB73E", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:FONT, display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>✍️ Pobierz podpis klienta</button>)}
                            </div>
                            <div style={{ marginBottom:14 }}>
                              {technicianSig ? (<SignaturePreview sigLabel={`Mój podpis — ${trainerName}`} base64={technicianSig} onRetake={()=>setSignaturePad("technician")} onClear={()=>setTechnicianSig(null)} />
                              ) : (<button onClick={()=>setSignaturePad("technician")} style={{ width:"100%", padding:13, background:"#EBF5FB", color:C.blue, border:`2px dashed ${C.blue}`, borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:FONT, display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>🖊 Podpis trenera</button>)}
                            </div>
                            {clientSig && technicianSig && (<button onClick={handleSaveMobileSignatures} disabled={saving} style={{ width:"100%", padding:14, background:saving?C.greyMid:"#6C3CE1", color:C.white, border:"none", borderRadius:8, fontSize:14, fontWeight:800, cursor:saving?"default":"pointer", fontFamily:FONT, display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>{saving ? "⏳ Zapisuję…" : "✅ Zapisz podpisy"}</button>)}
                          </div>
                        )
                      ) : reportStatus === "signed" || (clientSig && technicianSig) ? (
                        <>
                          <div style={{ marginBottom:14 }}><span style={lbl()}>Data podpisu</span><input value={signatureDate} onChange={e=>setSignatureDate(e.target.value)} placeholder="DD.MM.YYYY" style={inp({ maxWidth:180 })} /></div>
                          <div style={{ marginBottom:12 }}><SignaturePreview sigLabel={`Podpis klienta${signerName ? ` — ${signerName}` : ""}`} base64={clientSig} onRetake={()=>setSignaturePad("client")} onClear={()=>setClientSig(null)} /></div>
                          <div><SignaturePreview sigLabel={`Mój podpis — ${trainerName}`} base64={technicianSig} onRetake={()=>setSignaturePad("technician")} onClear={()=>setTechnicianSig(null)} /></div>
                          {reportStatus === "signed" && (<div style={{ marginTop:10, padding:"8px 12px", background:"#EAFAF1", borderRadius:6, fontSize:12, color:"#1E8449", fontWeight:600 }}>✅ Podpis odebrany z telefonu — możesz wygenerować PDF.</div>)}
                        </>
                      ) : (
                        <>
                          <div style={{ marginBottom:14 }}><span style={lbl()}>Data podpisu</span><input value={signatureDate} onChange={e=>setSignatureDate(e.target.value)} placeholder="DD.MM.YYYY" style={inp({ maxWidth:180 })} /></div>
                          {isDesktop && (<>
                            <button onClick={handleSendToPhone} disabled={sending} style={{ width:"100%", padding:13, background:sending?C.greyBg:"#F4F0FF", color:sending?C.greyMid:"#6C3CE1", border:"2px dashed #9B7FE8", borderRadius:8, fontSize:13, fontWeight:700, cursor:sending?"default":"pointer", fontFamily:FONT, display:"flex", alignItems:"center", justifyContent:"center", gap:8, marginBottom:10 }}>{sending ? "⏳ Wysyłam…" : "📱 Prześlij na telefon i podpisz"}</button>
                            <div style={{ textAlign:"center", fontSize:11, color:C.greyMid, marginBottom:10 }}>— lub podpisz tutaj —</div>
                          </>)}
                          <div style={{ marginBottom:12 }}>
                            {clientSig ? (<SignaturePreview sigLabel={`Podpis klienta${signerName ? ` — ${signerName}` : ""}`} base64={clientSig} onRetake={()=>setSignaturePad("client")} onClear={()=>setClientSig(null)} />
                            ) : (<button onClick={()=>setSignaturePad("client")} style={{ width:"100%", padding:13, background:"#F0F7E0", color:"#6E9430", border:"2px dashed #8AB73E", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:FONT, display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>✍️ Pobierz podpis klienta</button>)}
                          </div>
                          <div>
                            {technicianSig ? (<SignaturePreview sigLabel={`Mój podpis — ${trainerName}`} base64={technicianSig} onRetake={()=>setSignaturePad("technician")} onClear={()=>setTechnicianSig(null)} />
                            ) : (<button onClick={()=>setSignaturePad("technician")} style={{ width:"100%", padding:13, background:"#EBF5FB", color:C.blue, border:`2px dashed ${C.blue}`, borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:FONT, display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>🖊 Podpis trenera</button>)}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                  {saveErr && (<div style={{ color:C.red, fontSize:12, fontWeight:600, marginBottom:10, padding:"8px 12px", background:"#FDEDEC", borderRadius:6 }}>⚠️ {saveErr}</div>)}
                  <div style={{ borderTop:`1.5px solid ${C.grey}`, padding:"16px 16px", paddingBottom:"calc(16px + env(safe-area-inset-bottom, 0px))", display:"flex", flexDirection:"column", gap:10, background:C.white, marginTop:8 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <button onClick={handleGenerate} disabled={saving} style={{ flex:1, padding:14, background:saving?C.greyMid:C.black, color:C.white, border:"none", borderRadius:8, fontSize:14, fontWeight:800, cursor:saving?"default":"pointer", fontFamily:FONT, display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>{saving ? "⏳ Generuję PDF…" : "📥 Generuj raport PDF"}</button>
                      <button onClick={toggleLock} title={isLocked ? "Odblokuj raport" : "Zablokuj raport"} style={{ flexShrink:0, width:48, height:48, borderRadius:8, border:`2px solid ${isLocked ? "#E74C3C" : C.grey}`, background:isLocked ? "#E74C3C" : C.white, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", padding:0 }}><span style={{ fontSize:22, lineHeight:1 }}>{isLocked ? "🔒" : "🔓"}</span></button>
                    </div>
                    <button onClick={handleClose} style={{ width:"100%", padding:10, background:C.white, color:C.greyDk, border:`1.5px solid ${C.grey}`, borderRadius:8, fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:FONT }}>{"Zamknij"}</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>, document.body
      )}
    </>
  );
}
