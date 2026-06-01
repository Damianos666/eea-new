import { useState, useEffect, useMemo, useRef, memo } from "react";
import { useT } from "../lib/LangContext";
import { useUser } from "../lib/UserContext";
import { useToast } from "../lib/ToastContext";
import { db, realtime } from "../lib/supabase";
import { C, GROUPS, LVL_COLOR, LVL_LABEL } from "../lib/constants";
import { useTrainings } from "../lib/useTrainings";

// ─── STYLE CONSTANTS ──────────────────────────────────────────────────────
const S = {
  wrap:      { background: C.greyBg, flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", touchAction: "pan-y", paddingBottom: "calc(72px + env(safe-area-inset-bottom, 0px))" },
  filterBar: { display: "flex", gap: 8, padding: "10px 12px", overflowX: "auto", background: C.white, borderBottom: `1px solid ${C.grey}` },
  countRow:  { padding: "8px 12px", fontSize: 11, color: C.greyMid },
  list:      { padding: "0 12px 32px", display: "flex", flexDirection: "column", gap: 8 },
};

// ─── CATALOG ITEM — memoized ─────────────────────────────────────────────
// Katalog może mieć 50+ pozycji. memo() = tylko kliknięta karta re-renderuje
// się przy expand/collapse, pozostałe 49 pozostają nienaruszone.
const CatalogItem = memo(function CatalogItem({ t, done, open, isActive, grp, completedEntry, onToggle, isInterested, isContacted, isToggling, onToggleInterest, T }) {
  return (
    <div style={{ background: done ? C.doneBg : C.white, boxShadow: "0 1px 3px rgba(0,0,0,.06)", border: done ? `1px solid ${C.doneBorder}` : "1px solid rgba(0,0,0,.06)", opacity: isActive ? 1 : .6 }}>
      <div style={{ borderLeft: `4px solid ${done ? "#7aa832" : LVL_COLOR[t.level]}`, padding: 16, cursor: "pointer" }} onClick={() => onToggle(t.id)}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5, flexWrap: "wrap" }}>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: done ? C.greenDk : C.greyMid }}>{t.category.toUpperCase()}</span>
              {grp && <span style={{ fontSize: 9, fontWeight: 700, color: grp.color, background: `${grp.color}18`, padding: "2px 7px" }}>{grp.label}</span>}
              {done && <span style={{ fontSize: 9, fontWeight: 700, color: C.greenDk, background: "rgba(138,183,62,.2)", padding: "2px 8px", letterSpacing: 1 }}>✓ ZALICZONE</span>}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: done ? C.greyDk : C.black, lineHeight: 1.3, marginBottom: 6 }}>{t.title}</div>
            <div style={{ display: "flex", gap: 12, fontSize: 11, color: C.greyMid, flexWrap: "wrap" }}>
              <span>📅 {t.duration}</span>
              <span style={{ color: LVL_COLOR[t.level] }}>{LVL_LABEL[t.level]}</span>
              <span style={{ fontFamily: "monospace", fontSize: 10 }}>ID: {t.id}</span>
            </div>
          </div>
          <span style={{ fontSize: 10, color: C.greyMid, marginLeft: 12, flexShrink: 0 }}>{open ? "▲" : "▼"}</span>
        </div>
        {open && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${done ? "rgba(138,183,62,.25)" : C.grey}` }}>
            <p style={{ fontSize: 13, color: C.greyDk, lineHeight: 1.7, margin: 0 }}>{t.desc}</p>
            {done && completedEntry && (
              <div style={{ marginTop: 12, background: "rgba(138,183,62,.12)", border: `1px solid ${C.green}`, padding: "8px 14px", fontSize: 12, color: C.greenDk, display: "flex", justifyContent: "space-between" }}>
                <span>{T.done_inline}</span>
                <span style={{ fontFamily: "monospace" }}>{completedEntry.date}</span>
              </div>
            )}
            {!isActive && (
              <div style={{ marginTop: 8, background: "#FEF3E2", borderLeft: `3px solid ${C.amber}`, padding: "8px 12px", fontSize: 12, color: C.greyDk }}>
                {T.enable_group_msg} <strong>{grp?.label}</strong> {T.in_profile}.
              </div>
            )}
            {/* Przycisk zainteresowania dla katalogu (bez terminu) */}
            <div style={{ marginTop: 16 }}>
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
                  onClick={e => onToggleInterest(t.id, e)}
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
                        : "Gdy zbierzemy grupę, zaproponujemy Ci termin"}
                    </div>
                  </div>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

export function CatalogTab({ completed, activeGroups }) {
  const trainings = useTrainings();
  const { token, user } = useUser();
  const { addToast } = useToast();
  const T = useT();
  const [filter,   setFilter]   = useState(null); // null = "wszystkie" — language-agnostic
  const [expanded, setExpanded] = useState(null);

  const [myInterests,     setMyInterests]     = useState(new Set());
  const [myContacted,     setMyContacted]     = useState(new Set());
  const [interestLoading, setInterestLoading] = useState(new Set());
  const prevContactedRef = useRef(new Set());

  useEffect(() => {
    if (!user?.id) return;
    async function loadInterests() {
      try {
        const data = await db.get(
          token,
          "training_interests",
          `select=training_id,is_withdrawn,contacted&user_id=eq.${user.id}&scheduled_training_id=is.null`
        );
        if (Array.isArray(data)) {
          const contactedSet = new Set(data.filter(r => r.contacted).map(r => r.training_id));
          setMyInterests(new Set(data.filter(r => !r.is_withdrawn).map(r => r.training_id)));
          setMyContacted(contactedSet);
          prevContactedRef.current = contactedSet;
          try { sessionStorage.setItem("eea_cat_contacted_" + user.id, JSON.stringify([...contactedSet])); } catch {}
        }
      } catch (err) {
        console.warn("[CatalogTab] błąd ładowania zainteresowań:", err);
      }
    }
    try {
      const stored = sessionStorage.getItem("eea_cat_contacted_" + user.id);
      if (stored) prevContactedRef.current = new Set(JSON.parse(stored));
    } catch {}
    loadInterests();

    let processingInterest = false;
    const unsub = realtime.onNewInterest(token, async () => {
      if (processingInterest) return;
      processingInterest = true;
      try {
        const data = await db.get(
          token,
          "training_interests",
          `select=training_id,is_withdrawn,contacted&user_id=eq.${user.id}&scheduled_training_id=is.null`
        );
        if (!Array.isArray(data)) return;
        const active = data.filter(r => !r.is_withdrawn);
        const newContactedSet = new Set(data.filter(r => r.contacted).map(r => r.training_id));

        const newlyContacted = data.filter(r =>
          r.contacted && !prevContactedRef.current.has(r.training_id)
        );
        if (newlyContacted.length > 0 && "Notification" in window && Notification.permission === "granted") {
          newlyContacted.forEach(r => {
            new Notification("📬 ENGEL Expert Academy", {
              body: `Zostałeś zapisany na szkolenie (z katalogu)!`,
              icon: "/pwa-192.png", badge: "/pwa-192.png",
              tag: `enrolled-cat-${r.training_id}`, renotify: true,
            });
          });
        }
        prevContactedRef.current = newContactedSet;
        try { sessionStorage.setItem("eea_cat_contacted_" + user.id, JSON.stringify([...newContactedSet])); } catch {}
        setMyInterests(new Set(active.map(r => r.training_id)));
        setMyContacted(newContactedSet);
      } catch {}
      finally { processingInterest = false; }
    });
    return () => unsub();
  }, [token, user?.id]);

  async function toggleInterest(tid, e) {
    if (e) e.stopPropagation();
    if (interestLoading.has(tid)) return;
    setInterestLoading(prev => new Set([...prev, tid]));
    try {
      const withdrawing = myInterests.has(tid);
      const payload = {
        user_id:               user.id,
        scheduled_training_id: null,
        training_id:           tid,
        name:                  user.displayName || user.name || null,
        email:                 user.email       || null,
        firma:                 user.firma       || null,
        stanowisko:            user.stanowisko  || null,
        phone:                 user.phone       || null,
        is_withdrawn:          withdrawing,
      };

      if (withdrawing) {
        await db.update(
          token,
          "training_interests",
          `user_id=eq.${user.id}&training_id=eq.${tid}&scheduled_training_id=is.null`,
          { is_withdrawn: true }
        );
      } else {
        try {
          await db.insert(token, "training_interests", payload);
        } catch(insertErr) {
          await db.update(
            token,
            "training_interests",
            `user_id=eq.${user.id}&training_id=eq.${tid}&scheduled_training_id=is.null`,
            { is_withdrawn: false, name: payload.name, email: payload.email,
              firma: payload.firma, stanowisko: payload.stanowisko, phone: payload.phone }
          );
        }
      }

      setMyInterests(prev => {
        const n = new Set(prev);
        if (withdrawing) n.delete(tid); else n.add(tid);
        return n;
      });
    } catch(err) {
      console.error("[CatalogTab] toggleInterest error:", err);
      addToast("Błąd zapisu zainteresowania: " + (err?.message || err));
    } finally {
      setInterestLoading(prev => { const n = new Set(prev); n.delete(tid); return n; });
    }
  }

  // useMemo — doneIds nie przelicza się przy każdym expand/collapse
  const doneIds = useMemo(() => new Set(completed.map(c => c.training.id)), [completed]);

  // useMemo — filtrowanie listy przy zmianie filtra, nie przy expand
  const list = useMemo(
    () => trainings.filter(t => filter === null || (GROUPS.find(g => g.label === filter)?.id === t.group)),
    [filter, trainings]
  );

  // useMemo — mapa zaliczonych szkoleń dla szybkiego dostępu
  const completedMap = useMemo(
    () => new Map(completed.map(c => [c.training.id, c])),
    [completed]
  );

  const doneInList = useMemo(() => list.filter(t => doneIds.has(t.id)).length, [list, doneIds]);

  function handleToggle(id) {
    setExpanded(prev => prev === id ? null : id);
  }

  return (
    <div style={S.wrap}>
      <div style={S.filterBar}>
        {[null, ...GROUPS.map(g => g.label)].map(c => (
          <button key={c ?? "all"}
            style={{ background: filter === c ? C.black : C.white, color: filter === c ? C.white : C.greyDk, border: `1px solid ${filter === c ? C.black : C.grey}`, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
            onClick={() => setFilter(c)}>
            {c === null ? T.all : c}
          </button>
        ))}
      </div>
      <div style={S.countRow}>
        {list.length} szkoleń · <strong style={{ color: C.green }}>{doneInList}</strong> {T.completed_word}
      </div>
      <div style={S.list}>
        {list.map(t => (
          <CatalogItem
            key={t.id}
            t={t}
            done={doneIds.has(t.id)}
            open={expanded === t.id}
            isActive={activeGroups.includes(t.group)}
            grp={GROUPS.find(g => g.id === t.group)}
            completedEntry={completedMap.get(t.id)}
            onToggle={handleToggle}
            isInterested={myInterests.has(t.id) && !myContacted.has(t.id)}
            isContacted={myContacted.has(t.id)}
            isToggling={interestLoading.has(t.id)}
            onToggleInterest={toggleInterest}
            T={T}
          />
        ))}
      </div>
    </div>
  );
}
