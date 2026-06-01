import { useState, useEffect, useMemo } from "react";
import { C, GROUPS } from "../../lib/constants";
import { useLang } from "../../lib/LangContext";
import { TRAININGS } from "../../data/trainings";
import { db, realtime } from "../../lib/supabase";
import { buildMailtoLink } from "../../config/mailtemplate";

export function AdminInterested({ token, onContactedChange, refreshKey }) {
  const { T } = useLang();
  const [interests,  setInterests]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState("");
  const [updatingId,   setUpdatingId]   = useState(null);
  const [deletingId,   setDeletingId]   = useState(null);
  const [editingNotes, setEditingNotes] = useState(null); // sid szkolenia w trybie edycji
  const [notesVal,     setNotesVal]     = useState("");
  const [partVal,      setPartVal]      = useState("");
  const [savingNotes,  setSavingNotes]  = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError("");
      try {
        const data = await db.get(
          token,
          "training_interests",
          "select=*,scheduled:scheduled_trainings(id,date,end_date,training_id,custom_name,notes,participants_count)&order=created_at.asc"
        );
        setInterests(Array.isArray(data) ? data : []);
      } catch(e) {
        setError("Błąd ładowania danych: " + e.message);
        setInterests([]);
      } finally {
        setLoading(false);
      }
    }
    load();
    
    // Auto-odświeżanie po nadejściu UPDATE/INSERT/DELETE z Supabase
    const unsub = realtime.onNewInterest(token, () => {
      // Pobieramy dane od nowa tłem bez setLoading(true) żeby nie migało
      db.get(
        token,
        "training_interests",
        "select=*,scheduled:scheduled_trainings(id,date,end_date,training_id,custom_name,notes,participants_count)&order=created_at.asc"
      ).then(data => {
        setInterests(Array.isArray(data) ? data : []);
      }).catch(() => {});
    });
    
    return () => unsub();
  }, [token, refreshKey]);

  // Automatyczne czyszczenie zgłoszeń dla miniónych szkoleń
  useEffect(() => {
    async function cleanupPastInterests() {
      try {
        const today = new Date().toISOString().slice(0, 10);
        // Pobierz ID szkoleń które się już odbyły
        const past = await db.get(token, "scheduled_trainings",
          `select=id&date=lt.${today}&end_date=is.null`);
        const pastMulti = await db.get(token, "scheduled_trainings",
          `select=id&end_date=lt.${today}`);
        const ids = [
          ...( Array.isArray(past)      ? past      : [] ),
          ...( Array.isArray(pastMulti) ? pastMulti : [] ),
        ].map(r => r.id);
        const unique = [...new Set(ids)];
        if (unique.length === 0) return;
        await db.remove(token, "training_interests",
          `scheduled_training_id=in.(${unique.join(",")})`);
      } catch(e) {
        console.warn("[AdminInterested] cleanup error:", e.message);
      }
    }
    cleanupPastInterests();
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  function openNotesEdit(sched) {
    setEditingNotes(sched.id);
    setNotesVal(sched.notes || "");
    setPartVal(sched.participants_count != null ? String(sched.participants_count) : "");
  }

  async function saveNotes(schedId) {
    setSavingNotes(true);
    try {
      const pc = partVal !== "" ? parseInt(partVal) : null;
      await db.update(token, "scheduled_trainings", `id=eq.${schedId}`, {
        notes: notesVal.trim(),
        participants_count: pc,
      });
      setInterests(prev => prev.map(i =>
        i.scheduled_training_id === schedId
          ? { ...i, scheduled: { ...i.scheduled, notes: notesVal.trim(), participants_count: pc } }
          : i
      ));
      setEditingNotes(null);
    } catch(e) {
      alert("Błąd zapisu: " + e.message);
    } finally {
      setSavingNotes(false);
    }
  }

  async function deleteItem(item) {
    if (!window.confirm(`Usunąć zgłoszenie od ${item.name || item.email || "tej osoby"}?`)) return;
    setDeletingId(item.id);
    try {
      await db.remove(token, "training_interests", `id=eq.${item.id}`);
      setInterests(prev => prev.filter(i => i.id !== item.id));
      if (onContactedChange) onContactedChange();
    } catch(e) {
      alert("Błąd usuwania: " + e.message);
    } finally {
      setDeletingId(null);
    }
  }

  async function toggleContacted(item) {
    if (updatingId === item.id) return;
    setUpdatingId(item.id);
    try {
      const newVal = !item.contacted;
      await db.update(token, "training_interests", `id=eq.${item.id}`, {
        contacted:    newVal,
        contacted_at: newVal ? new Date().toISOString() : null,
      });
      setInterests(prev => prev.map(i =>
        i.id === item.id
          ? { ...i, contacted: newVal, contacted_at: newVal ? new Date().toISOString() : null }
          : i
      ));
      if (onContactedChange) onContactedChange();
    } catch(e) {
      console.error("[AdminInterested] toggleContacted error:", e);
    } finally {
      setUpdatingId(null);
    }
  }

  // Grupuj po scheduled_training_id, sortuj grupy wg daty rosnąco
  const groups = useMemo(() => {
    const map = new Map();
    interests.forEach(item => {
      const sid = item.scheduled_training_id;
      if (!map.has(sid)) {
        map.set(sid, { scheduled: item.scheduled, items: [] });
      }
      map.get(sid).items.push(item);
    });
    return Array.from(map.values()).sort((a, b) => {
      // Zgłoszenia z katalogu (bez terminu) — na końcu listy
      if (!a.scheduled && b.scheduled) return 1;
      if (a.scheduled && !b.scheduled) return -1;
      const da = a.scheduled?.date || "";
      const db2 = b.scheduled?.date || "";
      return da.localeCompare(db2);
    });
  }, [interests]);

  const totalCount     = interests.length;
  const withdrawnCount = interests.filter(i => i.is_withdrawn).length;
  const activeCount    = totalCount - withdrawnCount;
  const contactedCount = interests.filter(i => i.contacted && !i.is_withdrawn).length;

  return (
    <div style={{
      flex:1, overflowY:"auto", WebkitOverflowScrolling:"touch",
      background:C.greyBg, display:"flex", flexDirection:"column",
    }}>
      {/* ── nagłówek z licznikami ── */}
      <div style={{
        background:C.white, borderBottom:`1px solid ${C.grey}`,
        padding:"14px 16px", display:"flex", gap:16, alignItems:"center",
        flexWrap:"wrap",
      }}>
        <div style={{flex:1}}>
          <div style={{fontSize:11,fontWeight:700,letterSpacing:1,color:C.greyMid,textTransform:"uppercase",marginBottom:2}}>
            Zainteresowani
          </div>
          <div style={{fontSize:12,color:C.greyDk}}>
            {totalCount === 0
              ? T.adm_int_no_reports
              : `${activeCount} aktywn${activeCount === 1 ? "e" : activeCount < 5 ? "e" : "ych"}`
            }
            {activeCount > 0 && (
              <span style={{marginLeft:8,color:C.greenDk,fontWeight:700}}>
                · {contactedCount} skontaktowanych
              </span>
            )}
            {withdrawnCount > 0 && (
              <span style={{marginLeft:8,color:C.greyMid,fontWeight:700}}>
                · {withdrawnCount} wycofan{withdrawnCount === 1 ? "e" : "ych"}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── stany ładowania / błędu / brak danych ── */}
      {loading && (
        <div style={{textAlign:"center",padding:32,color:C.greyMid,fontSize:13}}>Ładowanie…</div>
      )}
      {!loading && error && (
        <div style={{margin:16,padding:"12px 16px",background:"#FDEDEC",border:`1px solid ${C.red}`,borderRadius:6,fontSize:13,color:C.red}}>
          {error}
        </div>
      )}
      {!loading && !error && groups.length === 0 && (
        <div style={{textAlign:"center",padding:48,color:C.greyMid,fontSize:13}}>
          <div style={{fontSize:28,marginBottom:12}}>📭</div>
          Żaden uczestnik nie wyraził jeszcze zainteresowania szkoleniem.
        </div>
      )}

      {/* ── grupy szkoleń ── */}
      {!loading && !error && (
        <div style={{padding:"10px 12px 24px", display:"flex", flexDirection:"column", gap:16}}>
          {groups.map(group => {
            const sched = group.scheduled;

            // ── zgłoszenia z KATALOGU (scheduled_training_id = null) ──────────
            const isCatalogGroup = !sched;
            if (isCatalogGroup) {
              const groupContacted = group.items.filter(i => i.contacted).length;
              const groupTotal     = group.items.length;
              return (
                <div key="catalog-interests" style={{
                  background:C.white, borderRadius:8,
                  boxShadow:"0 1px 3px rgba(0,0,0,.07)", overflow:"hidden",
                }}>
                  {/* nagłówek grupy katalogowej */}
                  <div style={{
                    borderLeft:"4px solid #2471A3",
                    padding:"12px 14px",
                    background:C.white,
                    borderBottom:`1px solid ${C.grey}`,
                  }}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:11,fontWeight:700,color:"#2471A3",marginBottom:3,textTransform:"uppercase",letterSpacing:1}}>
                          Zainteresowanie ogólne (bez terminu)
                        </div>
                        <div style={{fontSize:14,fontWeight:700,color:C.black,lineHeight:1.3,marginBottom:6}}>
                          Zgłoszenia z katalogu szkoleń
                        </div>
                        <div style={{fontSize:11,color:C.greyMid}}>
                          {groupContacted === groupTotal
                            ? <span style={{color:C.greenDk,fontWeight:700}}>✓ Wszyscy skontaktowani ({groupTotal})</span>
                            : <>{groupTotal} {groupTotal===1?"osoba":"osoby"} · <span style={{color:C.greenDk,fontWeight:700}}>{groupContacted} skontaktowanych</span></>
                          }
                        </div>
                      </div>
                    </div>
                  </div>
                  {/* lista osób */}
                  <div style={{display:"flex",flexDirection:"column",gap:0}}>
                    {group.items.map((item, idx) => {
                      const isWithdrawn = item.is_withdrawn;
                      const isContacted = item.contacted;
                      const isUpdating  = updatingId === item.id;
                      const contactedDate = item.contacted_at
                        ? new Date(item.contacted_at).toLocaleDateString("pl-PL",{day:"numeric",month:"short",year:"numeric"})
                        : null;
                      // Znajdź nazwę szkolenia po training_id
                      const itemTraining = item.training_id
                        ? TRAININGS.find(x => x.id === item.training_id)
                        : null;
                      return (
                        <div key={item.id} style={{
                          display:"flex", alignItems:"flex-start", justifyContent:"space-between",
                          gap:12, padding:"10px 14px",
                          borderBottom: idx < group.items.length-1 ? `1px solid ${C.grey}` : "none",
                          background: isWithdrawn ? "#FEF9F0" : isContacted ? "#F0FFF4" : C.white,
                          opacity: isWithdrawn ? 0.7 : 1,
                        }}>
                          <div style={{flex:1,minWidth:0}}>
                            {isWithdrawn && (
                              <div style={{fontSize:10,fontWeight:700,color:"#A04000",marginBottom:4,letterSpacing:1}}>
                                ✗ WYCOFANO
                              </div>
                            )}
                            {itemTraining && (
                              <div style={{fontSize:12,fontWeight:700,color:"#2471A3",marginBottom:3}}>
                                📚 {itemTraining.title}
                              </div>
                            )}
                            <div style={{fontSize:13,fontWeight:700,color: isWithdrawn ? C.greyMid : C.black}}>
                              {item.name || item.email || "—"}
                            </div>
                            {item.email && (
                              <div style={{fontSize:11,color: isWithdrawn ? "#A04000" : C.greyMid, fontWeight: isWithdrawn ? 700 : 400}}>
                                {item.email}
                              </div>
                            )}
                            {(item.stanowisko || item.firma) && (
                              <div style={{fontSize:11,color: isWithdrawn ? "#A04000" : C.greyMid}}>
                                {[item.stanowisko,item.firma].filter(Boolean).join(" · ")}
                              </div>
                            )}
                            {item.phone && (
                              <div style={{fontSize:11,color: isWithdrawn ? "#A04000" : C.greyMid}}>
                                📞 {item.phone}
                              </div>
                            )}
                            {isContacted && contactedDate && (
                              <div style={{fontSize:10,color:C.greenDk,marginTop:3,fontWeight:600}}>
                                ✓ Skontaktowano {contactedDate}
                              </div>
                            )}
                          </div>
                          <div style={{display:"flex",flexDirection:"column",gap:6,flexShrink:0,alignItems:"flex-end"}}>
                            <div style={{display:"flex",gap:6,alignItems:"center"}}>
                              {item.email && (
                                <a
                                  href={buildMailtoLink({
                                    name:          item.name || "",
                                    email:         item.email,
                                    trainingTitle: itemTraining?.title || "szkolenie",
                                    trainingDate:  "—",
                                  })}
                                  title={`Wyślij mail do ${item.email}`}
                                  style={{
                                    display:"inline-flex",alignItems:"center",justifyContent:"center",
                                    padding:"7px 10px",fontSize:14,
                                    border:"1.5px solid #2980B9",borderRadius:6,
                                    background:"none",color:"#2980B9",
                                    textDecoration:"none",whiteSpace:"nowrap",lineHeight:1,
                                  }}
                                >✉</a>
                              )}
                              {!isWithdrawn && (
                                <button
                                  onClick={() => toggleContacted(item)}
                                  disabled={isUpdating}
                                  style={{
                                    padding:"7px 12px",fontSize:11,fontWeight:700,
                                    border:`1.5px solid ${isContacted ? C.green : C.grey}`,
                                    borderRadius:6,
                                    background: isContacted ? C.green : C.white,
                                    color: isContacted ? C.white : C.greyMid,
                                    cursor:isUpdating?"not-allowed":"pointer",
                                    opacity:isUpdating?0.5:1,
                                    transition:"all .15s",whiteSpace:"nowrap",
                                  }}
                                >
                                  {isUpdating ? "…" : isContacted ? "Saved" : T.adm_int_contacted}
                                </button>
                              )}
                            </div>
                            <button
                              onClick={() => deleteItem(item)}
                              disabled={deletingId === item.id}
                              style={{
                                padding:"4px 8px",fontSize:10,fontWeight:700,
                                border:`1px solid ${C.red}`,borderRadius:4,
                                background:"none",color:C.red,
                                cursor:deletingId===item.id?"not-allowed":"pointer",
                                opacity:deletingId===item.id?0.5:1,whiteSpace:"nowrap",
                              }}
                            >
                              {deletingId===item.id?"…":"🗑 Usuń"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            }

            // ── zgłoszenia z TERMINARZA (standardowy widok) ──────────────────
            const trainingId = sched?.training_id;
            const t = trainingId && trainingId !== "ST"
              ? TRAININGS.find(x => x.id === trainingId)
              : null;
            const grp   = t ? GROUPS.find(g => g.id === t.group) : null;
            const isST  = trainingId === "ST";
            const barColor = isST ? "#8E44AD" : (grp?.color || C.green);
            const trainingTitle = isST
              ? (sched?.custom_name || "Special training")
              : (t?.title || trainingId || "—");

            const dateStr = sched?.date || "";
            const dateObj = dateStr ? new Date(dateStr + "T00:00:00") : null;
            const dateLabel = dateObj
              ? dateObj.toLocaleDateString("pl-PL", { weekday:"long", day:"numeric", month:"long", year:"numeric" })
              : "—";

            const endDateStr = sched?.end_date;
            const dateRange  = endDateStr && endDateStr !== dateStr
              ? `${dateStr} – ${endDateStr}`
              : dateStr;

            const groupContacted  = group.items.filter(i => i.contacted).length;
            const groupTotal      = group.items.length;

            return (
              <div key={sched?.id || dateStr} style={{
                background:C.white,
                borderRadius:8,
                boxShadow:"0 1px 3px rgba(0,0,0,.07)",
                overflow:"hidden",
              }}>
                  {/* nagłówek szkolenia — klikalny, otwiera edycję notatek */}
                <div
                  onClick={() => editingNotes === sched?.id ? setEditingNotes(null) : openNotesEdit(sched)}
                  style={{
                    borderLeft:`4px solid ${barColor}`,
                    padding:"12px 14px",
                    background: editingNotes === sched?.id ? "#F8FFF0" : C.white,
                    borderBottom:`1px solid ${C.grey}`,
                    cursor:"pointer",
                    userSelect:"none",
                  }}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:11,fontWeight:700,color:barColor,marginBottom:3,textTransform:"capitalize"}}>
                        {dateLabel}
                        {endDateStr && endDateStr !== dateStr && (
                          <span style={{fontWeight:400,color:C.greyMid}}> – {endDateStr}</span>
                        )}
                      </div>
                      <div style={{fontSize:14,fontWeight:700,color:C.black,lineHeight:1.3,marginBottom:6}}>
                        {trainingTitle}
                      </div>
                      <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                        {isST ? (
                          <span style={{fontSize:9,fontWeight:700,color:"#8E44AD",background:"#F9F0FF",padding:"2px 7px"}}>⭐ ST</span>
                        ) : grp ? (
                          <span style={{fontSize:9,fontWeight:700,color:grp.color,background:`${grp.color}18`,padding:"2px 7px"}}>{grp.label}</span>
                        ) : null}
                        <span style={{fontSize:11,color:C.greyMid}}>
                          {groupContacted === groupTotal
                            ? <span style={{color:C.greenDk,fontWeight:700}}>✓ Wszyscy skontaktowani ({groupTotal})</span>
                            : <>{groupTotal} {groupTotal === 1 ? "osoba" : "osoby"} · <span style={{color:C.greenDk,fontWeight:700}}>{groupContacted} skontaktowanych</span></>
                          }
                        </span>
                        {sched?.participants_count != null && (
                          <span style={{fontSize:11,color:C.greyMid}}>· 👥 {sched.participants_count}</span>
                        )}
                        {sched?.notes && (
                          <span style={{fontSize:10,color:C.greyMid,fontStyle:"italic",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:120}}>
                            📝 {sched.notes}
                          </span>
                        )}
                      </div>
                    </div>
                    <span style={{fontSize:12,color:C.greyMid,marginLeft:8,flexShrink:0}}>
                      {editingNotes === sched?.id ? "▲" : "✏️"}
                    </span>
                  </div>
                </div>

                {/* inline edytor notatek i liczby uczestników */}
                {editingNotes === sched?.id && (
                  <div onClick={e => e.stopPropagation()} style={{
                    padding:"14px",
                    background:"#F8FFF0",
                    borderBottom:`1px solid ${C.grey}`,
                    display:"flex",flexDirection:"column",gap:10,
                  }}>
                    <div>
                      <div style={{fontSize:11,fontWeight:700,color:C.greyMid,letterSpacing:1,marginBottom:6,textTransform:"uppercase"}}>Notatki</div>
                      <textarea
                        value={notesVal}
                        onChange={e => setNotesVal(e.target.value)}
                        rows={10}
                        placeholder="Dodatkowe informacje o szkoleniu…"
                        style={{width:"100%",padding:"10px 12px",border:`1.5px solid ${C.grey}`,borderRadius:6,fontSize:12,color:C.black,background:C.white,boxSizing:"border-box",resize:"vertical",fontFamily:"inherit",lineHeight:1.55,outline:"none"}}
                      />
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <span style={{fontSize:11,fontWeight:700,color:C.greyMid,letterSpacing:1,textTransform:"uppercase"}}>👥 Uczestników</span>
                      <input
                        type="number" min="0" max="999"
                        value={partVal}
                        onChange={e => setPartVal(e.target.value)}
                        placeholder="—"
                        style={{width:64,padding:"6px 10px",border:`1.5px solid ${C.grey}`,borderRadius:6,fontSize:14,fontWeight:700,color:C.black,background:C.white,textAlign:"center",outline:"none"}}
                      />
                      <div style={{flex:1}}/>
                      <button
                        onClick={() => setEditingNotes(null)}
                        style={{padding:"7px 14px",fontSize:12,fontWeight:700,border:`1px solid ${C.grey}`,borderRadius:6,background:C.white,color:C.greyDk,cursor:"pointer"}}>
                        Anuluj
                      </button>
                      <button
                        onClick={() => saveNotes(sched.id)}
                        disabled={savingNotes}
                        style={{padding:"7px 14px",fontSize:12,fontWeight:700,border:"none",borderRadius:6,background:C.green,color:C.white,cursor:savingNotes?"not-allowed":"pointer",opacity:savingNotes?0.6:1}}>
                        {savingNotes ? "Zapisuję…" : "Zapisz"}
                      </button>
                    </div>
                  </div>
                )}

                {/* lista osób */}
                <div>
                  {group.items.map((item, idx) => {
                    const isUpdating    = updatingId === item.id;
                    const isContacted   = item.contacted;
                    const contactedDate = item.contacted_at
                      ? new Date(item.contacted_at).toLocaleDateString("pl-PL", { day:"numeric", month:"short" })
                      : null;

                    const isWithdrawn = !!item.is_withdrawn;
                    return (
                      <div key={item.id} style={{
                        padding:"12px 14px",
                        borderBottom: idx < group.items.length - 1
                          ? `1px solid ${isWithdrawn ? "#F5CBA7" : C.grey}`
                          : "none",
                        display:"flex",alignItems:"flex-start",gap:12,
                        background: isWithdrawn ? "#FEF9F0" : isContacted ? "#FAFFF5" : C.white,
                        borderLeft: isWithdrawn ? "3px solid #E67E22" : "3px solid transparent",
                        transition:"background .2s",
                      }}>
                        {/* inicjały — kliknięcie kopiuje dane kontaktowe do schowka */}
                        <div
                          onClick={() => {
                            const lines = [];
                            if (item.name)       lines.push(item.name);
                            if (item.email)      lines.push(item.email);
                            if (item.phone)      lines.push(item.phone);
                            if (item.stanowisko) lines.push(item.stanowisko);
                            if (item.firma)      lines.push(item.firma);
                            const text = lines.join("\n");
                            navigator.clipboard.writeText(text).then(() => {
                              // Chwilowy feedback — zmień kolor kółka
                              const el = document.getElementById("avatar-" + item.id);
                              if (el) {
                                el.style.background = "#D4EDDA";
                                el.style.borderColor = "#1a7a3f";
                                el.style.color = "#1a7a3f";
                                setTimeout(() => {
                                  el.style.background = "";
                                  el.style.borderColor = "";
                                  el.style.color = "";
                                }, 1000);
                              }
                            }).catch(() => {});
                          }}
                          id={"avatar-" + item.id}
                          title=T.adm_int_copy
                          style={{
                            width:36,height:36,borderRadius:"50%",flexShrink:0,
                            background: isWithdrawn ? "#FDEBD0" : isContacted ? C.greenBg : C.greyBg,
                            border:`1.5px solid ${isWithdrawn ? "#E67E22" : isContacted ? C.green : C.grey}`,
                            display:"flex",alignItems:"center",justifyContent:"center",
                            fontSize:13,fontWeight:700,
                            color: isWithdrawn ? "#A04000" : isContacted ? C.greenDk : C.greyDk,
                            cursor:"pointer",
                            transition:"background .2s, border-color .2s, color .2s",
                            WebkitUserSelect:"none",userSelect:"none",
                          }}>
                          {(item.name || "?").split(" ").map(n => n[0]).join("").slice(0,2).toUpperCase()}
                        </div>

                        {/* dane osoby */}
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:2}}>
                            <span style={{
                              fontSize:13,fontWeight:700,
                              color: isWithdrawn ? "#A04000" : isContacted ? C.greyDk : C.black,
                              textDecoration: isWithdrawn ? "line-through" : "none",
                            }}>
                              {item.name || "—"}
                            </span>
                            {isWithdrawn && (
                              <span style={{
                                fontSize:10,background:"#E67E22",color:"#fff",
                                padding:"2px 7px",borderRadius:4,fontWeight:700,
                                letterSpacing:.3,flexShrink:0,
                              }}>
                                ↩ WYCOFAŁ/A SIĘ
                              </span>
                            )}
                          </div>
                          {isWithdrawn && (
                            <div style={{fontSize:11,color:"#A04000",marginBottom:4,fontStyle:"italic"}}>
                              📞 Warto zadzwonić — może zmienił/a zdanie
                            </div>
                          )}
                          <div style={{fontSize:11,color:C.greyMid,marginBottom:1}}>{item.email || "—"}</div>
                          {(item.firma || item.stanowisko) && (
                            <div style={{fontSize:11,color:C.greyMid,marginBottom:1}}>
                              {[item.stanowisko, item.firma].filter(Boolean).join(" · ")}
                            </div>
                          )}
                          {item.phone && (
                            <div style={{fontSize:11,color: isWithdrawn ? "#A04000" : C.greyMid, fontWeight: isWithdrawn ? 700 : 400}}>
                              📞 {item.phone}
                            </div>
                          )}
                          {isContacted && contactedDate && (
                            <div style={{fontSize:10,color:C.greenDk,marginTop:3,fontWeight:600}}>
                              ✓ Zapisano {contactedDate}
                            </div>
                          )}
                        </div>

                        {/* przyciski: [✉ mail][status] / [usuń] */}
                        <div style={{display:"flex",flexDirection:"column",gap:6,flexShrink:0,alignItems:"flex-end"}}>
                          {/* górny rząd: mail + status obok siebie */}
                          <div style={{display:"flex",gap:6,alignItems:"center"}}>
                            {item.email && (
                              <a
                                href={buildMailtoLink({
                                  name:          item.name || "",
                                  email:         item.email,
                                  trainingTitle: trainingTitle,
                                  trainingDate:  dateLabel,
                                })}
                                title={`Wyślij mail do ${item.email}`}
                                style={{
                                  display:"inline-flex",alignItems:"center",justifyContent:"center",
                                  padding:"7px 10px",
                                  fontSize:14,
                                  border:`1.5px solid #2980B9`,
                                  borderRadius:6,
                                  background:"none",
                                  color:"#2980B9",
                                  textDecoration:"none",
                                  whiteSpace:"nowrap",
                                  lineHeight:1,
                                }}
                              >
                                ✉
                              </a>
                            )}
                            {!isWithdrawn && (
                              <button
                                onClick={() => toggleContacted(item)}
                                disabled={isUpdating}
                                title={isContacted ? T.adm_int_undo : T.adm_int_contact}
                                style={{
                                  padding:"7px 12px",
                                  fontSize:11,
                                  fontWeight:700,
                                  border:`1.5px solid ${isContacted ? C.green : C.grey}`,
                                  borderRadius:6,
                                  background: isContacted ? C.green : C.white,
                                  color: isContacted ? C.white : C.greyMid,
                                  cursor:isUpdating ? "not-allowed" : "pointer",
                                  opacity:isUpdating ? 0.5 : 1,
                                  transition:"all .15s",
                                  whiteSpace:"nowrap",
                                }}
                              >
                                {isUpdating ? "…" : isContacted ? "Saved" : T.adm_int_contacted}
                              </button>
                            )}
                          </div>
                          {/* dolny rząd: usuń */}
                          <button
                            onClick={() => deleteItem(item)}
                            disabled={deletingId === item.id}
                            title=T.adm_int_delete
                            style={{
                              padding:"4px 8px",
                              fontSize:10,
                              fontWeight:700,
                              border:`1px solid ${C.red}`,
                              borderRadius:4,
                              background:"none",
                              color:C.red,
                              cursor:deletingId === item.id ? "not-allowed" : "pointer",
                              opacity:deletingId === item.id ? 0.5 : 1,
                              whiteSpace:"nowrap",
                            }}
                          >
                            {deletingId === item.id ? "…" : "🗑 Usuń"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
