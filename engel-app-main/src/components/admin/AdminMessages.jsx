import { useState, useEffect } from "react";
import { C, MSG_TYPES } from "../../lib/constants";
import { db } from "../../lib/supabase";
import { formatDate } from "../../lib/helpers";
import { Spinner, Toggle } from "../SharedUI";
import { useToast } from "../../lib/ToastContext";

export function AdminMessages({ token }) {
  const { addToast } = useToast();
  const [messages, setMessages] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [fTitle,   setFTitle]   = useState("");
  const [fBody,    setFBody]    = useState("");
  const [fType,    setFType]    = useState("info");
  const [fPinned,  setFPinned]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [formErr,  setFormErr]  = useState("");
  const [deleting, setDeleting] = useState(null);

  async function loadMessages() {
    setLoading(true);
    try {
      const data = await db.get(token, "messages", "order=pinned.desc,created_at.desc&select=*");
      setMessages(data);
    } catch {}
    finally { setLoading(false); }
  }

  useEffect(() => { loadMessages(); }, []);

  async function sendMessage() {
    if (!fTitle.trim()) { setFormErr("Tytuł jest wymagany"); return; }
    if (!fBody.trim())  { setFormErr("Treść jest wymagana"); return; }
    setSaving(true); setFormErr("");
    try {
      await db.insert(token, "messages", { title:fTitle.trim(), body:fBody.trim(), type:fType, pinned:fPinned });
      setFTitle(""); setFBody(""); setFType("info"); setFPinned(false); setShowForm(false);
      await loadMessages();
    } catch(e) { setFormErr("Błąd wysyłania: " + e.message); }
    finally { setSaving(false); }
  }

  async function deleteMessage(id) {
    if (!window.confirm("Usunąć tę wiadomość?")) return;
    setDeleting(id);
    try {
      await db.remove(token, "messages", `id=eq.${id}`);
      setMessages(p => p.filter(m => m.id !== id));
    } catch(e) { addToast("Błąd usuwania: " + e.message); }
    finally { setDeleting(null); }
  }

  if (loading) return <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center"}}><Spinner/></div>;

  return (
    <div style={{padding:16,display:"flex",flexDirection:"column",gap:12}}>
      <div style={{background:C.white,padding:18,borderTop:`3px solid ${C.green}`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:showForm?16:0}}>
          <div style={{fontSize:11,fontWeight:700,letterSpacing:1,color:C.greyDk,textTransform:"uppercase"}}>Wyślij wiadomość</div>
          <button onClick={() => { setShowForm(p=>!p); setFormErr(""); }}
            style={{background:showForm?"none":C.black,border:`1px solid ${showForm?C.grey:C.black}`,color:showForm?C.greyDk:C.white,padding:"7px 14px",fontSize:12,fontWeight:600,cursor:"pointer"}}>
            {showForm ? "Anuluj" : "+ Nowa"}
          </button>
        </div>
        {showForm && (
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div>
              <label style={{display:"block",fontSize:11,fontWeight:700,color:C.greyDk,marginBottom:5,letterSpacing:.5}}>TYTUŁ *</label>
              <input style={{width:"100%",border:`1.5px solid ${C.grey}`,padding:"9px 12px",fontSize:14,color:C.black,outline:"none",boxSizing:"border-box"}}
                value={fTitle} onChange={e => setFTitle(e.target.value)} placeholder="Tytuł wiadomości"/>
            </div>
            <div>
              <label style={{display:"block",fontSize:11,fontWeight:700,color:C.greyDk,marginBottom:5,letterSpacing:.5}}>TREŚĆ *</label>
              <textarea style={{width:"100%",border:`1.5px solid ${C.grey}`,padding:"9px 12px",fontSize:13,color:C.black,outline:"none",boxSizing:"border-box",minHeight:90,resize:"vertical",fontFamily:"inherit"}}
                value={fBody} onChange={e => setFBody(e.target.value)} placeholder="Treść wiadomości..."/>
            </div>
            <div>
              <label style={{display:"block",fontSize:11,fontWeight:700,color:C.greyDk,marginBottom:8,letterSpacing:.5}}>TYP</label>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {Object.entries(MSG_TYPES).map(([key,mt]) => (
                  <button key={key} onClick={() => setFType(key)}
                    style={{padding:"6px 14px",fontSize:12,fontWeight:600,cursor:"pointer",border:`2px solid ${fType===key?mt.color:C.grey}`,background:fType===key?mt.bg:C.white,color:fType===key?mt.color:C.greyDk}}>
                    {mt.icon} {key.charAt(0).toUpperCase()+key.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <Toggle value={fPinned} color={C.green} onChange={() => setFPinned(p=>!p)}/>
              <span style={{fontSize:13,color:C.black}}>Przypnij wiadomość na górze</span>
            </div>
            {(fTitle||fBody) && (
              <div>
                <div style={{fontSize:11,fontWeight:700,color:C.greyDk,marginBottom:6,letterSpacing:.5}}>PODGLĄD</div>
                <div style={{background:fPinned?(MSG_TYPES[fType]||MSG_TYPES.info).bg:C.greyBg,border:`1px solid ${(MSG_TYPES[fType]||MSG_TYPES.info).color+"44"}`,padding:14}}>
                  <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                    <span style={{fontSize:18}}>{(MSG_TYPES[fType]||MSG_TYPES.info).icon}</span>
                    <div>
                      <div style={{fontSize:13,fontWeight:700,color:C.black,marginBottom:4}}>{fTitle||"(brak tytułu)"}</div>
                      <div style={{fontSize:12,color:C.greyDk,lineHeight:1.6}}>{fBody||"(brak treści)"}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {formErr && <div style={{color:C.red,fontSize:12}}>{formErr}</div>}
            <button onClick={sendMessage} disabled={saving}
              style={{background:saving?C.greyDk:C.black,border:"none",color:C.white,padding:12,fontSize:13,fontWeight:600,cursor:saving?"not-allowed":"pointer"}}>
              {saving ? "Wysyłanie..." : "Wyślij wiadomość"}
            </button>
          </div>
        )}
      </div>

      <div style={{fontSize:11,fontWeight:700,letterSpacing:1,color:C.greyDk,textTransform:"uppercase",padding:"4px 2px"}}>Wszystkie wiadomości ({messages.length})</div>
      {messages.length === 0 && <div style={{background:C.white,padding:24,textAlign:"center",color:C.greyMid,fontSize:13}}>Brak wiadomości</div>}
      {messages.map(m => {
        const mt = MSG_TYPES[m.type] || MSG_TYPES.info;
        return (
          <div key={m.id} style={{background:m.pinned?mt.bg:C.white,border:`1px solid ${m.pinned?mt.color+"44":"rgba(0,0,0,.06)"}`,padding:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8,marginBottom:6}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:16}}>{mt.icon}</span>
                <span style={{fontSize:13,fontWeight:700,color:C.black}}>{m.title}</span>
                {m.pinned && <span style={{fontSize:9,fontWeight:700,color:mt.color,background:`${mt.color}22`,padding:"2px 6px",letterSpacing:1}}>PRZYPIĘTE</span>}
              </div>
              <button onClick={() => deleteMessage(m.id)} disabled={deleting===m.id}
                style={{background:"none",border:`1px solid ${C.red}`,color:C.red,padding:"4px 10px",fontSize:11,fontWeight:600,cursor:"pointer",flexShrink:0}}>
                {deleting===m.id ? "..." : "🗑 Usuń"}
              </button>
            </div>
            <div style={{fontSize:12,color:C.greyDk,lineHeight:1.6,marginBottom:6}}>{m.body}</div>
            <div style={{fontSize:10,color:C.greyMid}}>{formatDate(m.created_at)}</div>
          </div>
        );
      })}
    </div>
  );
}
