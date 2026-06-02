import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { C, GROUPS, LVL_COLOR, LVL_LABEL } from "../lib/constants";
import { TRAININGS } from "../data/trainings";
import { db, realtime } from "../lib/supabase";
import { useT } from "../lib/LangContext";
import { useUser } from "../lib/UserContext";
import { useToast } from "../lib/ToastContext";
import { fetchHolidaysForYear } from "../lib/holidays";

function toISO(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}
function today() { return toISO(new Date()); }

function downloadICS(s, t) {
  const isST   = s.training_id === "ST";
  const title  = isST ? (s.custom_name || (t?.title ?? "Special training")) : t.title;
  const fileId = isST ? ("ST-" + (s.custom_name||"spec").replace(/\s+/g,"-").slice(0,20)) : t.id;
  const dateStart = s.date.replace(/-/g, "");
  const endRaw  = s.end_date || s.date;
  const endDate = new Date(endRaw + "T12:00:00");
  endDate.setDate(endDate.getDate() + 1);
  const dateEnd = `${endDate.getFullYear()}${String(endDate.getMonth()+1).padStart(2,"0")}${String(endDate.getDate()).padStart(2,"0")}`;
  const isMultiDay = s.end_date && s.end_date !== s.date;
  const now  = new Date().toISOString().replace(/[-:.]/g,"").slice(0,15) + "Z";
  const uid  = `${s.id}-${dateStart}@engel-academy`;
  const ics  = [
    "BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//ENGEL Expert Academy//PL",
    "BEGIN:VEVENT",`UID:${uid}`,`DTSTAMP:${now}`,
    isMultiDay ? `DTSTART;VALUE=DATE:${dateStart}` : `DTSTART;TZID=Europe/Warsaw:${dateStart}T083000`,
    isMultiDay ? `DTEND;VALUE=DATE:${dateEnd}`      : `DTEND;TZID=Europe/Warsaw:${dateStart}T160000`,
    `SUMMARY:${title}`,"DESCRIPTION:ENGEL Expert Academy","END:VEVENT","END:VCALENDAR"
  ].join("\r\n");
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = `szkolenie-${fileId}-${dateStart}.ics`; a.click();
  URL.revokeObjectURL(url);
}

