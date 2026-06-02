import { useState } from "react";
import { C, GROUPS } from "../lib/constants";
import { useTrainings } from "../lib/useTrainings";
import { db } from "../lib/supabase";
import { calcProgress } from "../lib/helpers";
import { Toggle, SecTitle } from "./SharedUI";
import { ExpertCertModal } from "./Modals";
import { log, warn, err as logErr } from "../lib/logger";
import { useT, useLang } from "../lib/LangContext";
import { useUser } from "../lib/UserContext";
import { getExpertProgress, EXPERT_TITLES, MASTER_TITLE } from "../lib/gamification";
import { GramTab } from "./GramTab";

export function ProfileTab({ completed, activeGroups, setActiveGroups, onLogout, trainerView, setTrainerView }) {
  const trainings = useTrainings();
  const { user, setUser } = useUser();
  const T = useT();
  const { titles: expertTitles, master: masterTitle } = getExpertProgress(completed);
  const [expertModal, setExpertModal] = useState(null); // { type, label, badge, date }

  // Oblicza datę ostatniego zaliczenia w grupie (format DD.MM.YYYY) — używana na certyfikacie
  function groupEarnedDate(titleInfo) {
    const ids = new Set(titleInfo.trainings);
    const dates = completed
      .filter(c => ids.has(c?.training?.id) && c.date)
      .map(c => {
        const [dd, mm, yyyy] = c.date.split(".");
        return { str: c.date, ts: new Date(+yyyy, +mm - 1, +dd).getTime() };
      });
    if (!dates.length) return null;
    return dates.reduce((a, b) => b.ts > a.ts ? b : a).str;
  }

  // Data Mastera = najpóźniejsza data ze wszystkich trzech tytułów eksperckich
  function masterEarnedDate() {
    const allDates = completed
      .filter(c => c.date)
      .map(c => {
        const [dd, mm, yyyy] = c.date.split(".");
        return { str: c.date, ts: new Date(+yyyy, +mm - 1, +dd).getTime() };
      });
    if (!allDates.length) return null;
    return allDates.reduce((a, b) => b.ts > a.ts ? b : a).str;
  } // { type, label, badge, date }
  const { lang, switchLang } = useLang();
  const [editName,        setEditName]        = useState(user.displayName);
  const [editStanowisko,  setEditStanowisko]  = useState(user.stanowisko || "");
  const [editFirma,       setEditFirma]       = useState(user.firma || "");
  const [editPhone,       setEditPhone]       = useState(user.phone || "");
  const [editing,         setEditing]         = useState(false);
  const [saving,          setSaving]          = useState(false);
  const [saved,           setSaved]           = useState(false);
  const [saveErr,         setSaveErr]         = useState("");
  const [showGram,        setShowGram]        = useState(false);
  const [showNameWarning, setShowNameWarning] = useState(false);
  const progress = calcProgress(completed, activeGroups);

  // Czy użytkownik zmienił imię względem wartości w bazie
  const nameChanged = editName.trim() !== "" && editName.trim() !== user.name;

  function handleSaveClick() {
    // Jeśli imię się zmieniło i profil NIE jest jeszcze zablokowany — pokaż ostrzeżenie
    if (nameChanged && !user.name_locked) {
      setShowNameWarning(true);
      return;
    }
    saveProfile();
  }

  async function saveProfile() {
    setShowNameWarning(false);
    const name       = editName.trim()       || user.name;
    const stanowisko = editStanowisko.trim() || null;
    const firma      = editFirma.trim()      || null;
    const phone      = editPhone.trim()      || null;
    const lockingName = nameChanged && !user.name_locked;
    setSaving(true); setSaveErr("");
    try {
      log("[SAVE PROFILE] updating user id:", user.id, { name, stanowisko, firma, phone, lockingName });
      const payload = { name, stanowisko, firma, phone };
      if (lockingName) payload.name_locked = true;
      const res = await db.update(user.accessToken, "profiles", `id=eq.${user.id}`, payload);
      log("[SAVE PROFILE] result:", res);
      if (!res || res.length === 0) {
        warn("[SAVE PROFILE] OSTRZEŻENIE: update zwrócił pustą tablicę — prawdopodobnie RLS blokuje UPDATE");
        setSaveErr(T.no_permission);
        return;
      }
      setUser(p => ({
        ...p,
        displayName: name,
        displayRole: stanowisko || "",
        stanowisko,
        firma: firma || "",
        name,
        phone,
        ...(lockingName ? { name_locked: true } : {}),
      }));
      setEditing(false); setSaved(true); setTimeout(() => setSaved(false), 2500);
    } catch(e) {
      logErr("[SAVE PROFILE] ERROR:", e.message);
      setSaveErr(T.save_error + e.message);
    }
    finally { setSaving(false); }
  }

  async function toggleGroup(gid) {
    const next = activeGroups.includes(gid) ? activeGroups.filter(x => x!==gid) : [...activeGroups, gid];
    setActiveGroups(next);
    try {
      const res = await db.update(user.accessToken, "profiles", `id=eq.${user.id}`, { active_groups:next });
      log("[TOGGLE GROUP] result:", res);
      if (!res || res.length === 0) warn("[TOGGLE GROUP] RLS może blokować UPDATE na active_groups");
    } catch(e) { logErr("[TOGGLE GROUP] ERROR:", e.message); }
  }

  const initials = user.displayName.split(" ").map(n => n[0]).join("").slice(0,2).toUpperCase();
  const subtitle = [user.stanowisko, user.firma].filter(Boolean).join(" · ");

  return (
    <>
      <div style={{background:C.greyBg,flex:1,minHeight:0,overflowY:"auto",WebkitOverflowScrolling:"touch",paddingBottom:"calc(72px + env(safe-area-inset-bottom, 0px))"}}>
      <div style={{background:C.white,borderBottom:`1px solid ${C.grey}`,padding:20,display:"flex",gap:16,alignItems:"center"}}>
        <div style={{width:52,height:52,background:C.black,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
          <span style={{color:C.white,fontWeight:700,fontSize:18}}>{initials}</span>
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:18,fontWeight:700,color:C.black,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{user.displayName}</div>
          {subtitle && <div style={{fontSize:12,color:C.greyDk,marginTop:2}}>{subtitle}</div>}
          <div style={{fontSize:11,color:C.greyMid,marginTop:2}}>{user.email}</div>
          {user.phone && <div style={{fontSize:11,color:C.greyMid,marginTop:1}}>📞 {user.phone}</div>}
          {saved && <div style={{fontSize:11,color:C.green,marginTop:3,fontWeight:600}}>{T.changes_saved_inline}</div>}
        </div>
        <button
          style={{background:"none",border:`1px solid ${C.grey}`,color:C.greyDk,padding:"7px 14px",fontSize:12,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}}
          onClick={() => { setEditing(true); setSaved(false); }}
        >{T.edit_btn}</button>
      </div>

      {editing && (
        <div style={{background:C.white,margin:"8px 12px 0",padding:20,boxShadow:"0 1px 3px rgba(0,0,0,.08)",borderTop:`3px solid ${C.green}`}}>
          <div style={{fontSize:11,fontWeight:700,letterSpacing:1,color:C.greyDk,marginBottom:16,textTransform:"uppercase"}}>{T.edit_data_title}</div>

          {/* Pole imienia — zablokowane gdy name_locked === true */}
          <div style={{marginBottom:16}}>
            <label style={{display:"block",fontSize:11,fontWeight:700,color:user.name_locked ? C.greyMid : C.greyDk,marginBottom:6,letterSpacing:.5}}>
              {T.full_name}{user.name_locked ? " 🔒" : ""}
            </label>
            {user.name_locked ? (
              <>
                <div style={{padding:"9px 0",fontSize:15,color:C.greyMid,borderBottom:`2px solid ${C.grey}`,userSelect:"none"}}>
                  {editName}
                </div>
                <div style={{fontSize:11,color:"#7a4a00",marginTop:6,background:"#FEF9E7",border:"1px solid #f5d78e",borderRadius:6,padding:"8px 10px",lineHeight:1.5}}>
                  🔒 {T.name_locked_info}
                </div>
              </>
            ) : (
              <input
                style={{width:"100%",border:"none",borderBottom:`2px solid ${C.green}`,padding:"9px 0",fontSize:15,color:C.black,outline:"none",boxSizing:"border-box"}}
                value={editName}
                placeholder={T.example_name}
                onChange={e => setEditName(e.target.value)}
              />
            )}
          </div>

          {/* Pozostałe pola — zawsze edytowalne */}
          {[[T.position,editStanowisko,setEditStanowisko,T.optional],[T.company,editFirma,setEditFirma,T.optional],[T.phone_label,editPhone,setEditPhone,T.phone_placeholder]].map(([lbl,val,set,ph]) => (
            <div key={lbl} style={{marginBottom:16}}>
              <label style={{display:"block",fontSize:11,fontWeight:700,color:C.greyDk,marginBottom:6,letterSpacing:.5}}>{lbl}</label>
              <input style={{width:"100%",border:"none",borderBottom:`2px solid ${C.green}`,padding:"9px 0",fontSize:15,color:C.black,outline:"none",boxSizing:"border-box"}}
                value={val} placeholder={ph} onChange={e => set(e.target.value)}/>
            </div>
          ))}

          {saveErr && <div style={{color:C.red,fontSize:12,marginBottom:12}}>{saveErr}</div>}
          <div style={{fontSize:11,color:C.greyMid,marginBottom:16}}>{T.profile_note}</div>
          <div style={{display:"flex",gap:8}}>
            <button
              style={{flex:1,background:saving?C.greyDk:C.black,border:"none",color:C.white,padding:12,fontSize:13,fontWeight:600,cursor:saving?"not-allowed":"pointer"}}
              onClick={handleSaveClick}
              disabled={saving}
            >{saving ? T.saving : T.save}</button>
            <button
              style={{flex:1,background:"none",border:`1px solid ${C.grey}`,color:C.greyDk,padding:12,fontSize:13,fontWeight:600,cursor:"pointer"}}
              onClick={() => { setEditing(false); setEditName(user.displayName); setEditStanowisko(user.stanowisko||""); setEditFirma(user.firma||""); setEditPhone(user.phone||""); setSaveErr(""); setShowNameWarning(false); }}
            >{T.cancel}</button>
          </div>
        </div>
      )}

      {/* ── Modal ostrzeżenia o blokadzie imienia ── */}
      {showNameWarning && (
        <div style={{position:"fixed",inset:0,zIndex:1000,background:"rgba(0,0,0,.7)",display:"flex",alignItems:"center",justifyContent:"center",padding:16,fontFamily:"'Helvetica Neue',Helvetica,Arial,sans-serif"}} onClick={() => setShowNameWarning(false)}>
          <div style={{background:C.white,width:"100%",maxWidth:360,borderRadius:16,overflow:"hidden",boxShadow:"0 24px 64px rgba(0,0,0,.4)"}} onClick={e => e.stopPropagation()}>
            {/* Header — czarny jak w CertModal */}
            <div style={{background:C.black,padding:"16px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",borderRadius:"16px 16px 0 0"}}>
              <div style={{color:C.white,fontSize:13,fontWeight:700,letterSpacing:.5}}>{T.name_change_header}</div>
              <button onClick={() => setShowNameWarning(false)} style={{background:"none",border:"none",color:"#fff",fontSize:18,cursor:"pointer",opacity:.7}}>✕</button>
            </div>
            {/* Zielony pasek */}
            <div style={{height:3,background:C.green}}/>
            {/* Treść */}
            <div style={{padding:"20px 24px"}}>
              <div style={{fontSize:9,fontWeight:700,letterSpacing:3,color:C.greyMid,marginBottom:6,textTransform:"uppercase"}}>{T.new_name_label}</div>
              <div style={{fontSize:17,fontWeight:700,color:C.black,marginBottom:16}}>{editName.trim()}</div>
              <div style={{height:1,background:C.grey,marginBottom:16}}/>
              <div style={{background:"#FFF8E1",border:"1px solid #f5d78e",borderRadius:8,padding:"12px 14px"}}>
                <div style={{fontSize:11,fontWeight:700,color:"#7a4a00",marginBottom:4,letterSpacing:.5,textTransform:"uppercase"}}>⚠ {T.name_change_warning_title}</div>
                <div style={{fontSize:12,color:"#7a4a00",lineHeight:1.6}}>{T.name_change_warning_body}</div>
              </div>
            </div>
            {/* Przyciski */}
            <div style={{borderTop:`1px solid ${C.grey}`,padding:"12px 24px",display:"flex",flexDirection:"column",gap:8}}>
              <button
                onClick={saveProfile}
                style={{width:"100%",background:C.black,border:"none",color:C.white,padding:"13px 0",fontSize:13,fontWeight:600,cursor:"pointer",borderRadius:0}}
              >{T.name_change_confirm}</button>
              <button
                onClick={() => setShowNameWarning(false)}
                style={{width:"100%",background:"none",border:`1px solid ${C.grey}`,color:C.greyDk,padding:"13px 0",fontSize:13,fontWeight:600,cursor:"pointer",borderRadius:0}}
              >{T.name_change_cancel}</button>
            </div>
          </div>
        </div>
      )}

      <div style={{padding:"8px 12px 40px",display:"flex",flexDirection:"column",gap:8}}>

        {/* ENGEL Virtual Expert Academy */}
        <div style={{background:C.white}}>
          <button
            onClick={() => setShowGram(true)}
            style={{width:"100%",padding:"14px 18px",background:"none",border:"none",display:"flex",alignItems:"center",gap:14,cursor:"pointer",textAlign:"left"}}>
            <div style={{width:40,height:40,background:C.black,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              <span style={{fontSize:20}}>🎮</span>
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:14,fontWeight:700,color:C.black}}>Virtual Expert Academy</div>
              <div style={{fontSize:11,color:C.greyMid,marginTop:2}}>{T.points_ranking}</div>
            </div>
            <span style={{fontSize:20,color:C.greyMid}}>›</span>
          </button>
        </div>

        <div style={{background:C.white}}>
          {trainerView !== "trainer" && <>
            <SecTitle>{T.training_groups}</SecTitle>
            {GROUPS.map(g => {
              const active = activeGroups.includes(g.id);
              const gT = trainings.filter(t => t.group===g.id);
              const gD = completed.filter(c => gT.some(t => t.id===c.training.id)).length;
              const titleInfo = expertTitles.find(t => t.group === g.id);
              const earned = titleInfo?.earned;
              return (
                <div key={g.id} style={{borderBottom:`1px solid ${C.grey}`}}>
                  <div style={{padding:"13px 18px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                    <div style={{flex:1}}>
                      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:3}}>
                        <span style={{width:10,height:10,borderRadius:"50%",background:active?g.color:C.grey,flexShrink:0,display:"inline-block"}}/>
                        <span style={{fontSize:14,fontWeight:active?700:400,color:active?C.black:C.greyMid}}>{g.label}</span>
                        {earned && (
                          <span style={{fontSize:10,fontWeight:700,color:titleInfo.color,
                            background:titleInfo.colorBg,border:`0.5px solid ${titleInfo.colorBorder}`,
                            padding:"1px 7px",borderRadius:99,marginLeft:2}}>
                            {titleInfo.badge} {titleInfo.label}
                          </span>
                        )}
                      </div>
                      <div style={{fontSize:11,color:C.greyMid,paddingLeft:20}}>
                        {gT.length} szkoleń{active ? ` · ${gD} ${T.completed_word}` : ""}
                      </div>
                      {active && !earned && gD > 0 && (
                        <div style={{paddingLeft:20,marginTop:5}}>
                          <div style={{height:3,background:C.grey,borderRadius:2,overflow:"hidden",maxWidth:160}}>
                            <div style={{height:"100%",borderRadius:2,background:g.color,
                              width:`${Math.round((gD/gT.length)*100)}%`,transition:"width .4s ease"}}/>
                          </div>
                          <div style={{fontSize:10,color:C.greyMid,marginTop:2}}>{gD} / {gT.length} do tytułu</div>
                        </div>
                      )}
                      {earned && titleInfo && (
                        <div style={{paddingLeft:20,marginTop:6}}>
                          <button
                            onClick={() => setExpertModal({
                              type:  titleInfo.id,
                              label: titleInfo.label,
                              badge: titleInfo.badge,
                              date:  groupEarnedDate(titleInfo),
                            })}
                            style={{fontSize:11,fontWeight:700,
                              color:titleInfo.color,
                              background:titleInfo.colorBg,
                              border:`0.5px solid ${titleInfo.colorBorder}`,
                              padding:"4px 12px",borderRadius:6,cursor:"pointer"}}>
                            🎓 Certyfikat
                          </button>
                        </div>
                      )}
                    </div>
                    <Toggle value={active} color={g.color} onChange={() => toggleGroup(g.id)}/>
                  </div>
                </div>
              );
            })}

            {/* ── Tytuły eksperckie i Master ── */}
            {masterTitle.earned ? (
              <div style={{margin:"10px 18px 4px",padding:"14px 16px",
                background:"#F0EAFE",border:"1.5px solid #C9B8F0",borderRadius:12,
                display:"flex",alignItems:"center",gap:14}}>
                <div style={{width:48,height:48,borderRadius:"50%",flexShrink:0,
                  background:"#5B3FA0",display:"flex",alignItems:"center",
                  justifyContent:"center",fontSize:24,
                  boxShadow:"0 0 0 3px #C9B8F0"}}>🏆</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:15,fontWeight:700,color:"#5B3FA0",marginBottom:2}}>
                    ENGEL Certified Master
                  </div>
                  <div style={{fontSize:11,color:"#7C5CC0",marginBottom:8}}>
                    Wszystkie kategorie szkoleń ukończone
                  </div>
                  <button
                    onClick={() => setExpertModal({
                      type:  "master",
                      label: "ENGEL Certified Master",
                      badge: "🏆",
                      date:  masterEarnedDate(),
                    })}
                    style={{fontSize:11,fontWeight:700,
                      color:"#5B3FA0",background:"#E8DFFC",
                      border:"0.5px solid #C9B8F0",
                      padding:"4px 12px",borderRadius:6,cursor:"pointer"}}>
                    🎓 Certyfikat Master
                  </button>
                </div>
              </div>
            ) : masterTitle.earnedCount > 0 ? (
              <div style={{margin:"10px 18px 4px",padding:"11px 14px",
                background:C.greyBg,border:`0.5px solid ${C.grey}`,borderRadius:10,
                display:"flex",alignItems:"center",gap:12}}>
                <div style={{fontSize:22,flexShrink:0,opacity:.4}}>🏆</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,fontWeight:700,color:C.greyMid,marginBottom:2}}>
                    ENGEL Certified Master
                  </div>
                  <div style={{fontSize:10,color:C.greyMid}}>
                    {masterTitle.earnedCount} / {masterTitle.total} tytułów eksperckich
                  </div>
                  <div style={{marginTop:5,height:3,background:C.grey,borderRadius:2,overflow:"hidden"}}>
                    <div style={{height:"100%",borderRadius:2,background:"#5B3FA0",
                      width:`${Math.round((masterTitle.earnedCount/masterTitle.total)*100)}%`,
                      transition:"width .4s ease"}}/>
                  </div>
                </div>
              </div>
            ) : null}
            {activeGroups.length > 0 && (
              <div style={{padding:"12px 18px",background:C.greyBg,borderTop:`1px solid ${C.grey}`}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                  <span style={{fontSize:12,color:C.greyDk}}>{T.overall_progress}</span>
                  <span style={{fontSize:16,fontWeight:700,color:C.green}}>{progress.pct}%</span>
                </div>
                <div style={{height:4,background:C.grey}}><div style={{height:"100%",background:C.green,width:`${progress.pct}%`,transition:"width .5s"}}/></div>
                <div style={{fontSize:11,color:C.greyMid,marginTop:4}}>{progress.done} / {progress.total} {T.trainings_done}</div>
              </div>
            )}
          </>}
          {user.trainer_id != null && trainerView !== undefined && (
            <div style={{padding:"13px 18px",borderTop:`1px solid ${C.grey}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:3}}>
                  <span style={{width:10,height:10,borderRadius:"50%",background:trainerView==="client"?C.green:C.grey,flexShrink:0,display:"inline-block"}}/>
                  <span style={{fontSize:14,fontWeight:trainerView==="client"?700:400,color:trainerView==="client"?C.black:C.greyMid}}>{T.panel_client}</span>
                </div>
                <div style={{fontSize:11,color:C.greyMid,paddingLeft:20}}>
                  {trainerView==="client" ? T.view_active : T.trainer_view_active}
                </div>
              </div>
              <Toggle value={trainerView==="client"} color={C.green} onChange={() => setTrainerView && setTrainerView(trainerView==="client" ? "trainer" : "client")}/>
            </div>
          )}
        </div>

        <div style={{background:C.white}}>
          <SecTitle>{T.language_section}</SecTitle>
          <div style={{padding:"14px 18px",display:"flex",gap:8}}>
            {["pl","en"].map(l => (
              <button key={l} onClick={() => switchLang(l)}
                style={{flex:1,padding:"12px",fontSize:13,fontWeight:700,border:`2px solid ${lang===l?C.black:C.grey}`,background:lang===l?C.black:C.white,color:lang===l?C.white:C.greyDk,cursor:"pointer",letterSpacing:.5}}>
                {l === "pl" ? "🇵🇱  Polski" : "🇬🇧  English"}
              </button>
            ))}
          </div>
        </div>

        <div style={{background:C.white,padding:"14px 18px",borderTop:`3px solid ${C.green}`}}>
          <div style={{fontSize:11,fontWeight:700,letterSpacing:1,color:C.greyDk,marginBottom:8,textTransform:"uppercase"}}>{T.account_security}</div>
          <div style={{fontSize:12,color:C.greyMid,lineHeight:1.6,marginBottom:4}}>{T.security_note}</div>
        </div>

        <button style={{background:C.black,border:"none",color:C.white,padding:16,fontSize:14,fontWeight:600,cursor:"pointer",marginTop:8}} onClick={onLogout}>{T.logout}</button>
      </div>
    </div>
    {showGram && <GramTab onClose={() => setShowGram(false)}/>}
      {expertModal && (
        <ExpertCertModal
          titleType={expertModal.type}
          titleLabel={expertModal.label}
          titleBadge={expertModal.badge}
          earnedDate={expertModal.date}
          onClose={() => setExpertModal(null)}
        />
      )}
    </>
  );
}
