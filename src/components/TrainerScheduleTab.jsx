import { useState, useEffect, useMemo, useRef, lazy, Suspense } from "react";
import { Spinner } from "./SharedUI";

// OPTYMALIZACJA: DelegationForm i ServiceReportForm ładowane lazy —
// łącznie ~190 KB kodu (formularze + generatory PDF + serviceReportConfig)
// nie trafia do głównego bundla trenera. Chunk pobierany dopiero gdy
// trener kliknie "Raport serwisowy" lub "Delegacja" po raz pierwszy.
const DelegationForm    = lazy(() => import("./DelegationForm").then(m => ({ default: m.DelegationForm })));
const ServiceReportForm = lazy(() => import("./ServiceReportForm").then(m => ({ default: m.ServiceReportForm })));
import { C, GROUPS, TRAINERS, trainerInitials } from "../lib/constants";
import { TRAININGS } from "../data/trainings";
import { db } from "../lib/supabase";
import { useUser } from "../lib/UserContext";
import { useT } from "../lib/LangContext";
import { fetchHolidaysForYear } from "../lib/holidays";
import {
  TIMELINE_TRAINERS as ALL_TRAINERS,
  TIMELINE_VISIBLE_DAYS,
  TIMELINE_LABEL_COL_WIDTH,
  TIMELINE_CELL_W_FALLBACK,
  TIMELINE_HEADER_ROW_H,
  TIMELINE_TRAINER_ROW_H,
  BAR_FONT_SIZE,
  BAR_ICON_FONT_SIZE,
  BAR_BADGE_SIZE,
  BAR_BADGE_FONT_SIZE,
  LS_ACTIVE_TRAINERS_KEY as LS_KEY,
} from "../config/configApp";


const EPOCH = new Date("2020-01-01T12:00:00");

function toISO(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}
function pad(n) { return String(n).padStart(2,"0"); }

function absDay(isoDate) {
  return Math.round((new Date(isoDate + "T12:00:00") - EPOCH) / 86400000);
}

function daysInMon(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function shiftMonth({ year, month }, delta) {
  let m = month + delta, y = year;
  while (m > 11) { m -= 12; y++; }
  while (m < 0)  { m += 12; y--; }
  return { year: y, month: m };
}

function loadActiveTrainers(trainerNum) {
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (saved !== null) return JSON.parse(saved);
  } catch {}
  return trainerNum != null ? [Number(trainerNum)] : ALL_TRAINERS;
}

