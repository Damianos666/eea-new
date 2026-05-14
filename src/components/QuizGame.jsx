import { useState, useEffect, useRef, useCallback } from "react";
import { C } from "../lib/constants";
import { db } from "../lib/supabase";

/* ─── Stałe ─────────────────────────────────────────────────────────────── */
const LEVELS = [
  { id: "amator",  label: "Amator",  time: 15, base: 100, color: "#8AB73E" },
  { id: "pro",     label: "PRO",     time: 10, base: 150, color: "#E67E22" },
  { id: "ekspert", label: "EKSPERT", time: 5,  base: 200, color: "#C0392B" },
];

/* ─── Odliczanie 3-2-1 ───────────────────────────────────────────────────── */
function Countdown({ from = 3, onDone }) {
  const [n, setN] = useState(from);
  useEffect(() => {
    if (n <= 0) { onDone(); return; }
    const t = setTimeout(() => setN(p => p - 1), 1000);
    return () => clearTimeout(t);
  }, [n, onDone]);
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",flex:1,gap:8}}>
      <div key={n} style={{
        fontSize:96,fontWeight:900,color:C.green,lineHeight:1,
        animation:"popIn .35s cubic-bezier(.175,.885,.32,1.275)",
      }}>{n || "GO!"}</div>
      <style>{`@keyframes popIn{from{transform:scale(0.4);opacity:0}to{transform:scale(1);opacity:1}}`}</style>
    </div>
  );
}

/* ─── Pasek timera ───────────────────────────────────────────────────────── */
function TimerBar({ maxTime, onTimeUp, running }) {
  const [left, setLeft] = useState(maxTime);
  const ref = useRef(null);

  useEffect(() => {
    setLeft(maxTime);
  }, [maxTime]);

  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => {
      setLeft(p => {
        if (p <= 0.1) { clearInterval(interval); onTimeUp(); return 0; }
        return Math.max(0, p - 0.1);
      });
    }, 100);
    return () => clearInterval(interval);
  }, [running, onTimeUp]);

  const pct = (left / maxTime) * 100;
  const color = pct > 50 ? C.green : pct > 25 ? "#E67E22" : C.red;

  return (
    <div style={{margin:"0 0 10px"}}>
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:3}}>
        <span style={{fontSize:12,fontWeight:700,color}}>{left.toFixed(1)}s</span>
      </div>
      <div style={{height:5,background:"rgba(255,255,255,.15)",borderRadius:3,overflow:"hidden"}}>
        <div ref={ref} style={{height:"100%",background:color,width:`${pct}%`,transition:"width .1s linear",borderRadius:3}}/>
      </div>
    </div>
  );
}

