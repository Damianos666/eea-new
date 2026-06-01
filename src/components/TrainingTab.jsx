import { useState, useMemo } from "react";
import { C, LVL_COLOR, GROUPS } from "../lib/constants";
import { useTrainings } from "../lib/useTrainings";
import { calcProgress } from "../lib/helpers";
import { edge } from "../lib/supabase";
import { Spinner, SecTitle, ClipboardSvg } from "./SharedUI";
import { CelebModal, CertModal } from "./Modals";
import { useT } from "../lib/LangContext";
import { QuizGame, QuizResultModal } from "./QuizGame";
import { GramTab } from "./GramTab";
import { useUser } from "../lib/UserContext";
import { QRScannerTab } from "./QRScannerTab";

// Czy urządzenie obsługuje kamerę (pokaż przycisk skanera)
const hasCamera = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

function formatDays(n, T) {
  const d = parseInt(n, 10);
  if (!d || d < 1) return "-";
  return d === 1 ? `1 ${T.day_unit}` : `${d} ${T.days_unit}`;
}

export function TrainingTab({ completed, onComplete, activeGroups, loading }) {
  const trainings = useTrainings();
  const { user } = useUser();
  const T = useT();
  const [code,        setCode]        = useState("");
  const [status,      setStatus]      = useState(null);
  const [verifying,   setVerifying]   = useState(false);
  const [celebEntry,  setCelebEntry]  = useState(null);
  const [certEntry,   setCertEntry]   = useState(null);
  const [showQuiz,    setShowQuiz]    = useState(false);
  const [quizMode,    setQuizMode]    = useState("training");
  const [quizResult,  setQuizResult]  = useState(null);
  const [showScanner, setShowScanner] = useState(false);

  const progress = calcProgress(completed, activeGroups);

  const uniqueCompleted = useMemo(
    () => Object.values(
      completed.reduce((acc, c) => { acc[c.training.id] = c; return acc; }, {})
    ),
    [completed]
  );

  function handleSuccess(result, rawCode) {
    const training = result.training.isSpecial
      ? { ...result.training, category: "specjalne", group: "tech", level: 1 }
      : (trainings.find(t => t.id === result.training.id) || result.training);
    const entry = {
      training,
      date:        result.date,
      key:         rawCode,
      trainer:     result.trainer,
      trainerNum:  result.trainerNum,
      savedByEdge: true,
    };
    onComplete(entry);
    setCelebEntry(entry);
    if (navigator.vibrate) navigator.vibrate([60, 80, 120, 60, 200]);
    setCode(""); setStatus(null);
  }

  async function verify() {
    if (code.trim().toLowerCase() === "sprawdzam") {
      setCode(""); setStatus(null);
      setQuizMode("training"); setShowQuiz(true);
      return;
    }

    const raw = code.trim().toUpperCase().replace(/-/g, "");
    if (raw.length < 8) { setStatus("invalid"); return; }

    // Wszystkie kody (w tym ST) weryfikowane bezpośrednio przez edge.
    // Dla ST edge odczytuje tytuł i dni z tabeli special_training_meta
    // zapisanej podczas generowania kodu przez trenera.
    setVerifying(true); setStatus(null);
    try {
      const result = await edge.verifyCode(user.accessToken, raw);
      handleSuccess(result, raw);
    } catch (e) {
      setStatus("invalid");
    } finally {
      setVerifying(false);
    }
  }

  const codeInput = (
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      <div style={{display:"flex",gap:8}}>
        <input
          style={{flex:1,border:`1.5px solid ${status==="invalid"||status==="already"?C.red:C.grey}`,padding:"11px 14px",fontSize:14,fontFamily:"monospace",fontWeight:700,letterSpacing:1,color:C.black,outline:"none"}}
          value={code}
          onChange={e => { setCode(e.target.value.toUpperCase()); setStatus(null); }}
          placeholder="np. PIM-2103-K7MN-4"
          maxLength={28}
          onKeyDown={e => e.key==="Enter" && !verifying && verify()}
        />
        <button
          style={{background:verifying?C.greyDk:C.black,border:"none",color:C.white,padding:"11px 16px",fontSize:12,fontWeight:700,cursor:verifying?"not-allowed":"pointer",minWidth:80}}
          onClick={verify} disabled={verifying}>
          {verifying ? "..." : T.check}
        </button>
      </div>
      {hasCamera && (
        <button
          onClick={() => setShowScanner(true)}
          style={{width:"100%",background:C.white,border:`1.5px solid ${C.green}`,color:C.greenDk,padding:"10px 0",fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
          <span style={{fontSize:16}}>📷</span> Skanuj kod QR
        </button>
      )}
    </div>
  );

  if (loading) return <div style={{background:C.greyBg,flex:1,display:"flex",alignItems:"center",justifyContent:"center"}}><Spinner/></div>;

  if (showScanner) return (
    <QRScannerTab
      token={user.accessToken}
      onComplete={result => {
        handleSuccess(result, result.key || "");
      }}
      onClose={() => setShowScanner(false)}
    />
  );

  if (completed.length === 0) return (
    <div style={{background:C.greyBg,flex:1,minHeight:0,overflowY:"auto",WebkitOverflowScrolling:"touch",paddingBottom:"calc(72px + env(safe-area-inset-bottom, 0px))"}}>
      {showQuiz && quizMode === "custom"  && <GramTab onClose={() => setShowQuiz(false)}/>}
      {showQuiz && quizMode === "training" && <QuizGame token={user.accessToken} user={user} mode="training" onComplete={entry => { onComplete(entry); }} onClose={() => setShowQuiz(false)}/>}
      {celebEntry && <CelebModal entry={celebEntry} onClose={() => setCelebEntry(null)}/>}
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"100%",padding:"32px 24px 48px",textAlign:"center"}}>
        <ClipboardSvg/>
        <div style={{fontSize:18,fontWeight:600,color:C.black,marginTop:20,marginBottom:24}}>{T.enter_code}</div>
        <div style={{width:"100%",maxWidth:340}}>{codeInput}
          {status==="invalid" && <div style={{color:C.red,fontSize:13,marginTop:10}}>{T.invalid_code}</div>}
          {status==="already" && <div style={{color:C.amber,fontSize:13,marginTop:10}}>{T.already_done}</div>}
        </div>
        {!activeGroups.length && <div style={{marginTop:24,background:"#FEF3E2",border:`1px solid ${C.amber}`,padding:"12px 16px",maxWidth:340,textAlign:"left",fontSize:12,color:C.greyDk,lineHeight:1.6}}>{T.enable_groups_msg} <strong>{T.tab_profile}</strong>.</div>}
      </div>
    </div>
  );

  return (
    <div style={{background:C.greyBg,flex:1,minHeight:0,overflowY:"auto",WebkitOverflowScrolling:"touch",paddingBottom:"calc(72px + env(safe-area-inset-bottom, 0px))"}}>
      {showQuiz && quizMode === "custom"  && <GramTab onClose={() => setShowQuiz(false)}/>}
      {showQuiz && quizMode === "training" && <QuizGame token={user.accessToken} user={user} mode="training" onComplete={entry => { onComplete(entry); setShowQuiz(false); }} onClose={() => setShowQuiz(false)}/>}
      {celebEntry && <CelebModal entry={celebEntry} onClose={() => setCelebEntry(null)}/>}
      {certEntry   && <CertModal       entry={certEntry}  user={user} onClose={() => setCertEntry(null)}/>}
      {quizResult  && <QuizResultModal entry={quizResult} onClose={() => setQuizResult(null)}/>}
      <div style={{background:C.white,margin:12,padding:18,boxShadow:"0 1px 3px rgba(0,0,0,.07)"}}>
        <div style={{fontSize:11,fontWeight:700,letterSpacing:1,color:C.greyDk,marginBottom:14,textTransform:"uppercase"}}>{T.enter_code}</div>
        {codeInput}
        {status==="invalid" && <div style={{color:C.red,fontSize:12,marginTop:8}}>{T.invalid_code}</div>}
        {status==="already" && <div style={{color:C.amber,fontSize:12,marginTop:8}}>{T.already_done}</div>}
      </div>
      {progress.active ? (
        <div style={{background:C.white,margin:"0 12px 12px",padding:18,boxShadow:"0 1px 3px rgba(0,0,0,.07)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:1,color:C.greyDk,textTransform:"uppercase"}}>{T.training_progress}</div>
            <div style={{fontSize:22,fontWeight:700,color:C.green}}>{progress.pct}%</div>
          </div>
          <div style={{height:6,background:C.grey}}><div style={{height:"100%",background:C.green,width:`${progress.pct}%`,transition:"width .5s",maxWidth:"100%"}}/></div>
          <div style={{display:"flex",justifyContent:"space-between",marginTop:6}}>
            <span style={{fontSize:12,color:C.black}}>{progress.done} / {progress.total} {T.completed_of}</span>
            <span style={{fontSize:12,color:C.greyMid}}>{progress.total-progress.done} {T.remaining}</span>
          </div>
          <div style={{marginTop:12,display:"flex",gap:6,flexWrap:"wrap"}}>
            {GROUPS.filter(g => activeGroups.includes(g.id)).map(g => {
              const gT = trainings.filter(t => t.group===g.id);
              const doneIds = new Set(completed.map(c => c.training.id));
              const gD = gT.filter(t => doneIds.has(t.id)).length;
              return <div key={g.id} style={{background:C.greyBg,border:`1px solid ${C.grey}`,padding:"5px 10px",fontSize:11}}><span style={{color:g.color,fontWeight:700}}>●</span> {g.label}: <strong>{gD}/{gT.length}</strong></div>;
            })}
          </div>
        </div>
      ) : (
        <div style={{background:"#FEF3E2",border:`1px solid ${C.amber}`,margin:"0 12px 12px",padding:"12px 16px",fontSize:12,color:C.greyDk}}>{T.enable_groups_msg} <strong>{T.tab_profile}</strong>.</div>
      )}
      <div style={{background:C.white,margin:"0 12px 12px",boxShadow:"0 1px 3px rgba(0,0,0,.07)"}}>
        <SecTitle>{T.completed_trainings}</SecTitle>
        {uniqueCompleted.map((c,i) => (
            <div key={i} style={{display:"flex",alignItems:"center",gap:14,padding:"13px 18px",borderTop:i>0?`1px solid ${C.grey}`:"none"}}>
              <div style={{width:4,alignSelf:"stretch",background:LVL_COLOR[c.training.level],borderRadius:2,flexShrink:0}}/>
              <div style={{flex:1}}>
                <div style={{fontSize:14,fontWeight:600,color:C.black}}>{c.training.title}</div>
                <div style={{fontSize:12,color:C.greyMid,marginTop:2}}>{c.training.category} · {c.training.duration} · {c.date}</div>
              </div>
              {c.training.category !== "quiz" && <button style={{background:"none",border:`1px solid ${C.grey}`,color:C.greyDk,padding:"7px 12px",fontSize:11,fontWeight:600,cursor:"pointer",whiteSpace:"nowrap"}} onClick={() => setCertEntry(c)}>{T.certificate}</button>}
              {c.training.category === "quiz" && <button style={{background:"#F0F7E0",border:"none",color:"#6E9430",padding:"7px 12px",fontSize:11,fontWeight:700,cursor:"pointer",whiteSpace:"nowrap",borderRadius:4}} onClick={() => setQuizResult(c)}>🏆 Wynik</button>}
            </div>
          ))}
      </div>
    </div>
  );
}