export function TrainerScheduleTab({ trainerNum }) {
  const { token } = useUser();
  const T         = useT();
  const now       = new Date();
  const todayISO  = toISO(now);

  const [scheduled,      setScheduled]      = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [notesModal,     setNotesModal]     = useState(null);
  const [delegationEntry, setDelegationEntry] = useState(null);
  const [serviceReportEntry, setServiceReportEntry] = useState(null);
  const [activeTrainers, setActiveTrainers] = useState(() => loadActiveTrainers(trainerNum));
  const [visibleLabel,   setVisibleLabel]   = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [holidays,       setHolidays]       = useState({});

  const [months, setMonths] = useState(() => {
    const cur = { year: now.getFullYear(), month: now.getMonth() };
    return [shiftMonth(cur, -1), cur, shiftMonth(cur, 1)];
  });

  const timelineRef         = useRef(null);
  const sizeRef             = useRef(null);
  const pendingScrollAdjust = useRef(0);
  const initialScrollDone   = useRef(false);
  const isExtending         = useRef(false);
  const scrollRestoreDate   = useRef(null);   // data centrum — przywracana po zmianie cellW/obrotu
  const isOrientChanging    = useRef(false);  // blokuje nadpisanie scrollRestoreDate podczas obrotu

  // ── Drag-to-scroll (mysz na desktopie) ────────────────────────────────────
  const isDragging   = useRef(false);
  const dragStartX   = useRef(0);
  const dragScrollL  = useRef(0);

  function onMouseDown(e) {
    if (e.button !== 0) return; // tylko lewy przycisk
    isDragging.current  = true;
    dragStartX.current  = e.clientX;
    dragScrollL.current = timelineRef.current?.scrollLeft || 0;
    e.currentTarget.style.cursor = "grabbing";
    e.currentTarget.style.userSelect = "none";
  }
  function onMouseMove(e) {
    if (!isDragging.current) return;
    const dx = e.clientX - dragStartX.current;
    if (timelineRef.current) timelineRef.current.scrollLeft = dragScrollL.current - dx;
  }
  const dragMoved = useRef(false);

  function onMouseUp(e) {
    if (!isDragging.current) return;
    const dx = Math.abs(e.clientX - dragStartX.current);
    dragMoved.current  = dx > 5; // kliknięcie vs przeciągnięcie
    isDragging.current = false;
    e.currentTarget.style.cursor = "grab";
    e.currentTarget.style.userSelect = "";
    // Reset po krótkim czasie — żeby onClick na barze mógł sprawdzić flagę
    setTimeout(() => { dragMoved.current = false; }, 0);
  }

  const [cellW, setCellW] = useState(0);

  function toggleTrainer(n) {
    setActiveTrainers(prev => {
      const next = prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n];
      try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }

  const { monthOffsets, totalWidth, originAbsDay } = useMemo(() => {
    if (!months.length) return { monthOffsets: [], totalWidth: 0, originAbsDay: 0 };
    const origin = absDay(`${months[0].year}-${pad(months[0].month + 1)}-01`);
    const offsets = [];
    let off = 0;
    for (const m of months) {
      offsets.push(off);
      off += daysInMon(m.year, m.month) * cellW;
    }
    return { monthOffsets: offsets, totalWidth: off, originAbsDay: origin };
  }, [months, cellW]);

  useEffect(() => {
    if (!sizeRef.current) return;
    function recalc() {
      if (!sizeRef.current) return;
      const available = sizeRef.current.clientWidth - TIMELINE_LABEL_COL_WIDTH;
      if (available <= 0) return; // ukryty (display:none) — poczekaj na widoczność
      setCellW(available / TIMELINE_VISIBLE_DAYS);
    }
    function forceRestoreScroll() {
      if (!timelineRef.current || !scrollRestoreDate.current) return;
      const cw = timelineRef.current.clientWidth;
      if (cw < 20) return;
      const newCellW = (cw - TIMELINE_LABEL_COL_WIDTH) / TIMELINE_VISIBLE_DAYS;
      if (newCellW === 0) return;
      const origin = absDay(`${months[0].year}-${pad(months[0].month + 1)}-01`);
      const targetDay = Math.round((new Date(scrollRestoreDate.current + "T12:00:00") - new Date("2020-01-01T12:00:00")) / 86400000);
      const left = 46 + (targetDay - origin) * newCellW;
      timelineRef.current.scrollLeft = Math.max(0, left - cw / 2);
    }
    let timers = [];
    function onOrient() {
      isOrientChanging.current = true;
      timers.forEach(clearTimeout);
      timers = [50, 200, 500, 800, 1200].map((ms, i, arr) => setTimeout(() => {
        recalc();
        forceRestoreScroll();
        if (ms === arr[arr.length - 1]) isOrientChanging.current = false;
      }, ms));
    }
    const ro = new ResizeObserver(recalc);
    ro.observe(sizeRef.current);
    window.addEventListener("orientationchange", onOrient);
    window.addEventListener("resize", recalc);
    recalc();
    return () => {
      timers.forEach(clearTimeout);
      ro.disconnect();
      window.removeEventListener("orientationchange", onOrient);
      window.removeEventListener("resize", recalc);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Po zmianie cellW przywróć zapamiętaną datę (obrót) — pomijamy gdy scrollRestoreDate=null (login)
  useEffect(() => {
    if (!timelineRef.current || cellW <= 0 || originAbsDay === 0) return;
    if (!scrollRestoreDate.current || !initialScrollDone.current) return;
    const targetDay = Math.round((new Date(scrollRestoreDate.current + "T12:00:00") - new Date("2020-01-01T12:00:00")) / 86400000);
    const left = 46 + (targetDay - originAbsDay) * cellW;
    timelineRef.current.scrollLeft = Math.max(0, left - timelineRef.current.clientWidth / 2);
  }, [cellW, originAbsDay]);

  // Jednorazowe przewinięcie do dzisiaj — tylko przy logowaniu (scrollRestoreDate === null)
  useEffect(() => {
    if (!timelineRef.current || loading || cellW <= 0 || initialScrollDone.current) return;
    initialScrollDone.current = true;
    const targetLeft = 46 + (absDay(todayISO) - originAbsDay) * cellW;
    timelineRef.current.scrollLeft = Math.max(0, targetLeft - timelineRef.current.clientWidth / 4);
  }, [loading, cellW, originAbsDay]);

  useEffect(() => {
    if (pendingScrollAdjust.current !== 0 && timelineRef.current) {
      timelineRef.current.scrollLeft += pendingScrollAdjust.current;
      pendingScrollAdjust.current = 0;
    }
    isExtending.current = false;
  }, [months]);

  useEffect(() => {
    setLoading(true);
    db.get(token, "scheduled_trainings", "order=date.asc&select=*")
      .then(data => setScheduled(Array.isArray(data) ? data.filter(s => Number(s.trainer_id) !== 0) : []))
      .catch(() => setScheduled([]))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    const y = now.getFullYear();
    Promise.all([fetchHolidaysForYear(y), fetchHolidaysForYear(y + 1)])
      .then(([a, b]) => setHolidays({ ...a, ...b }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function onScroll() {
    const el = timelineRef.current;
    if (!el || cellW === 0 || isExtending.current) return;
    const sl    = el.scrollLeft;
    const vw    = el.clientWidth;
    const maxSl = el.scrollWidth - vw;

    // Zapamiętaj datę centrum — blokuj podczas obrotu (browser resetuje scrollLeft=0)
    if (!isOrientChanging.current) {
      const centerDay = originAbsDay + Math.round((sl + vw / 2 - TIMELINE_LABEL_COL_WIDTH) / cellW);
      const d = new Date("2020-01-01T12:00:00");
      d.setDate(d.getDate() + centerDay);
      scrollRestoreDate.current = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    }

    const centerX = sl + vw / 2;
    for (let i = monthOffsets.length - 1; i >= 0; i--) {
      if (centerX >= monthOffsets[i]) {
        const m = months[i];
        setVisibleLabel(prev => (prev.year === m.year && prev.month === m.month) ? prev : m);
        break;
      }
    }

    if (sl > maxSl - vw * 2) {
      isExtending.current = true;
      setMonths(prev => [...prev, shiftMonth(prev[prev.length - 1], 1)]);
    }

    if (sl < vw && sl > 0) {
      isExtending.current = true;
      setMonths(prev => {
        const newMon = shiftMonth(prev[0], -1);
        pendingScrollAdjust.current = daysInMon(newMon.year, newMon.month) * cellW;
        return [newMon, ...prev];
      });
    }
  }

  function handleTap(entry) {
    const isST = entry.training_id === "ST";
    const t    = isST ? null : TRAININGS.find(x => x.id === entry.training_id);
    setNotesModal({
      id:           entry.id,
      title:        isST ? (entry.custom_name || "ST") : (t?.title || entry.training_id),
      notes:        entry.notes || "",
      participants: entry.participants_count,
      date:         entry.date,
      endDate:      entry.end_date,
      trainer:      entry.trainer_id,
      isOutgoing:   !!entry.is_outgoing,
    });
  }

  const trainersToShow = activeTrainers.length > 0 ? activeTrainers : ALL_TRAINERS;

  const trainerBars = useMemo(() => {
    if (!months.length) return {};
    const firstISO = `${months[0].year}-${pad(months[0].month + 1)}-01`;
    const lastMon  = months[months.length - 1];
    const lastISO  = `${lastMon.year}-${pad(lastMon.month + 1)}-${pad(daysInMon(lastMon.year, lastMon.month))}`;
    const origin   = absDay(firstISO);

    const result = {};
    for (const trainerId of trainersToShow) {
      result[trainerId] = scheduled
        .filter(s => Number(s.trainer_id) === trainerId)
        .map(s => {
          const startISO = s.date || "";
          const endISO   = s.end_date || s.date || "";
          if (!startISO || endISO < firstISO || startISO > lastISO) return null;

          const isST      = s.training_id === "ST";
          const training  = isST ? null : TRAININGS.find(t => t.id === s.training_id);
          const grp       = GROUPS.find(g => g.id === training?.group);
          const isPlanned = (s.status || "active") === "planned";
          const baseColor = s.bar_color || (isST ? "#8E44AD" : (grp?.color || "#2980B9"));
          const color     = isPlanned ? "#BBBBBB" : baseColor;
          const title     = isST ? (s.custom_name || "ST") : (training?.short || s.training_id);

          const cs    = startISO < firstISO ? firstISO : startISO;
          const ce    = endISO   > lastISO  ? lastISO  : endISO;
          const left  = (absDay(cs) - origin) * cellW;
          const width = Math.max(cellW - 2, (absDay(ce) - absDay(cs) + 1) * cellW - 2);

          return { id: s.id, entry: s, left, width, color, title, isPlanned, isHidden: s.is_hidden, isOutgoing: s.is_outgoing, participantsCount: s.participants_count };
        })
        .filter(Boolean);
    }
    return result;
  }, [scheduled, months, cellW, trainersToShow]);

  return (
    <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",background:C.greyBg,display:"flex",flexDirection:"column"}}>

      <div ref={sizeRef} style={{background:C.white,margin:"12px 12px 0",borderRadius:8,boxShadow:"0 1px 4px rgba(0,0,0,.1)"}}>

        <div style={{display:"flex",alignItems:"center",justifyContent:"center",padding:"8px 10px",borderBottom:`1px solid ${C.grey}`}}>
          <span style={{fontSize:13,fontWeight:700,color:C.black}}>
            {T.months[visibleLabel.month]} {visibleLabel.year}
          </span>
        </div>

        {loading ? (
          <div style={{padding:20,textAlign:"center",color:C.greyMid,fontSize:12}}>{T.loading}</div>
        ) : (
          <div ref={timelineRef} onScroll={onScroll}
            onMouseDown={onMouseDown} onMouseMove={onMouseMove}
            onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
            style={{overflowX:"auto",WebkitOverflowScrolling:"touch",cursor:"grab"}}>
            <div style={{display:"inline-block",minWidth:"100%",verticalAlign:"top"}}>

              <div style={{display:"flex",borderBottom:`2px solid ${C.grey}`}}>
                <div style={{width:TIMELINE_LABEL_COL_WIDTH,minWidth:TIMELINE_LABEL_COL_WIDTH,flexShrink:0,background:"#f7f7f7",borderRight:`1px solid ${C.grey}`,fontSize:9,fontWeight:700,color:C.greyMid,display:"flex",alignItems:"center",justifyContent:"center",height:TIMELINE_HEADER_ROW_H}}>T</div>
                <div style={{display:"flex"}}>
                  {months.map((mon, mi) => {
                    const days = daysInMon(mon.year, mon.month);
                    return (
                      <div key={`${mon.year}-${mon.month}`} style={{display:"flex",position:"relative",borderLeft: mi > 0 ? `2px solid ${C.grey}` : "none"}}>
                        <div style={{position:"absolute",top:1,left:3,fontSize:7,fontWeight:700,color:C.green,letterSpacing:.3,pointerEvents:"none",lineHeight:"9px"}}>
                          {T.months[mon.month].slice(0,3).toUpperCase()}
                        </div>
                        {Array.from({length:days},(_,i)=>i+1).map(d=>{
                          const iso     = `${mon.year}-${pad(mon.month+1)}-${pad(d)}`;
                          const isToday   = iso === todayISO;
                          const isWe      = new Date(iso+"T12:00:00").getDay()%6===0;
                          const isHoliday = !!holidays[iso];
                          const isDayOff  = isWe || isHoliday;
                          return (
                            <div key={d} title={holidays[iso]||undefined} style={{width:cellW,minWidth:cellW,flexShrink:0,height:TIMELINE_HEADER_ROW_H,display:"flex",alignItems:"flex-end",justifyContent:"center",paddingBottom:2,fontSize:9,fontWeight:isToday||isHoliday?700:400,color:isToday?C.greenDk:isDayOff?"#aaa":C.greyMid,background:isToday?C.greenBg:isDayOff?"#e8e8e8":"transparent",borderRight:"1px solid #efefef",boxSizing:"border-box"}}>
                              {d}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>

              {trainersToShow.map(trainerId => (
                <div key={trainerId} style={{display:"flex",borderBottom:`1px solid ${C.grey}`}}>
                  <div style={{width:TIMELINE_LABEL_COL_WIDTH,minWidth:TIMELINE_LABEL_COL_WIDTH,flexShrink:0,background:"#f7f7f7",borderRight:`1px solid ${C.grey}`,fontSize:9,fontWeight:700,color:C.greyDk,display:"flex",alignItems:"center",justifyContent:"center",height:TIMELINE_TRAINER_ROW_H}}>{trainerInitials(trainerId)}</div>

                  <div style={{position:"relative",height:TIMELINE_TRAINER_ROW_H,width:totalWidth,flexShrink:0}}>

                    {months.map((mon,mi) => Array.from({length:daysInMon(mon.year,mon.month)},(_,i)=>i+1).map(d=>{
                      const iso     = `${mon.year}-${pad(mon.month+1)}-${pad(d)}`;
                      const isToday   = iso === todayISO;
                      const isWe      = new Date(iso+"T12:00:00").getDay()%6===0;
                      const isHoliday = !!holidays[iso];
                      const isDayOff  = isWe || isHoliday;
                      return <div key={`${mi}-${d}`} title={holidays[iso]||undefined} style={{position:"absolute",left:monthOffsets[mi]+(d-1)*cellW,top:0,width:cellW,height:"100%",background:isToday?"rgba(138,183,62,.12)":isDayOff?"rgba(0,0,0,.05)":"transparent",pointerEvents:"none"}}/>;
                    }))}

                    {monthOffsets.slice(1).map((off,i)=>(
                      <div key={i} style={{position:"absolute",left:off,top:0,width:2,height:"100%",background:C.grey,pointerEvents:"none",zIndex:1}}/>
                    ))}

                    {(trainerBars[trainerId]||[]).map((bar,bi)=>(
                      <div key={bi}
                        onClick={()=>{ if (!dragMoved.current) handleTap(bar.entry); }}
                        onContextMenu={e=>e.preventDefault()}
                        title="Przytrzymaj → notatki"
                        style={{position:"absolute",left:bar.left,top:4,height:22,width:bar.width,zIndex:2,background:bar.color,borderRadius:3,display:"flex",alignItems:"center",padding:"0 3px",gap:2,cursor:"pointer",overflow:"hidden",boxSizing:"border-box",opacity:bar.isPlanned?0.75:1,border:bar.isHidden?"1px solid rgba(0,0,0,.35)":"none"}}>
                        {bar.isHidden&&<span style={{flexShrink:0,fontSize:BAR_ICON_FONT_SIZE,color:"rgba(255,255,255,.85)"}}>🔒</span>}
                        {bar.isOutgoing&&!bar.isHidden&&<span style={{flexShrink:0,fontSize:BAR_ICON_FONT_SIZE,color:"rgba(255,255,255,.85)"}}>✈️</span>}
                        <span style={{fontSize:BAR_FONT_SIZE,fontWeight:700,color:"#fff",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",flex:1}}>{bar.title}{bar.isPlanned?" ···":""}</span>
                        {bar.participantsCount!=null && (
                          <span style={{flexShrink:0,background:"rgba(0,0,0,.35)",borderRadius:"50%",width:BAR_BADGE_SIZE,height:BAR_BADGE_SIZE,display:"flex",alignItems:"center",justifyContent:"center",fontSize:BAR_BADGE_FONT_SIZE,color:"#fff",lineHeight:BAR_BADGE_SIZE+"px",fontWeight:700}}>{bar.participantsCount>99?"99+":bar.participantsCount}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div style={{background:C.white,margin:"8px 12px 0",borderRadius:8,boxShadow:"0 1px 3px rgba(0,0,0,.07)",padding:"10px 12px"}}>
        <div style={{fontSize:10,fontWeight:700,color:C.greyMid,letterSpacing:1,textTransform:"uppercase",marginBottom:8}}>{T.trainer_view_label}</div>
        <div style={{display:"flex",gap:6}}>
          {ALL_TRAINERS.map(n=>{
            const active = activeTrainers.includes(n);
            return (
              <button key={n} onClick={()=>toggleTrainer(n)}
                style={{flex:1,padding:"10px 0",fontSize:11,fontWeight:700,cursor:"pointer",border:`1.5px solid ${active?C.black:C.grey}`,background:active?C.black:C.white,color:active?C.white:C.greyDk,borderRadius:6,transition:"background .15s,border-color .15s"}}>
                {trainerInitials(n)}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{margin:"8px 12px 12px",background:C.white,borderRadius:8,padding:14,boxShadow:"0 1px 3px rgba(0,0,0,.07)"}}>
        <div style={{fontSize:11,fontWeight:700,color:C.greyMid,letterSpacing:1,textTransform:"uppercase",marginBottom:10}}>{T.upcoming_label}</div>
        {scheduled
          .filter(s=>(s.end_date||s.date)>=todayISO&&(activeTrainers.length===0||activeTrainers.includes(Number(s.trainer_id))))
          .slice(0,20)
          .map(s=>{
            const isST      = s.training_id==="ST";
            const t         = isST?null:TRAININGS.find(x=>x.id===s.training_id);
            const grp       = GROUPS.find(g=>g.id===t?.group);
            const barColor  = s.bar_color || (isST ? "#8E44AD" : (grp?.color || C.grey));
            const isPlanned = (s.status||"active")==="planned";
            return (
              <div key={s.id}
                onClick={()=>{ if (!dragMoved.current) handleTap(s); }}
                onContextMenu={e=>e.preventDefault()}
                style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderBottom:`1px solid ${C.grey}`,opacity:isPlanned?0.6:1,cursor:"pointer"}}>
                <div style={{width:4,alignSelf:"stretch",background:isPlanned?"#BBBBBB":barColor,borderRadius:2,flexShrink:0}}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12,fontWeight:700,color:C.black,marginBottom:2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                    {isST?(s.custom_name||"ST"):(t?.title||s.training_id)}
                    {isPlanned&&<span style={{fontSize:10,fontWeight:400,color:C.greyMid}}> · planowane</span>}
                    {s.is_hidden&&<span style={{fontSize:10,color:C.amber}}> 🔒</span>}
                    {s.is_outgoing&&!s.is_hidden&&<span style={{fontSize:10}}> ✈️</span>}
                  </div>
                  <div style={{fontSize:11,color:C.greyMid,display:"flex",gap:6,flexWrap:"wrap"}}>
                    <span>{s.date}{s.end_date&&s.end_date!==s.date?` → ${s.end_date}`:""}</span>
                    {s.trainer_id&&<span>· {trainerInitials(s.trainer_id)}</span>}
                    {s.participants_count!=null&&<span>· 👥 {s.participants_count}</span>}
                  </div>
                </div>
              </div>
            );
          })}
      </div>

      {notesModal&&(
        <div onClick={()=>setNotesModal(null)}
          style={{position:"fixed",inset:0,background:"rgba(0,0,0,.5)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
          <div onClick={e=>e.stopPropagation()}
            style={{background:C.white,borderRadius:12,padding:20,width:"100%",maxWidth:360,boxShadow:"0 8px 32px rgba(0,0,0,.25)"}}>
            <div style={{fontSize:13,fontWeight:700,color:C.black,marginBottom:4}}>{notesModal.title}</div>
            <div style={{fontSize:11,color:C.greyMid,marginBottom:12,display:"flex",gap:8,flexWrap:"wrap"}}>
              <span>📅 {notesModal.date}{notesModal.endDate&&notesModal.endDate!==notesModal.date?` → ${notesModal.endDate}`:""}</span>
              {notesModal.trainer&&<span>· {trainerInitials(notesModal.trainer)}</span>}
              {notesModal.participants!=null&&<span>· 👥 {notesModal.participants}</span>}
            </div>
            <div style={{fontSize:11,fontWeight:700,color:C.greyMid,letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>{T.notes_label}</div>
            <div style={{fontSize:13,color:notesModal.notes?C.black:C.greyMid,lineHeight:1.6,minHeight:60,whiteSpace:"pre-wrap"}}>
              {notesModal.notes||T.no_notes}
            </div>

            {/* Przyciski — tylko wyjazdowe własnego trenera */}
            {notesModal.isOutgoing && Number(notesModal.trainer) === Number(trainerNum) && (
              <div style={{display:"flex",flexDirection:"column",gap:8,marginTop:14}}>
                <button
                  onClick={()=>{ setNotesModal(null); setServiceReportEntry(notesModal); }}
                  style={{width:"100%",background:"#F0F7E0",color:C.greenDk,border:`1.5px solid ${C.green}`,padding:"10px 12px",fontSize:13,fontWeight:700,borderRadius:6,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                  📋 Raport serwisowy
                </button>
                <button
                  onClick={()=>{ setNotesModal(null); setDelegationEntry(notesModal); }}
                  style={{width:"100%",background:"#EBF5FB",color:C.blue,border:`1.5px solid ${C.blue}`,padding:"10px 12px",fontSize:13,fontWeight:700,borderRadius:6,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                  ✈️ Rozlicz delegację
                </button>
              </div>
            )}

            <button onClick={()=>setNotesModal(null)}
              style={{width:"100%",marginTop:10,background:C.black,color:C.white,border:"none",padding:12,fontSize:13,fontWeight:600,borderRadius:6,cursor:"pointer"}}>
              {T.close}
            </button>
          </div>
        </div>
      )}

      {delegationEntry && (
        <Suspense fallback={<Spinner/>}>
          <DelegationForm
            entry={delegationEntry}
            onClose={() => setDelegationEntry(null)}
          />
        </Suspense>
      )}

      {serviceReportEntry && (
        <Suspense fallback={<Spinner/>}>
          <ServiceReportForm
            entry={serviceReportEntry}
            trainerNum={trainerNum}
            onClose={() => setServiceReportEntry(null)}
          />
        </Suspense>
      )}
    </div>
  );
}