/* ─── Główny komponent quizu ─────────────────────────────────────────────── */
export function QuizGame({ token, user, mode = "training", onComplete, onClose }) {
  // fazy: category | difficulty | countdown | question | answer | between | result
  const [phase,      setPhase]      = useState("category");
  const [quizzes,    setQuizzes]    = useState([]);
  const [questions,  setQuestions]  = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState("");

  const [selQuiz,     setSelQuiz]     = useState(null);
  const [level,       setLevel]       = useState(null);
  const [qIdx,        setQIdx]        = useState(0);
  const [score,       setScore]       = useState(0);
  const [chosen,      setChosen]      = useState(null);   // 'a'|'b'|'c'
  const [wasCorrect,  setWasCorrect]  = useState(null);
  const [timerKey,    setTimerKey]    = useState(0);      // reset timera
  const [timerRunning,setTimerRunning]= useState(false);
  const timeLeftRef   = useRef(0);
  const [countdownFor,setCountdownFor]= useState("question"); // "question"|"between"

  /* ── Załaduj quizy z ≥1 pytaniem, filtruj wg trybu ── */
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const allQuizzes = await db.get(token, "quizzes", "order=created_at.asc&select=*");
        const counts     = await db.get(token, "quiz_questions", "select=quiz_id");
        const countMap   = {};
        counts.forEach(q => { countMap[q.quiz_id] = (countMap[q.quiz_id] || 0) + 1; });
        const withCounts = allQuizzes
          .filter(qz => (countMap[qz.id] || 0) > 0)
          .map(qz => ({ ...qz, questionCount: countMap[qz.id] }));
        // "training" = quizy ze szkoleniami (training_id != null)
        // "custom"   = quizy własne (training_id == null)
        const filtered = mode === "training"
          ? withCounts.filter(qz => qz.training_id)
          : withCounts.filter(qz => !qz.training_id);
        setQuizzes(filtered);
      } catch(e) { setError("Błąd ładowania: " + e.message); }
      finally { setLoading(false); }
    }
    load();
  }, [token, mode]);

  /* ── Załaduj pytania po wyborze quizu i poziomu ── */
  async function startQuiz() {
    setLoading(true);
    try {
      const data = await db.get(token, "quiz_questions", `quiz_id=eq.${selQuiz.id}&order=created_at.asc&select=*`);
      if (!data.length) { setError("Brak pytań w tym quizie."); setLoading(false); return; }
      const shuffled = [...data].sort(() => Math.random() - 0.5).slice(0, 8);
      setQuestions(shuffled);
      setQIdx(0);
      setScore(0);
      setPhase("countdown");
      setCountdownFor("question");
    } catch(e) { setError("Błąd ładowania pytań: " + e.message); }
    finally { setLoading(false); }
  }

  const currentQ = questions[qIdx];

  /* ── Użytkownik wybrał odpowiedź ── */
  function handleAnswer(ans) {
    if (chosen) return; // już odpowiedział
    setTimerRunning(false);
    setChosen(ans);
    const correct = ans === currentQ.correct;
    setWasCorrect(correct);
    if (correct) {
      const gained = Math.round(level.base * (timeLeftRef.current / level.time));
      setScore(p => p + Math.max(gained, 1));
      if (navigator.vibrate) navigator.vibrate([40, 30, 80]);
    } else {
      if (navigator.vibrate) navigator.vibrate(200);
    }
    setPhase("answer");
  }

  /* ── Czas minął bez odpowiedzi ── */
  const handleTimeUp = useCallback(() => {
    if (chosen) return;
    setTimerRunning(false);
    setChosen("__timeout__");
    setWasCorrect(false);
    setPhase("answer");
  }, [chosen]);

  /* ── Następne pytanie / zakończ ── */
  function goNext() {
    if (qIdx + 1 >= questions.length) {
      finishQuiz();
    } else {
      setChosen(null);
      setWasCorrect(null);
      setQIdx(p => p + 1);
      setPhase("countdown");
      setCountdownFor("question");
      setTimerKey(p => p + 1);
    }
  }

  async function finishQuiz() {
    setPhase("result");
    const quizTitle = selQuiz?.title || "Quiz";
    const entry = {
      training: {
        id:        `QUIZ_${selQuiz?.id || "unknown"}`,
        title:     quizTitle,
        category:  "quiz",
        duration:  `${questions.length} pytań`,
        level:     1,
        group:     "tech",
        short:     "QUIZ",
        quizScore: score,
      },
      date:       new Date().toISOString().slice(0,10),
      key:        `QUIZ_${Date.now()}`,
      trainer:    null,
      trainerNum: null,
    };
    onComplete(entry);
  }

  /* ── Gdy odliczanie się skończy ── */
  function onCountdownDone() {
    if (countdownFor === "question") {
      setTimerRunning(true);
      setPhase("question");
    } else {
      goNext();
    }
  }

  /* ── Śledź pozostały czas dla punktacji ── */
  useEffect(() => {
    if (!timerRunning || !level) return;
    timeLeftRef.current = level.time;
    const iv = setInterval(() => {
      timeLeftRef.current = Math.max(0, timeLeftRef.current - 0.1);
    }, 100);
    return () => clearInterval(iv);
  }, [timerRunning, level, timerKey]);

  /* ── UI helpers ── */
  const answerLabels = { a: "A", b: "B", c: "C" };
  const answerKeys   = ["a","b","c"];

  function answerBtnStyle(key) {
    const base = {
      width:"100%", padding:"11px 14px", fontSize:14, fontWeight:600,
      border:"none", borderRadius:10, cursor:"pointer", textAlign:"left",
      display:"flex", alignItems:"center", gap:12, transition:"all .15s",
    };
    if (!chosen) return { ...base, background:C.white, color:C.black, boxShadow:"0 1px 3px rgba(0,0,0,.08)" };
    if (key === currentQ.correct) return { ...base, background:"#F0F7E0", color:"#6E9430", boxShadow:"0 0 0 2px #8AB73E" };
    if (key === chosen) return { ...base, background:"#FDEDEC", color:C.red, boxShadow:`0 0 0 2px ${C.red}` };
    return { ...base, background:"#f5f5f5", color:C.greyMid };
  }

  function letterBadge(key) {
    const colors = { a:"#2980B9", b:"#8E44AD", c:"#E67E22" };
    let bg = colors[key], color = "#fff";
    if (chosen) {
      if (key === currentQ.correct) { bg = "#8AB73E"; }
      else if (key === chosen) { bg = "#C0392B"; }
      else { bg = "#ddd"; color = "#999"; }
    }
    return (
      <span style={{width:26,height:26,borderRadius:"50%",background:bg,color,fontSize:12,fontWeight:800,display:"inline-flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
        {key.toUpperCase()}
      </span>
    );
  }

  /* ════════════════════════ RENDER ════════════════════════ */

  const wrap = (children) => (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.75)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:12,fontFamily:"'Helvetica Neue',Helvetica,Arial,sans-serif"}}
      onClick={onClose}>
      <div style={{background:"#EFEFEF",width:"100%",maxWidth:390,maxHeight:"92dvh",borderRadius:18,boxShadow:"0 32px 80px rgba(0,0,0,.5)",display:"flex",flexDirection:"column",overflow:"hidden"}}
        onClick={e=>e.stopPropagation()}>
        <div style={{background:"#2C2C2C",padding:"13px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
          <span style={{color:C.white,fontWeight:700,fontSize:15}}>🎯 Quiz</span>
          <button onClick={onClose} style={{background:"rgba(255,255,255,.12)",border:"none",color:"#ccc",fontSize:16,cursor:"pointer",lineHeight:1,width:28,height:28,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
        </div>
        <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",padding:14,gap:10}}>
          {children}
        </div>
      </div>
    </div>
  );

  /* Wybór quizu */
  if (phase === "category") return wrap(
    <>
      <div style={{background:C.black,borderRadius:12,padding:"14px 16px",marginBottom:2}}>
        <div style={{fontSize:16,fontWeight:800,color:C.white}}>
          {mode === "training" ? "📚 Quiz szkoleniowy" : "🎮 Gram"}
        </div>
        <div style={{fontSize:12,color:"rgba(255,255,255,.45)",marginTop:3}}>
          {mode === "training" ? "Wybierz szkolenie" : "Wybierz quiz dodatkowy"}
        </div>
      </div>
      {loading && <div style={{color:C.greyMid,fontSize:13,textAlign:"center",padding:20}}>Ładowanie...</div>}
      {error  && <div style={{color:C.red,fontSize:13}}>{error}</div>}
      {!loading && !quizzes.length && <div style={{color:C.greyMid,fontSize:13,textAlign:"center",padding:20}}>Brak dostępnych quizów.</div>}
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {quizzes.map(qz => (
          <button key={qz.id}
            onClick={() => { setSelQuiz(qz); setPhase("difficulty"); }}
            style={{padding:"12px 14px",background:C.white,border:"none",borderRadius:10,fontSize:14,fontWeight:600,color:C.black,cursor:"pointer",textAlign:"left",boxShadow:"0 1px 3px rgba(0,0,0,.08)",display:"flex",alignItems:"center",gap:12}}>
            <div style={{minWidth:42,height:36,borderRadius:8,background:"#F0F7E0",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,padding:"0 6px"}}>
              <span style={{fontSize:10,fontWeight:800,color:"#6E9430",textAlign:"center",lineHeight:1.2}}>{qz.training_id || "🎮"}</span>
            </div>
            <div style={{flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{qz.title}</div>
            <span style={{color:C.greyMid,fontSize:18,flexShrink:0}}>›</span>
          </button>
        ))}
      </div>
    </>
  );

  /* Wybór trudności */
  if (phase === "difficulty") return wrap(
    <>
      <div style={{background:C.black,borderRadius:12,padding:"14px 16px"}}>
        <div style={{fontSize:11,color:"rgba(255,255,255,.4)",fontWeight:600,marginBottom:4}}>WYBRANY QUIZ</div>
        <div style={{fontSize:14,fontWeight:700,color:C.white,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{selQuiz?.title}</div>
      </div>
      <div style={{fontSize:13,fontWeight:700,color:C.greyMid,padding:"4px 2px"}}>Wybierz poziom trudności</div>
      {LEVELS.map(lv => (
        <button key={lv.id} onClick={() => { setLevel(lv); startQuiz(); }}
          style={{padding:"14px 16px",background:C.white,border:"none",borderRadius:10,cursor:"pointer",textAlign:"left",boxShadow:"0 1px 3px rgba(0,0,0,.08)",display:"flex",alignItems:"center",gap:14}}>
          <div style={{width:10,height:10,borderRadius:"50%",background:lv.color,flexShrink:0}}/>
          <div style={{flex:1}}>
            <div style={{fontSize:15,fontWeight:700,color:lv.color}}>{lv.label}</div>
            <div style={{fontSize:12,color:C.greyMid,marginTop:2}}>{lv.time}s na odpowiedź · {lv.base} pkt bazowych</div>
          </div>
          <span style={{color:C.greyMid,fontSize:18}}>›</span>
        </button>
      ))}
      <button onClick={() => setPhase("category")} style={{background:"none",border:"none",color:C.greyMid,fontSize:13,cursor:"pointer",padding:"4px 0",textAlign:"left"}}>← Wróć</button>
    </>
  );

  /* Odliczanie */
  if (phase === "countdown") return wrap(
    <Countdown from={3} onDone={onCountdownDone}/>
  );

  /* Pytanie */
  if (phase === "question" && currentQ) return wrap(
    <>
      {/* Progres + poziom */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{display:"flex",gap:4}}>
          {questions.map((_,i) => (
            <div key={i} style={{width:i===qIdx?18:7,height:7,borderRadius:4,background:i<qIdx?"#8AB73E":i===qIdx?level.color:"#D5D8DC",transition:"all .2s"}}/>
          ))}
        </div>
        <span style={{fontSize:11,fontWeight:700,color:level.color,background:`${level.color}18`,padding:"2px 8px",borderRadius:4}}>
          {level.label}
        </span>
      </div>

      {/* Timer */}
      <TimerBar key={timerKey} maxTime={level.time} onTimeUp={handleTimeUp} running={timerRunning} color={level.color}/>

      {/* Pytanie — ciemna karta */}
      <div style={{background:C.black,padding:"18px 16px",borderRadius:12,boxShadow:"0 4px 16px rgba(0,0,0,.2)"}}>
        <div style={{fontSize:11,color:"rgba(255,255,255,.4)",fontWeight:600,marginBottom:8,letterSpacing:.5}}>
          PYTANIE {qIdx+1} / {questions.length}
        </div>
        <div style={{fontSize:15,fontWeight:700,color:C.white,lineHeight:1.5}}>
          {currentQ.question}
        </div>
      </div>

      {/* Odpowiedzi — kompaktowe */}
      <div style={{display:"flex",flexDirection:"column",gap:7}}>
        {answerKeys.map(k => (
          <button key={k} onClick={() => handleAnswer(k)} style={answerBtnStyle(k)}>
            {letterBadge(k)}
            <span style={{flex:1,lineHeight:1.4}}>{currentQ[`answer_${k}`]}</span>
          </button>
        ))}
      </div>
    </>
  );

  /* Wynik odpowiedzi */
  if (phase === "answer" && currentQ) return wrap(
    <>
      {/* Feedback banner */}
      <div style={{
        borderRadius:12, padding:"16px", textAlign:"center",
        background: wasCorrect ? "#2A3D12" : "#3D1212",
      }}>
        <div style={{fontSize:36,marginBottom:6}}>{wasCorrect ? "✅" : "❌"}</div>
        <div style={{fontSize:16,fontWeight:800,color: wasCorrect ? "#8AB73E" : "#C0392B"}}>
          {wasCorrect ? "Poprawna odpowiedź!" : chosen === "__timeout__" ? "Czas minął!" : "Błędna odpowiedź"}
        </div>
        {!wasCorrect && (
          <div style={{fontSize:12,color:"rgba(255,255,255,.6)",marginTop:6}}>
            Prawidłowa: <strong style={{color:"#8AB73E"}}>{answerLabels[currentQ.correct]}. {currentQ[`answer_${currentQ.correct}`]}</strong>
          </div>
        )}
      </div>

      {/* Odpowiedzi z oznaczeniem */}
      <div style={{display:"flex",flexDirection:"column",gap:7}}>
        {answerKeys.map(k => (
          <div key={k} style={answerBtnStyle(k)}>
            {letterBadge(k)}
            <span style={{flex:1,lineHeight:1.4,fontSize:14,fontWeight:600}}>{currentQ[`answer_${k}`]}</span>
          </div>
        ))}
      </div>

      {/* Wynik + przycisk */}
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <div style={{background:C.white,borderRadius:10,padding:"10px 16px",display:"flex",alignItems:"center",gap:8,boxShadow:"0 1px 3px rgba(0,0,0,.08)"}}>
          <span style={{fontSize:12,color:C.greyMid}}>Wynik</span>
          <span style={{fontSize:18,fontWeight:800,color:C.green}}>{score} pkt</span>
        </div>
        {qIdx + 1 < questions.length ? (
          <button onClick={() => { setPhase("countdown"); setCountdownFor("question"); setChosen(null); setWasCorrect(null); setQIdx(p=>p+1); setTimerKey(p=>p+1); }}
            style={{flex:1,padding:"14px",background:C.green,border:"none",borderRadius:10,color:C.white,fontSize:14,fontWeight:700,cursor:"pointer"}}>
            Dalej →
          </button>
        ) : (
          <button onClick={finishQuiz}
            style={{flex:1,padding:"14px",background:C.green,border:"none",borderRadius:10,color:C.white,fontSize:14,fontWeight:700,cursor:"pointer"}}>
            Wynik 🏆
          </button>
        )}
      </div>
    </>
  );

  /* Wynik końcowy */
  if (phase === "result") return wrap(
    <>
      <div style={{textAlign:"center",padding:"16px 0 8px"}}>
        <div style={{fontSize:48,marginBottom:8}}>🏆</div>
        <div style={{fontSize:20,fontWeight:700,color:C.black}}>Quiz zakończony!</div>
        <div style={{fontSize:13,color:C.greyMid,marginTop:4}}>{selQuiz?.title || "Quiz"}</div>
      </div>

      <div style={{background:C.white,borderRadius:8,padding:18,textAlign:"center",boxShadow:"0 1px 3px rgba(0,0,0,.07)"}}>
        <div style={{fontSize:13,color:C.greyMid,marginBottom:4}}>Łączny wynik</div>
        <div style={{fontSize:48,fontWeight:900,color:C.green,lineHeight:1}}>{score}</div>
        <div style={{fontSize:13,color:C.greyMid,marginTop:4}}>punktów</div>
      </div>

      <div style={{background:C.white,borderRadius:8,padding:"12px 18px",display:"flex",justifyContent:"space-between"}}>
        <span style={{fontSize:13,color:C.greyMid}}>Pytania</span>
        <span style={{fontSize:13,fontWeight:700}}>{questions.length}</span>
      </div>
      <div style={{background:C.white,borderRadius:8,padding:"12px 18px",display:"flex",justifyContent:"space-between"}}>
        <span style={{fontSize:13,color:C.greyMid}}>Poziom</span>
        <span style={{fontSize:13,fontWeight:700,color:level.color}}>{level.label}</span>
      </div>

      <div style={{fontSize:11,color:C.greyMid,textAlign:"center"}}>
        Wynik zapisany w historii szkoleń ✓
      </div>

      <button onClick={onClose}
        style={{padding:"14px",background:C.black,border:"none",borderRadius:8,color:C.white,fontSize:14,fontWeight:700,cursor:"pointer",width:"100%",marginTop:4}}>
        Zamknij
      </button>
    </>
  );

  return null;
}

/* ─── Modal wyniku quizu (do historii szkoleń) ───────────────────────────── */
export function QuizResultModal({ entry, onClose }) {
  const score  = entry?.training?.quizScore ?? 0;
  const title  = entry?.training?.title || "Quiz";
  const nQ     = entry?.training?.duration?.replace(" pytań","") || "8";
  const date   = entry?.date || "";

  const wrap = (children) => (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.75)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:12,fontFamily:"'Helvetica Neue',Helvetica,Arial,sans-serif"}}
      onClick={onClose}>
      <div style={{background:"#EFEFEF",width:"100%",maxWidth:360,borderRadius:18,boxShadow:"0 32px 80px rgba(0,0,0,.5)",overflow:"hidden"}}
        onClick={e=>e.stopPropagation()}>
        <div style={{background:"#2C2C2C",padding:"13px 16px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <span style={{color:"#fff",fontWeight:700,fontSize:15}}>🏆 Wynik quizu</span>
          <button onClick={onClose} style={{background:"rgba(255,255,255,.12)",border:"none",color:"#ccc",fontSize:16,cursor:"pointer",width:28,height:28,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
        </div>
        <div style={{padding:16,display:"flex",flexDirection:"column",gap:10}}>
          {children}
        </div>
      </div>
    </div>
  );

  return wrap(
    <>
      <div style={{textAlign:"center",padding:"12px 0 4px"}}>
        <div style={{fontSize:52,marginBottom:6}}>🏆</div>
        <div style={{fontSize:20,fontWeight:800,color:"#1A1A1A"}}>Gratulacje!</div>
        <div style={{fontSize:13,color:"#A0A0A0",marginTop:4,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{title}</div>
        {date && <div style={{fontSize:11,color:"#A0A0A0",marginTop:2}}>{date}</div>}
      </div>

      <div style={{background:"#2C2C2C",borderRadius:12,padding:"20px",textAlign:"center"}}>
        <div style={{fontSize:11,color:"rgba(255,255,255,.4)",fontWeight:600,letterSpacing:.5,marginBottom:6}}>ŁĄCZNY WYNIK</div>
        <div style={{fontSize:56,fontWeight:900,color:"#8AB73E",lineHeight:1}}>{score}</div>
        <div style={{fontSize:13,color:"rgba(255,255,255,.4)",marginTop:4}}>punktów · {nQ} pytań</div>
      </div>

      <button onClick={onClose}
        style={{padding:"14px",background:"#1A1A1A",border:"none",borderRadius:10,color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",width:"100%"}}>
        Zamknij
      </button>
    </>
  );
}