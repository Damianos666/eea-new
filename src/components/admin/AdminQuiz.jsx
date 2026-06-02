import { useState, useEffect, useRef } from "react";
import { C, GROUPS } from "../../lib/constants";
import { TRAININGS } from "../../data/trainings";
import { db } from "../../lib/supabase";
import { Spinner } from "../SharedUI";
import { useToast } from "../../lib/ToastContext";
import { useUser } from "../../lib/UserContext";

export function AdminQuiz() {
  const { token } = useUser();
  const [quizzes,      setQuizzes]      = useState([]);
  const [selQuiz,      setSelQuiz]      = useState(null);
  const [questions,    setQuestions]    = useState([]);
  const [usedIds,      setUsedIds]      = useState(new Set()); // pytania użyte jako tip
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [deleting,     setDeleting]     = useState(null);
  const [err,          setErr]          = useState("");

  // Formularz nowego quizu
  const [showQuizForm, setShowQuizForm] = useState(false);
  const [qzMode,       setQzMode]       = useState("training");
  const [qzTraining,   setQzTraining]   = useState(TRAININGS[0].id);
  const [qzCustom,     setQzCustom]     = useState("");

  // Formularz pytania
  const [showQForm,    setShowQForm]    = useState(false);
  const [editingQ,     setEditingQ]     = useState(null);
  const [fQ,  setFQ]  = useState("");
  const [fA,  setFA]  = useState("");
  const [fB,  setFB]  = useState("");
  const [fC,  setFC]  = useState("");
  const [fAns,setFAns]= useState("a");

  // Potwierdzenie usunięcia: { type:"quiz"|"question", item }
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // Long-press
  const pressTimer = useRef(null);
  const HOLD_MS = 600;

  function startHold(cb) {
    pressTimer.current = setTimeout(() => {
      if (navigator.vibrate) navigator.vibrate(80);
      cb();
    }, HOLD_MS);
  }
  function cancelHold() {
    clearTimeout(pressTimer.current);
  }

  // ── Załaduj quizy ────────────────────────────────────────────────────────
  async function loadQuizzes() {
    setLoading(true); setErr("");
    try {
      const data = await db.get(token, "quizzes", "order=created_at.asc&select=*");
      const counts = await db.get(token, "quiz_questions", "select=quiz_id");
      const countMap = {};
      counts.forEach(q => { countMap[q.quiz_id] = (countMap[q.quiz_id] || 0) + 1; });
      setQuizzes(data.map(qz => ({ ...qz, questionCount: countMap[qz.id] || 0 })));
    } catch(e) { setErr("Błąd: " + e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { loadQuizzes(); }, []);

  async function loadQuestions(quizId) {
    setLoading(true);
    try {
      const [data, confirmations] = await Promise.all([
        db.get(token, "quiz_questions", `quiz_id=eq.${quizId}&order=created_at.asc&select=*`),
        db.get(token, "tip_confirmations", "select=question_id").catch(() => []),
      ]);
      setQuestions(data);
      setUsedIds(new Set(confirmations.map(r => r.question_id).filter(Boolean)));
    } catch(e) { setErr("Błąd: " + e.message); }
    finally { setLoading(false); }
  }

  function openQuiz(qz) { setSelQuiz(qz); setErr(""); setShowQForm(false); loadQuestions(qz.id); }
  function backToList() { setSelQuiz(null); setShowQForm(false); setEditingQ(null); loadQuizzes(); }

  // ── Utwórz quiz ───────────────────────────────────────────────────────────
  async function createQuiz() {
    const title = qzMode === "training"
      ? (TRAININGS.find(t => t.id === qzTraining)?.title || qzTraining)
      : qzCustom.trim();
    const training_id = qzMode === "training" ? qzTraining : null;
    if (!title) { setErr("Podaj nazwę quizu."); return; }
    setSaving(true); setErr("");
    try {
      const res = await db.insert(token, "quizzes", { title, training_id });
      setShowQuizForm(false); setQzCustom("");
      await loadQuizzes();
      if (res?.[0]) openQuiz({ ...res[0], questionCount: 0 });
    } catch(e) { setErr("Błąd: " + e.message); }
    finally { setSaving(false); }
  }

  // ── Usuń (po potwierdzeniu) ───────────────────────────────────────────────
  async function confirmDelete() {
    if (!deleteConfirm) return;
    setDeleting(deleteConfirm.item.id);
    setDeleteConfirm(null);
    try {
      if (deleteConfirm.type === "quiz") {
        await db.remove(token, "quizzes", `id=eq.${deleteConfirm.item.id}`);
        setQuizzes(p => p.filter(q => q.id !== deleteConfirm.item.id));
      } else {
        await db.remove(token, "quiz_questions", `id=eq.${deleteConfirm.item.id}`);
        setQuestions(p => p.filter(q => q.id !== deleteConfirm.item.id));
      }
    } catch(e) { setErr("Błąd: " + e.message); }
    finally { setDeleting(null); }
  }

  // ── Formularz pytania ─────────────────────────────────────────────────────
  function openNewQ() { setEditingQ(null); setFQ(""); setFA(""); setFB(""); setFC(""); setFAns("a"); setShowQForm(true); setErr(""); }
  function openEditQ(q) { setEditingQ(q); setFQ(q.question); setFA(q.answer_a); setFB(q.answer_b); setFC(q.answer_c); setFAns(q.correct); setShowQForm(true); setErr(""); }
  async function saveQ() {
    if (!fQ.trim()||!fA.trim()||!fB.trim()||!fC.trim()) { setErr("Wypełnij wszystkie pola."); return; }
    setSaving(true); setErr("");
    const payload = { question:fQ.trim(), answer_a:fA.trim(), answer_b:fB.trim(), answer_c:fC.trim(), correct:fAns, quiz_id:selQuiz.id };
    try {
      if (editingQ) await db.update(token, "quiz_questions", `id=eq.${editingQ.id}`, payload);
      else          await db.insert(token, "quiz_questions", payload);
      setShowQForm(false);
      await loadQuestions(selQuiz.id);
    } catch(e) { setErr("Błąd zapisu: " + e.message); }
    finally { setSaving(false); }
  }

  const inpStyle = { width:"100%", boxSizing:"border-box", border:`1px solid ${C.grey}`, padding:"9px 12px", fontSize:13, marginBottom:10, borderRadius:4 };

  // ── Modal potwierdzenia usunięcia ─────────────────────────────────────────
  const deleteModal = deleteConfirm && (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.65)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999,padding:16,fontFamily:"'Helvetica Neue',Helvetica,Arial,sans-serif"}}>
      <div style={{background:C.white,width:"100%",maxWidth:380,borderRadius:12,boxShadow:"0 20px 60px rgba(0,0,0,.35)",overflow:"hidden"}}>
        <div style={{background:C.darkHdr,padding:"14px 20px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <span style={{color:C.white,fontSize:13,fontWeight:700,letterSpacing:1}}>
            {deleteConfirm.type === "quiz" ? "USUŃ QUIZ" : "USUŃ PYTANIE"}
          </span>
          <button onClick={() => setDeleteConfirm(null)} style={{background:"none",border:"none",color:"#fff",fontSize:18,cursor:"pointer",opacity:.7}}>✕</button>
        </div>
        <div style={{height:3,background:C.red}}/>
        <div style={{padding:20,display:"flex",flexDirection:"column",gap:12}}>
          <div style={{fontSize:13,color:C.greyDk}}>
            {deleteConfirm.type === "quiz"
              ? "Czy na pewno chcesz usunąć ten quiz? Wszystkie pytania zostaną usunięte."
              : "Czy na pewno chcesz usunąć to pytanie?"}
          </div>
          <div style={{background:C.greyBg,padding:"10px 14px",borderLeft:`3px solid ${C.red}`,fontSize:13,fontWeight:600,color:C.black}}>
            {deleteConfirm.type === "quiz" ? deleteConfirm.item.title : deleteConfirm.item.question}
          </div>
        </div>
        <div style={{padding:"0 20px 20px",display:"flex",gap:10}}>
          <button onClick={() => setDeleteConfirm(null)}
            style={{flex:1,padding:"12px",border:`1px solid ${C.grey}`,background:C.white,fontSize:13,fontWeight:600,cursor:"pointer",borderRadius:6,color:C.greyDk}}>
            Anuluj
          </button>
          <button onClick={confirmDelete}
            style={{flex:1,padding:"12px",border:"none",background:C.red,fontSize:13,fontWeight:700,cursor:"pointer",borderRadius:6,color:C.white}}>
            Usuń
          </button>
        </div>
      </div>
    </div>
  );

  /* ════ WIDOK LISTY QUIZÓW ════ */
  if (!selQuiz) return (
    <div style={{padding:12,display:"flex",flexDirection:"column",gap:10}}>
      {deleteModal}
      {err && <div style={{background:"#FDEDEC",border:`1px solid ${C.red}`,padding:"10px 14px",fontSize:13,color:C.red,borderRadius:4}}>{err}</div>}

      <button onClick={() => { setShowQuizForm(p => !p); setErr(""); }}
        style={{background:C.green,border:"none",color:C.white,padding:"11px",fontSize:13,fontWeight:700,cursor:"pointer",borderRadius:6}}>
        {showQuizForm ? "Anuluj" : "+ Nowy quiz"}
      </button>

      {showQuizForm && (
        <div style={{background:C.white,padding:16,borderRadius:8,boxShadow:"0 2px 8px rgba(0,0,0,.1)"}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:12}}>Nowy quiz</div>
          <div style={{display:"flex",gap:0,marginBottom:12,border:`1px solid ${C.grey}`,borderRadius:6,overflow:"hidden"}}>
            {[["training","Ze szkolenia"],["custom","Własna nazwa"]].map(([mode,label]) => (
              <button key={mode} onClick={() => setQzMode(mode)}
                style={{flex:1,padding:"9px 4px",border:"none",cursor:"pointer",fontSize:12,fontWeight:700,
                  background:qzMode===mode?C.black:C.white, color:qzMode===mode?C.white:C.greyMid}}>
                {label}
              </button>
            ))}
          </div>
          {qzMode === "training" ? (
            <select value={qzTraining} onChange={e => setQzTraining(e.target.value)} style={inpStyle}>
              {TRAININGS.map(t => (
                <option key={t.id} value={t.id}>{t.id} — {t.short}: {t.title.slice(0,50)}{t.title.length>50?"…":""}</option>
              ))}
            </select>
          ) : (
            <input value={qzCustom} onChange={e => setQzCustom(e.target.value)}
              placeholder="Nazwa quizu (np. Bezpieczeństwo pracy)" style={inpStyle}/>
          )}
          {err && <div style={{color:C.red,fontSize:12,marginBottom:8}}>{err}</div>}
          <button onClick={createQuiz} disabled={saving}
            style={{width:"100%",background:C.black,border:"none",color:C.white,padding:11,fontSize:13,fontWeight:700,cursor:"pointer",borderRadius:4}}>
            {saving ? "Tworzę..." : "Utwórz quiz i dodaj pytania →"}
          </button>
        </div>
      )}

      {loading && <div style={{textAlign:"center",padding:32}}><Spinner/></div>}
      {!loading && !quizzes.length && (
        <div style={{textAlign:"center",color:C.greyMid,padding:32,fontSize:13}}>Brak quizów. Utwórz pierwszy.</div>
      )}
      <div style={{fontSize:11,color:C.greyMid,textAlign:"center",padding:"4px 0"}}>Przytrzymaj quiz aby usunąć</div>

      {quizzes.map(qz => (
        <div key={qz.id}
          onMouseDown={() => startHold(() => setDeleteConfirm({ type:"quiz", item:qz }))}
          onMouseUp={cancelHold} onMouseLeave={cancelHold}
          onTouchStart={() => startHold(() => setDeleteConfirm({ type:"quiz", item:qz }))}
          onTouchEnd={cancelHold} onTouchCancel={cancelHold}
          style={{background:deleting===qz.id?"#FDEDEC":C.white,borderRadius:8,padding:"12px 14px",boxShadow:"0 1px 3px rgba(0,0,0,.06)",display:"flex",alignItems:"center",gap:10,userSelect:"none",cursor:"pointer",transition:"background .15s"}}
        >
          <div style={{flex:1,minWidth:0}} onClick={() => openQuiz(qz)}>
            <div style={{fontSize:13,fontWeight:700,color:C.black,marginBottom:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
              {qz.title}
            </div>
            <div style={{fontSize:11,color:C.greyMid}}>
              {qz.training_id && <span style={{marginRight:8,color:C.green,fontWeight:600}}>{qz.training_id}</span>}
              {qz.questionCount} {qz.questionCount===1?"pytanie":qz.questionCount>=2&&qz.questionCount<=4?"pytania":"pytań"}
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  /* ════ WIDOK PYTAŃ ════ */
  return (
    <div style={{padding:12,display:"flex",flexDirection:"column",gap:10}}>
      {deleteModal}
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <button onClick={backToList}
          style={{background:"none",border:`1px solid ${C.grey}`,padding:"6px 10px",fontSize:12,cursor:"pointer",borderRadius:4,flexShrink:0}}>
          ← Lista
        </button>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:14,fontWeight:700,color:C.black,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{selQuiz.title}</div>
          {selQuiz.training_id && <div style={{fontSize:11,color:C.green,fontWeight:600}}>{selQuiz.training_id}</div>}
        </div>
      </div>

      {err && <div style={{background:"#FDEDEC",border:`1px solid ${C.red}`,padding:"10px 14px",fontSize:13,color:C.red,borderRadius:4}}>{err}</div>}

      <button onClick={openNewQ}
        style={{background:C.green,border:"none",color:C.white,padding:"11px",fontSize:13,fontWeight:700,cursor:"pointer",borderRadius:6}}>
        + Dodaj pytanie
      </button>

      {showQForm && (
        <div style={{background:C.white,padding:16,borderRadius:8,boxShadow:"0 2px 8px rgba(0,0,0,.1)"}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:12}}>{editingQ?"Edytuj pytanie":"Nowe pytanie"}</div>
          <textarea value={fQ} onChange={e => setFQ(e.target.value)} placeholder="Treść pytania" rows={3}
            style={{...inpStyle,resize:"vertical",fontFamily:"inherit"}}/>
          {["a","b","c"].map(k => (
            <div key={k} style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
              <button onClick={() => setFAns(k)} style={{
                width:28,height:28,borderRadius:"50%",border:"none",flexShrink:0,cursor:"pointer",fontWeight:700,fontSize:12,
                background:fAns===k?C.green:"#eee", color:fAns===k?C.white:C.greyMid,
              }}>{k.toUpperCase()}</button>
              <input value={k==="a"?fA:k==="b"?fB:fC}
                onChange={e=>(k==="a"?setFA:k==="b"?setFB:setFC)(e.target.value)}
                placeholder={`Odpowiedź ${k.toUpperCase()}`}
                style={{...inpStyle,marginBottom:0,flex:1,border:`1px solid ${fAns===k?C.green:C.grey}`}}/>
            </div>
          ))}
          <div style={{fontSize:11,color:C.greyMid,marginBottom:8}}>Kliknij literę aby zaznaczyć poprawną odpowiedź</div>
          {err && <div style={{color:C.red,fontSize:12,marginBottom:8}}>{err}</div>}
          <div style={{display:"flex",gap:8}}>
            <button onClick={saveQ} disabled={saving}
              style={{flex:1,background:C.black,border:"none",color:C.white,padding:11,fontSize:13,fontWeight:700,cursor:"pointer",borderRadius:4}}>
              {saving?"Zapisuję...":"Zapisz"}
            </button>
            <button onClick={() => setShowQForm(false)}
              style={{flex:1,background:"none",border:`1px solid ${C.grey}`,color:C.greyDk,padding:11,fontSize:13,cursor:"pointer",borderRadius:4}}>
              Anuluj
            </button>
          </div>
        </div>
      )}

      {loading && <div style={{textAlign:"center",padding:24}}><Spinner/></div>}
      {!loading && !questions.length && !showQForm && (
        <div style={{textAlign:"center",color:C.greyMid,padding:32,fontSize:13}}>Brak pytań. Dodaj pierwsze pytanie.</div>
      )}
      {!loading && questions.length > 0 && (
        <div style={{fontSize:11,color:C.greyMid,textAlign:"center",padding:"4px 0"}}>Przytrzymaj pytanie aby usunąć</div>
      )}

      {questions.map((q, i) => (
        <div key={q.id}
          onMouseDown={() => startHold(() => setDeleteConfirm({ type:"question", item:q }))}
          onMouseUp={cancelHold} onMouseLeave={cancelHold}
          onTouchStart={() => startHold(() => setDeleteConfirm({ type:"question", item:q }))}
          onTouchEnd={cancelHold} onTouchCancel={cancelHold}
          style={{background:deleting===q.id?"#FDEDEC":C.white,borderRadius:8,padding:"12px 14px",boxShadow:"0 1px 3px rgba(0,0,0,.06)",userSelect:"none",transition:"background .15s"}}
        >
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8,marginBottom:6}}>
            <div style={{fontSize:13,fontWeight:600,color:C.black,lineHeight:1.4,flex:1}}>{i+1}. {q.question}</div>
            <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
              {usedIds.has(q.id) && (
                <span title="Pytanie było już użyte jako tip dnia" style={{fontSize:14,lineHeight:1}}>✔️</span>
              )}
              <button onClick={() => openEditQ(q)} style={{background:"none",border:`1px solid ${C.grey}`,padding:"3px 8px",fontSize:11,cursor:"pointer",borderRadius:3}}>✏️</button>
            </div>
          </div>
          {["a","b","c"].map(k => (
            <div key={k} style={{
              fontSize:12,padding:"4px 8px",marginBottom:3,borderRadius:4,
              background:k===q.correct?"#F0F7E0":C.greyBg,
              color:k===q.correct?C.greenDk:C.greyDk,
              fontWeight:k===q.correct?700:400,
              border:k===q.correct?`1px solid ${C.green}`:"none",
            }}>
              {k.toUpperCase()}. {q[`answer_${k}`]} {k===q.correct&&"✓"}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}