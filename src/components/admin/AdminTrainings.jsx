import { useState, useEffect } from "react";
import { C, GROUPS, LVL_COLOR, LVL_LABEL } from "../../lib/constants";
import { TRAININGS } from "../../data/trainings";
import { db, authHeaders, SB_URL } from "../../lib/supabase";
import { Spinner } from "../SharedUI";
import { useToast } from "../../lib/ToastContext";

export function AdminTrainings({ token }) {
  const { addToast } = useToast();
  const [trainings, setTrainings] = useState(() => JSON.parse(JSON.stringify(TRAININGS)));
  const [editId,    setEditId]    = useState(null);
  const [editData,  setEditData]  = useState({});
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);
  const [loading,   setLoading]   = useState(true);
  const [filter,    setFilter]    = useState("all");

  useEffect(() => {
    db.get(token, "training_overrides", "select=*")
      .then(overrides => {
        if (overrides.length) {
          setTrainings(TRAININGS.map(t => {
            const ov = overrides.find(o => o.training_id === t.id);
            return ov ? { ...t, title:ov.title||t.title, desc:ov.description||t.desc, duration:ov.duration||t.duration, level:ov.level||t.level } : t;
          }));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function startEdit(t) {
    setEditId(t.id);
    setEditData({ title:t.title, desc:t.desc, duration:t.duration, level:t.level });
  }

  async function saveEdit(id) {
    setSaving(true);
    try {
      const h = { ...authHeaders(token), "Prefer":"resolution=merge-duplicates,return=representation" };
      const r = await fetch(`${SB_URL}/rest/v1/training_overrides`, {
        method: "POST", headers: h,
        body: JSON.stringify({ training_id:id, title:editData.title, description:editData.desc, duration:editData.duration, level:editData.level, updated_at: new Date().toISOString() })
      });
      if (!r.ok) throw new Error(await r.text());
      setTrainings(p => p.map(t => t.id===id ? {...t, ...editData} : t));
      setEditId(null); setSaved(true); setTimeout(() => setSaved(false), 2500);
    } catch(e) {
      addToast("Błąd zapisu: " + e.message);
    } finally { setSaving(false); }
  }

  function cancelEdit() { setEditId(null); setEditData({}); }

  const list = filter==="all" ? trainings : trainings.filter(t => t.group===filter);

  if (loading) return <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center"}}><Spinner/></div>;

  return (
    <div style={{padding:16,display:"flex",flexDirection:"column",gap:12}}>
      <div style={{background:C.white,padding:"12px 16px",borderTop:`3px solid ${C.green}`}}>
        <div style={{fontSize:11,fontWeight:700,letterSpacing:1,color:C.greyDk,marginBottom:12,textTransform:"uppercase"}}>Edytor szkoleń</div>
        {saved && <div style={{color:C.greenDk,fontSize:12,marginBottom:8,fontWeight:600}}>✓ Zmiany zapisane — widoczne dla wszystkich użytkowników</div>}
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {[["all","Wszystkie"],...GROUPS.map(g=>[g.id,g.label])].map(([id,label]) => (
            <button key={id} onClick={() => setFilter(id)}
              style={{padding:"5px 12px",fontSize:11,fontWeight:600,cursor:"pointer",border:`1px solid ${filter===id?C.black:C.grey}`,background:filter===id?C.black:C.white,color:filter===id?C.white:C.greyDk}}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {list.map(t => {
        const grp = GROUPS.find(g => g.id===t.group);
        const isEditing = editId === t.id;
        const orig = TRAININGS.find(o => o.id===t.id);
        const isModified = orig && (orig.title !== t.title || orig.desc !== t.desc);
        return (
          <div key={t.id} style={{background:C.white,border:`1px solid ${isEditing?C.green:"rgba(0,0,0,.06)"}`,boxShadow:"0 1px 3px rgba(0,0,0,.06)"}}>
            <div style={{borderLeft:`4px solid ${grp?.color||C.grey}`,padding:14}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8,marginBottom:6}}>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
                    <span style={{fontSize:10,fontWeight:700,color:C.greyMid,letterSpacing:1}}>{t.id} · {grp?.label}</span>
                    {isModified && <span style={{fontSize:9,fontWeight:700,color:C.amber,background:"#FEF3E2",padding:"1px 6px"}}>EDYTOWANE</span>}
                  </div>
                  {isEditing ? (
                    <input style={{width:"100%",border:`1.5px solid ${C.green}`,padding:"6px 10px",fontSize:14,fontWeight:700,color:C.black,outline:"none",boxSizing:"border-box",marginBottom:8}}
                      value={editData.title} onChange={e => setEditData(p=>({...p,title:e.target.value}))}/>
                  ) : (
                    <div style={{fontSize:13,fontWeight:700,color:C.black,lineHeight:1.3,marginBottom:4}}>{t.title}</div>
                  )}
                  <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
                    {isEditing ? (
                      <>
                        <select value={editData.level} onChange={e => setEditData(p=>({...p,level:Number(e.target.value)}))}
                          style={{border:`1px solid ${C.grey}`,padding:"4px 8px",fontSize:11,color:C.black,background:C.white}}>
                          {[1,2,3].map(l => <option key={l} value={l}>{LVL_LABEL[l]}</option>)}
                        </select>
                        <input value={editData.duration} onChange={e => setEditData(p=>({...p,duration:e.target.value}))}
                          placeholder="czas trwania"
                          style={{border:`1px solid ${C.grey}`,padding:"4px 8px",fontSize:11,color:C.black,width:90}}/>
                      </>
                    ) : (
                      <>
                        <span style={{fontSize:11,color:LVL_COLOR[t.level],fontWeight:600}}>{LVL_LABEL[t.level]}</span>
                        <span style={{fontSize:11,color:C.greyMid}}>📅 {t.duration}</span>
                      </>
                    )}
                  </div>
                </div>
                {!isEditing && (
                  <button onClick={() => startEdit(t)}
                    style={{background:"none",border:`1px solid ${C.grey}`,color:C.greyDk,padding:"5px 12px",fontSize:11,fontWeight:600,cursor:"pointer",flexShrink:0}}>
                    ✏️ Edytuj
                  </button>
                )}
              </div>

              {isEditing && (
                <div style={{marginTop:8}}>
                  <label style={{display:"block",fontSize:11,fontWeight:700,color:C.greyDk,marginBottom:5,letterSpacing:.5}}>OPIS SZKOLENIA</label>
                  <textarea value={editData.desc} onChange={e => setEditData(p=>({...p,desc:e.target.value}))}
                    style={{width:"100%",border:`1.5px solid ${C.grey}`,padding:"9px 12px",fontSize:12,color:C.black,outline:"none",boxSizing:"border-box",minHeight:110,resize:"vertical",fontFamily:"inherit",lineHeight:1.6}}/>
                  <div style={{display:"flex",gap:8,marginTop:10}}>
                    <button onClick={() => saveEdit(t.id)} disabled={saving}
                      style={{flex:1,background:saving?C.greyDk:C.greenDk,border:"none",color:C.white,padding:10,fontSize:12,fontWeight:600,cursor:saving?"not-allowed":"pointer"}}>
                      {saving?"Zapisywanie...":"✓ Zapisz dla wszystkich"}
                    </button>
                    <button onClick={cancelEdit}
                      style={{flex:1,background:"none",border:`1px solid ${C.grey}`,color:C.greyDk,padding:10,fontSize:12,fontWeight:600,cursor:"pointer"}}>
                      Anuluj
                    </button>
                  </div>
                </div>
              )}

              {!isEditing && (
                <div style={{fontSize:12,color:C.greyDk,lineHeight:1.6,marginTop:4}}>{t.desc.length>120?t.desc.slice(0,120)+"…":t.desc}</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