export function ScheduleTab({ activeGroups, refreshKey }) {
  const { token, user } = useUser();
  const T = useT();
  const { addToast } = useToast();
  const [scheduled,       setScheduled]       = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [selected,        setSelected]        = useState(null);
  const [viewYear,        setViewYear]        = useState(new Date().getFullYear());
  const [viewMonth,       setViewMonth]       = useState(new Date().getMonth());
  const [holidays,        setHolidays]        = useState({});
  const [expandedCard,    setExpandedCard]    = useState(null);
  const [myInterests,     setMyInterests]     = useState(new Set());
  const [myContacted,     setMyContacted]     = useState(new Set()); // sid gdzie admin oznaczył contacted=true
  const [interestLoading, setInterestLoading] = useState(new Set());
  // prevContactedRef — persystowany w sessionStorage żeby przeżył restart kontekstu na mobile (iOS/Android)
  // iOS PWA agresywnie zabija procesy w tle, przez co useRef wraca do Set() przy każdym przebudzeniu
  const prevContactedRef = useRef(new Set());

  useEffect(() => {
    async function load() {
      setLoading(true);
      // 1. Szkolenia zaplanowane — jeśli to się nie uda, Terminarz jest pusty
      try {
        const schedData = await db.get(token, "scheduled_trainings", "order=date.asc");
        const all = Array.isArray(schedData) ? schedData : [];
        const todayStr = toISO(new Date());
        setScheduled(all.filter(s =>
          (s.end_date || s.date) >= todayStr && !s.is_hidden && !s.is_outgoing && Number(s.trainer_id) !== 0
        ));
      } catch (err) {
        console.error("[ScheduleTab] błąd pobierania szkoleń:", err);
        setScheduled([]);
      } finally {
        setLoading(false);
      }
      // 2. Zainteresowania — niezależnie; błąd tutaj nie niszczy kalendarza
      if (user?.id) {
        try {
          const interestData = await db.get(
            token,
            "training_interests",
            `select=scheduled_training_id,is_withdrawn,contacted&user_id=eq.${user.id}`
          );
          if (Array.isArray(interestData)) {
            // is_withdrawn dotyczy tylko checkboxa zainteresowania —
            // contacted sprawdzamy niezależnie (admin mógł skontaktować po wycofaniu)
            const contactedSet = new Set(interestData.filter(r => r.contacted).map(r => r.scheduled_training_id));
            setMyInterests(new Set(interestData.filter(r => !r.is_withdrawn).map(r => r.scheduled_training_id)));
            setMyContacted(contactedSet);
            prevContactedRef.current = contactedSet;
            try {
              sessionStorage.setItem("eea_contacted_" + user.id, JSON.stringify([...contactedSet]));
            } catch {}
          }
        } catch (err) {
          console.warn("[ScheduleTab] nie można załadować zainteresowań (tabela może nie istnieć):", err);
        }
      }
    }
    // Wczytaj poprzedni stan contacted z sessionStorage — ważne na mobile (iOS/Android)
    // gdzie PWA może restartować kontekst JS w tle, kasując useRef do pustego Set()
    if (user?.id) {
      try {
        const stored = sessionStorage.getItem("eea_contacted_" + user.id);
        if (stored) prevContactedRef.current = new Set(JSON.parse(stored));
      } catch {}
    }

    load();

    // Realtime — nasłuchuj na UPDATE w training_interests tego użytkownika.
    // Gdy admin oznaczy contacted=true, klient dostaje powiadomienie Windows.
    if (!user?.id) return;
    let processingInterest = false; // lock przeciw race condition gdy eventy przychodzą szybciej niż await
    const unsub = realtime.onNewInterest(token, async () => {
      if (processingInterest) return; // drugi event przyszedł zanim pierwszy skończył — ignoruj
      processingInterest = true;
      try {
        const interestData = await db.get(
          token,
          "training_interests",
          `select=scheduled_training_id,is_withdrawn,contacted,scheduled:scheduled_trainings(training_id,date)&user_id=eq.${user.id}`
        );
        if (!Array.isArray(interestData)) return;
        const active = interestData.filter(r => !r.is_withdrawn);
        // contacted sprawdzamy na wszystkich rekordach, niezależnie od is_withdrawn
        const newContactedSet = new Set(interestData.filter(r => r.contacted).map(r => r.scheduled_training_id));

        // Wykryj nowo dodane contacted (były false, teraz true) — na wszystkich rekordach
        const newlyContacted = interestData.filter(r =>
          r.contacted && !prevContactedRef.current.has(r.scheduled_training_id)
        );
        if (newlyContacted.length > 0 && "Notification" in window && Notification.permission === "granted") {
          newlyContacted.forEach(r => {
            const trainingId = r.scheduled?.training_id;
            const date = r.scheduled?.date ? new Date(r.scheduled.date).toLocaleDateString("pl-PL") : "";
            new Notification("📬 ENGEL Expert Academy", {
              body: `Zostałeś zapisany na szkolenie${date ? " (" + date + ")" : ""}!`,
              icon: "/pwa-192.png", badge: "/pwa-192.png",
              tag: `enrolled-${r.scheduled_training_id}`, renotify: true,
            });
          });
        }

        prevContactedRef.current = newContactedSet;
        try {
          sessionStorage.setItem("eea_contacted_" + user.id, JSON.stringify([...newContactedSet]));
        } catch {}
        setMyInterests(new Set(active.map(r => r.scheduled_training_id)));
        setMyContacted(newContactedSet);
      } catch {}
      finally { processingInterest = false; }
    });
    return () => unsub();
  }, [token, user?.id, refreshKey]);

  async function toggleInterest(s, e) {
    e.stopPropagation();
    const sid = s.id;
    if (interestLoading.has(sid)) return;
    setInterestLoading(prev => new Set([...prev, sid]));
    try {
      const withdrawing = myInterests.has(sid);
      const payload = {
        user_id:               user.id,
        scheduled_training_id: sid,
        training_id:           s.training_id,
        name:                  user.displayName || user.name || null,
        email:                 user.email       || null,
        firma:                 user.firma       || null,
        stanowisko:            user.stanowisko  || null,
        phone:                 user.phone       || null,
        is_withdrawn:          withdrawing,
      };

      if (withdrawing) {
        // Wycofanie — zawsze UPDATE (rekord na pewno istnieje, bo user był zainteresowany)
        await db.update(
          token,
          "training_interests",
          `user_id=eq.${user.id}&scheduled_training_id=eq.${sid}`,
          { is_withdrawn: true }
        );
      } else {
        // Zgłoszenie zainteresowania — INSERT, a jeśli rekord już istnieje (wcześniej wycofany) to UPDATE
        try {
          await db.insert(token, "training_interests", payload);
        } catch(insertErr) {
          await db.update(
            token,
            "training_interests",
            `user_id=eq.${user.id}&scheduled_training_id=eq.${sid}`,
            { is_withdrawn: false, name: payload.name, email: payload.email,
              firma: payload.firma, stanowisko: payload.stanowisko, phone: payload.phone }
          );
        }
      }

      setMyInterests(prev => {
        const n = new Set(prev);
        if (withdrawing) n.delete(sid); else n.add(sid);
        return n;
      });
    } catch(err) {
      console.error("[ScheduleTab] toggleInterest error:", err);
      addToast("Błąd zapisu zainteresowania: " + (err?.message || err));
    } finally {
      setInterestLoading(prev => { const n = new Set(prev); n.delete(sid); return n; });
    }
  }

  useEffect(() => {
    const thisYear = new Date().getFullYear();
    Promise.all([
      fetchHolidaysForYear(thisYear),
      fetchHolidaysForYear(thisYear + 1),
    ]).then(([a, b]) => setHolidays({ ...a, ...b }));
  }, []);

  useEffect(() => {
    const key = `eea_holidays_PL_${viewYear}`;
    if (!localStorage.getItem(key)) {
      fetchHolidaysForYear(viewYear).then(map =>
        setHolidays(prev => ({ ...prev, ...map }))
      );
    }
  }, [viewYear]);

  const visible = useMemo(() => scheduled.filter(s => {
    const t = TRAININGS.find(t => t.id === s.training_id);
    return (s.training_id === "ST") ? true : (t && activeGroups.includes(t.group));
  }), [scheduled, activeGroups]);

  const datesWithTrainings = useMemo(() => {
    const map = {};
    visible.forEach(s => {
      if (!map[s.date]) map[s.date] = [];
      if (s.training_id === "ST") {
        map[s.date].push("ST");
      } else {
        const t = TRAININGS.find(t => t.id === s.training_id);
        if (t) map[s.date].push(t.group);
      }
    });
    return map;
  }, [visible]);

  const displayItems = useMemo(() => {
    const now = today();
    if (selected) return visible.filter(s => s.date === selected);
    return visible.filter(s => s.date >= now).slice(0, 10);
  }, [visible, selected]);

  const calendarDays = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1);
    let startDow = firstDay.getDay();
    startDow = startDow === 0 ? 6 : startDow - 1;
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startDow; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    return cells;
  }, [viewYear, viewMonth]);

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y-1); setViewMonth(11); }
    else setViewMonth(m => m-1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y+1); setViewMonth(0); }
    else setViewMonth(m => m+1);
  }

  const touchStartX = useRef(null);
  const SWIPE_THRESHOLD = 50;

  const handleTouchStart = useCallback((e) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback((e) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < SWIPE_THRESHOLD) return;
    if (dx < 0) nextMonth();
    else prevMonth();
  }, [viewMonth, viewYear]); // eslint-disable-line react-hooks/exhaustive-deps

  const todayStr = today();

  return (
    <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",background:C.greyBg,display:"flex",flexDirection:"column",paddingBottom:"calc(72px + env(safe-area-inset-bottom, 0px))"}}>

      <div style={{background:C.white,margin:"12px 12px 0",borderRadius:8,boxShadow:"0 1px 3px rgba(0,0,0,.07)",padding:"12px 10px"}}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >

        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
          <button onClick={prevMonth} style={{background:"none",border:"none",fontSize:18,cursor:"pointer",color:C.greyDk,padding:"4px 8px"}}>‹</button>
          <span style={{fontSize:14,fontWeight:700,color:C.black,letterSpacing:.3}}>
            {T.months[viewMonth]} {viewYear}
          </span>
          <button onClick={nextMonth} style={{background:"none",border:"none",fontSize:18,cursor:"pointer",color:C.greyDk,padding:"4px 8px"}}>›</button>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",marginBottom:4}}>
          {T.days_short.map((d, i) => (
            <div key={d} style={{textAlign:"center",fontSize:9,fontWeight:700,color: C.greyMid,padding:"2px 0",letterSpacing:.5}}>{d}</div>
          ))}
        </div>

        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2}}>
          {calendarDays.map((day, i) => {
            if (!day) return <div key={`e${i}`}/>;
            const iso = `${viewYear}-${String(viewMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
            const groups    = datesWithTrainings[iso] || [];
            const isToday   = iso === todayStr;
            const isSel     = iso === selected;
            const dow       = new Date(iso + "T00:00:00").getDay();
            const isWeekend = dow === 0 || dow === 6;
            const isHoliday = !!holidays[iso];
            const isDayOff  = isWeekend || isHoliday;

            let bg = "transparent";
            if (isSel)         bg = C.black;
            else if (isToday)  bg = C.greenBg;
            else if (isDayOff) bg = "#f0f0f0";

            const numColor = isSel ? C.white : isToday ? C.greenDk : isDayOff ? "#aaa" : C.greyDk;

            return (
              <button key={iso} onClick={() => setSelected(isSel ? null : iso)}
                title={holidays[iso] || undefined}
                style={{
                  background: bg,
                  border: isToday && !isSel ? `1px solid ${C.green}` : isDayOff && !isSel ? "1px solid #ddd" : "1px solid transparent",
                  borderRadius: 6,
                  padding: "5px 2px 3px",
                  cursor: groups.length ? "pointer" : "default",
                  display:"flex", flexDirection:"column", alignItems:"stretch", gap:2,
                }}>
                <span style={{fontSize:12,fontWeight: isToday||isSel||isHoliday ? 700 : 400, color: numColor, textAlign:"center"}}>
                  {day}
                </span>
                {groups.length > 0 && (() => {
                  const uniq = [...new Set(groups)].slice(0,3);
                  return (
                    <div style={{display:"flex",justifyContent:"center",alignItems:"center",gap:2,width:"100%"}}>
                      {uniq.map((g, idx) => {
                        const dotColor = g === "ST" ? "#8E44AD" : (GROUPS.find(x => x.id===g)?.color || C.green);
                        return <div key={idx} style={{width:4,height:4,borderRadius:"50%",flexShrink:0,background: isSel ? C.white : dotColor}}/>;
                      })}
                    </div>
                  );
                })()}
              </button>
            );
          })}
        </div>

        <div style={{display:"flex",justifyContent:"center",gap:12,marginTop:10,paddingTop:8,borderTop:`1px solid ${C.grey}`,flexWrap:"wrap"}}>
          {GROUPS.filter(g => activeGroups.includes(g.id)).map(g => (
            <div key={g.id} style={{display:"flex",alignItems:"center",gap:4}}>
              <div style={{width:8,height:8,borderRadius:"50%",background:g.color}}/>
              <span style={{fontSize:10,color:C.greyMid}}>{g.label}</span>
            </div>
          ))}
          <div style={{display:"flex",alignItems:"center",gap:4}}>
            <div style={{width:8,height:8,borderRadius:"50%",background:"#8E44AD"}}/>
            <span style={{fontSize:10,color:C.greyMid}}>Specjalne</span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:4}}>
            <div style={{width:8,height:8,borderRadius:2,background:"#f0f0f0",border:"1px solid #ddd"}}/>
            <span style={{fontSize:10,color:C.greyMid}}>Weekend / Święto</span>
          </div>
        </div>

      </div>

      <div style={{padding:"10px 12px 12px"}}>

        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
          <span style={{fontSize:11,fontWeight:700,color:C.greyMid,letterSpacing:1}}>
            {selected
              ? (() => {
                  const d = new Date(selected+"T00:00:00");
                  const holidayLabel = holidays[selected] ? ` · 🎌 ${holidays[selected]}` : "";
                  return `${d.getDate()} ${T.months[d.getMonth()]} ${d.getFullYear()}${holidayLabel}`;
                })()
              : T.upcoming_3}
          </span>
          {selected && (
            <button onClick={() => setSelected(null)}
              style={{background:"none",border:"none",fontSize:11,color:C.greyMid,cursor:"pointer",textDecoration:"underline"}}>
              {T.show_upcoming}
            </button>
          )}
        </div>

        {loading && <div style={{textAlign:"center",padding:24,color:C.greyMid,fontSize:13}}>{T.loading}</div>}

        {!loading && displayItems.length === 0 && (
          <div style={{textAlign:"center",padding:24,color:C.greyMid,fontSize:13}}>
            {selected ? T.no_trainings_day : T.no_trainings}
          </div>
        )}

        {!loading && displayItems.map((s, i) => {
          const isST = s.training_id === "ST";
          const t = isST ? null : TRAININGS.find(x => x.id === s.training_id);
          if (!isST && !t) return null;
          const grp = t ? GROUPS.find(g => g.id === t.group) : null;
          const barColor = isST ? "#8E44AD" : (grp?.color || C.green);
          const title = isST ? (s.custom_name || T.special_training_name) : t.title;
          const date = new Date(s.date + "T00:00:00");
          const isOpen       = expandedCard === s.id;
          const isContacted  = myContacted.has(s.id);  // admin już skontaktował
          const isWithdrawnLocally = !myInterests.has(s.id) && !isContacted; // wycofany i nie skontaktowany
          const isInterested = myInterests.has(s.id) && !isContacted; // zainteresowany ale jeszcze nie skontaktowany
          const isToggling   = interestLoading.has(s.id);

          return (
            <div key={`${s.date}-${i}`} style={{
              background:C.white,borderRadius:8,marginBottom:8,
              boxShadow:"0 1px 3px rgba(0,0,0,.07)",
              borderLeft:`4px solid ${barColor}`,
              overflow:"hidden",
            }}>
              {/* ── nagłówek karty (klikalny) ── */}
              <div
                onClick={() => setExpandedCard(isOpen ? null : s.id)}
                style={{padding:"12px 14px",cursor:"pointer"}}
              >
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                  <span style={{fontSize:11,fontWeight:700,color:barColor}}>
                    {T.days_full[date.getDay()]}, {date.getDate()} {T.months[date.getMonth()]} {date.getFullYear()}
                  </span>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <span style={{fontSize:10,background:C.greyBg,border:`1px solid ${C.grey}`,padding:"2px 8px",borderRadius:4,color:C.greyDk,fontWeight:600}}>
                      8:30
                    </span>
                    <span style={{fontSize:12,color:C.greyMid,lineHeight:1}}>{isOpen ? "▲" : "▼"}</span>
                  </div>
                </div>
                <div style={{fontSize:13,fontWeight:700,color:C.black,lineHeight:1.3,marginBottom:4}}>{title}</div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",gap:6,flexWrap:"wrap",marginTop:4}}>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                    {isST ? (
                      <span style={{fontSize:9,fontWeight:700,color:"#8E44AD",background:"#F9F0FF",padding:"2px 7px"}}>⭐ ST</span>
                    ) : (
                      <>
                        <span style={{fontSize:9,fontWeight:700,color:grp?.color,background:`${grp?.color}18`,padding:"2px 7px"}}>{grp?.label}</span>
                        <span style={{fontSize:9,color:C.greyMid,padding:"2px 4px"}}>{t.duration}</span>
                        <span style={{fontSize:9,color:C.greyMid,padding:"2px 4px"}}>ID: {t.id}</span>
                      </>
                    )}
                    {isContacted && (
                      <span style={{fontSize:9,fontWeight:700,color:"#1a7a3f",background:"#D4EDDA",padding:"2px 7px",borderRadius:3}}>
                        ✓ Zapisany
                      </span>
                    )}
                    {isInterested && !isContacted && (
                      <span style={{fontSize:9,fontWeight:700,color:C.greenDk,background:C.greenBg,padding:"2px 7px",borderRadius:3}}>
                        ✓ Zainteresowany
                      </span>
                    )}
                  </div>
                  {!isST ? (
                    <button
                      onClick={e => { e.stopPropagation(); downloadICS(s, t); }}
                      title="Dodaj do kalendarza (.ics)"
                      style={{background:"#F0F7FF",border:"1px solid #0072C6",borderRadius:6,padding:"5px 8px",cursor:"pointer",fontSize:16,lineHeight:1,flexShrink:0}}>
                      📅
                    </button>
                  ) : (
                    <button
                      onClick={e => { e.stopPropagation(); downloadICS(s, null); }}
                      title="Dodaj do kalendarza (.ics)"
                      style={{background:"#F9F0FF",border:"1px solid #8E44AD",borderRadius:6,padding:"5px 8px",cursor:"pointer",fontSize:16,lineHeight:1,flexShrink:0}}>
                      📅
                    </button>
                  )}
                </div>
              </div>

              {/* ── rozwinięty opis ── */}
              {isOpen && !isST && t && (
                <div style={{borderTop:`1px solid ${C.grey}`,padding:"14px 14px 16px"}}>
                  {/* meta */}
                  <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>
                    <span style={{fontSize:10,fontWeight:700,letterSpacing:1,color:C.greyMid}}>{t.category.toUpperCase()}</span>
                    <span style={{fontSize:10,color:LVL_COLOR[t.level],fontWeight:700}}>● {LVL_LABEL[t.level]}</span>
                  </div>
                  {/* opis */}
                  <p style={{fontSize:13,color:C.greyDk,lineHeight:1.7,margin:"0 0 16px"}}>{t.desc}</p>

                  {/* checkbox zainteresowany — ukryty gdy admin juz skontaktowal */}
                  {isContacted ? (
                    <div style={{
                      display:"flex",alignItems:"center",gap:10,
                      background:"#D4EDDA",border:"1.5px solid #1a7a3f",
                      borderRadius:8,padding:"10px 14px",
                    }}>
                      <div style={{
                        width:20,height:20,borderRadius:4,flexShrink:0,
                        background:"#1a7a3f",
                        display:"flex",alignItems:"center",justifyContent:"center",
                      }}>
                        <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
                          <path d="M1 5l3.5 3.5L11 1" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                      <div style={{textAlign:"left"}}>
                        <div style={{fontSize:13,fontWeight:700,color:"#1a7a3f"}}>Zapisany/a na szkolenie</div>
                        <div style={{fontSize:11,color:"#2d9e5f",marginTop:1}}>Skontaktujemy się z Tobą w sprawie szczegółów</div>
                      </div>
                    </div>
                  ) : (
                  <button
                    onClick={e => toggleInterest(s, e)}
                    disabled={isToggling}
                    style={{
                      display:"flex",alignItems:"center",gap:10,
                      background: isInterested ? C.greenBg : C.greyBg,
                      border:`1.5px solid ${isInterested ? C.green : C.grey}`,
                      borderRadius:8,padding:"10px 14px",
                      cursor:isToggling?"not-allowed":"pointer",
                      width:"100%",
                      opacity:isToggling?0.6:1,
                      transition:"all .15s",
                    }}
                  >
                    {/* custom checkbox */}
                    <div style={{
                      width:20,height:20,borderRadius:4,flexShrink:0,
                      background: isInterested ? C.green : C.white,
                      border:`2px solid ${isInterested ? C.green : C.greyMid}`,
                      display:"flex",alignItems:"center",justifyContent:"center",
                      transition:"all .15s",
                    }}>
                      {isInterested && (
                        <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
                          <path d="M1 5l3.5 3.5L11 1" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                    <div style={{textAlign:"left"}}>
                      <div style={{fontSize:13,fontWeight:700,color:isInterested?C.greenDk:C.black}}>
                        {isToggling ? "…" : isInterested ? "Zainteresowany/a" : "Jestem zainteresowany/a"}
                      </div>
                      <div style={{fontSize:11,color:C.greyMid,marginTop:1}}>
                        {isInterested
                          ? "Kliknij, aby wycofać zainteresowanie"
                          : "Skontaktujemy się z Tobą, by potwierdzić miejsce"}
                      </div>
                    </div>
                  </button>
                  )}
                </div>
              )}

              {/* ── rozwinięty opis szkolenia specjalnego (brak opisu w katalogu) ── */}
              {isOpen && isST && (
                <div style={{borderTop:`1px solid ${C.grey}`,padding:"12px 14px 14px"}}>
                  <p style={{fontSize:12,color:C.greyMid,lineHeight:1.6,margin:0,fontStyle:"italic"}}>
                    Szkolenie specjalne — szczegóły ustalone indywidualnie z trenerem.
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
