import { useState, useEffect, memo } from "react";
import { C, MSG_TYPES, DEV_PANEL_ENABLED } from "../lib/constants";
import { db, rpc } from "../lib/supabase";
import { formatDate } from "../lib/helpers";
import { Spinner, Toggle } from "./SharedUI";
import { useT } from "../lib/LangContext";
import { useUser } from "../lib/UserContext";
import { getDailyTipFromCycle, getDailyTipQuestion, TIP_POINTS, isQuizDay, getWeekKey, getWeekQuestions, getProgramInfo } from "../lib/gamification";
import { WeeklyQuiz } from "./GramTab";
import { QuizRewardModal } from "./QuizRewardModal";
import { TipRewardModal } from "./TipRewardModal";

const CONTACT_EMAIL = import.meta.env.VITE_CONTACT_EMAIL || "";
const CONTACT_PHONE = import.meta.env.VITE_CONTACT_PHONE || "";

const toISO = (d = new Date()) => d.toISOString().slice(0, 10);

/* ─── TipBanner — Tip dnia na górze zakładki Wiadomości ─────────────────── */
function TipBanner({ token, userId, onConfirmed, devDateStr = null, onDevSeen, currentDate }) {
  const T = useT();
  const [tipQ,       setTipQ]       = useState(null);
  const [confirmed,  setConfirmed]  = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [loading,    setLoading]    = useState(true);
  const [tipModal,   setTipModal]   = useState(null); // { totalPoints, streak }

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const today = devDateStr || toISO();
        const [standaloneQuizzes, tipConfs] = await Promise.all([
          db.get(token, "quizzes", "training_id=is.null&select=id").catch(() => []),
          db.get(token, "tip_confirmations", `user_id=eq.${userId}&tip_date=eq.${today}&select=id`).catch(() => []),
        ]);
        let questions = [];
        if (standaloneQuizzes.length > 0) {
          const ids = standaloneQuizzes.map(q => q.id).join(",");
          questions = await db.get(token, "quiz_questions", `quiz_id=in.(${ids})&order=created_at.asc&select=*`).catch(() => []);
        }
        // Pobierz program_start_date żeby wybrać właściwe pytanie cyklu
        const gameRows = await db.get(token, "user_gamification", `user_id=eq.${userId}&select=program_start_date`).catch(() => []);
        const programStartDate = gameRows[0]?.program_start_date || null;
        // getDailyTipFromCycle → spójne z pytaniami quizu tygodniowego.
        // Na D1 (brak program_start_date) używamy today jako tymczasowego startu —
        // dayInCycle=0 → zawsze getWeekQuestions[0], spójne z quizem D7.
        const q = getDailyTipFromCycle(questions, programStartDate || today, devDateStr);
        setTipQ(q);
        // W trybie dev zawsze startuj jako niepotwierdzone — ignoruj bazę
        setConfirmed(devDateStr ? false : tipConfs.length > 0);
      } catch {}
      finally { setLoading(false); }
    }
    load();
  }, [token, userId, devDateStr, currentDate]);

  async function handleConfirm() {
    if (confirming || confirmed || !tipQ) return;
    setConfirming(true);
    const today = toISO(); // zawsze realna data — SQL nie przyjmuje dat przyszłych
    try {
      // Dev mode: zapisujemy normalnie do bazy — można testować punkty
      const res = await rpc.saveResult(token, {
        p_action:      "tip",
        p_today:       today,
        p_question_id: tipQ.id,
      });
      if (onConfirmed) onConfirmed();
      setTipModal({ totalPoints: res.total_points, streak: res.streak });
      setConfirmed(true);
    } catch (e) {
      alert(T.save_error + e.message);
    } finally {
      setConfirming(false);
    }
  }

  // Brak pytań lub brak tipu na dziś — nie pokazuj banera
  if (loading || !tipQ) return null;

  // Modal po potwierdzeniu tipa (pokazuje się przed badge)
  if (tipModal) return (
    <TipRewardModal
      totalPoints={tipModal.totalPoints}
      streak={tipModal.streak}
      onClose={() => setTipModal(null)}
    />
  );

  // Tip potwierdzony dziś — mały badge zamiast karty
  if (confirmed) return (
    <div style={{ margin: "12px 12px 0", background: devDateStr ? "rgba(230,126,34,.1)" : C.greenBg, border: `1px solid ${devDateStr ? "#E67E22" : C.green}`, borderRadius: 8, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 18 }}>{devDateStr ? "🛠" : "✅"}</span>
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: devDateStr ? "#E67E22" : C.greenDk }}>
          {T.tip_read}
        </div>
        <div style={{ fontSize: 11, color: devDateStr ? "#E67E22" : C.greenDk }}>
          {T.tip_return}
        </div>
      </div>
    </div>
  );

  const correctAnswer = tipQ[`answer_${tipQ.correct}`];
  return (
    <div style={{ margin: "12px 12px 0", borderRadius: 12, overflow: "hidden", border: "0.5px solid rgba(0,0,0,0.15)", boxShadow: "0 4px 12px rgba(0,0,0,0.18)" }}>
      {/* Nagłówek */}
      <div style={{ background: "#262624", padding: "10px 14px", display: "flex", alignItems: "center", gap: 8, borderBottom: "0.5px solid rgba(0,0,0,0.15)" }}>
        <span style={{ fontSize: 14 }}>💡</span>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#A0A0A0", letterSpacing: .5 }}>{T.tip_header}</span>
        <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: "#6E9430", background: "#EAF3DE", padding: "2px 8px", borderRadius: 4 }}>⭐ +{TIP_POINTS} pkt</span>
      </div>
      {/* Treść */}
      <div style={{ background: "#30302E", padding: "14px 16px 16px" }}>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,.65)", marginBottom: 12, lineHeight: 1.5 }}>
          {tipQ.question}
        </div>
        <div style={{ background: "#1A1A1A", border: "1px solid #8AB73E", borderRadius: 8, padding: "10px 14px", marginBottom: 14 }}>
          <div style={{ fontSize: 10, color: "#8AB73E", fontWeight: 700, letterSpacing: .5, marginBottom: 4 }}>{T.tip_answer}</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#FFFFFF", lineHeight: 1.4 }}>{correctAnswer}</div>
        </div>
        <button
          onClick={handleConfirm}
          disabled={confirming}
          style={{ width: "100%", padding: "11px", background: confirming ? "#8AB73E" : "#639922", border: "none", borderRadius: 8, color: "#FFFFFF", fontSize: 13, fontWeight: 700, cursor: confirming ? "not-allowed" : "pointer", boxSizing: "border-box", transition: "background .2s" }}>
          {confirming ? T.confirming_tip : T.confirm_tip}
        </button>
      </div>
    </div>
  );
}

/* ─── WeeklyQuizBanner — pojawia się w 7. dniu w Wiadomościach ──────────── */
function WeeklyQuizBanner({ token, userId, onConfirmed, devDateStr = null, onDevQuizDone, currentDate }) {
  const T = useT();
  const [quizDone,    setQuizDone]    = useState(false);
  const [questions,   setQuestions]   = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [showQuiz,    setShowQuiz]    = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [result,      setResult]      = useState(null);
  const [programStart,setProgramStart]= useState(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const { week, year } = getWeekKey(devDateStr);
        // Krok 1: quizy poza katalogiem
        const [standaloneQuizzes, weekRes, gameRows] = await Promise.all([
          db.get(token, "quizzes", "training_id=is.null&select=id").catch(() => []),
          db.get(token, "quiz_weekly_results", `user_id=eq.${userId}&week_year=eq.${year}&week_number=eq.${week}&select=id`).catch(() => []),
          db.get(token, "user_gamification", `user_id=eq.${userId}&select=program_start_date`).catch(() => []),
        ]);
        // Krok 2: pytania z tych quizów
        let qs = [];
        if (standaloneQuizzes.length > 0) {
          const ids = standaloneQuizzes.map(q => q.id).join(",");
          qs = await db.get(token, "quiz_questions", `quiz_id=in.(${ids})&order=created_at.asc&select=*`).catch(() => []);
        }
        const ps = gameRows[0]?.program_start_date || null;
        setProgramStart(ps);
        // Przekaż programStartDate i opcjonalną datę dev do getWeekQuestions
        setQuestions(getWeekQuestions(qs, ps, devDateStr));
        // W trybie dev zawsze startuj jako nieukończone — ignoruj bazę
        setQuizDone(devDateStr ? false : weekRes.length > 0);
      } catch {}
      finally { setLoading(false); }
    }
    load();
  }, [token, userId, devDateStr, currentDate]);

  async function handleResult(res) {
    setShowQuiz(false);
    setSaving(true);
    try {
      // Zawsze używamy realnej daty i tygodnia — SQL waliduje p_today <= CURRENT_DATE
      // devDateStr służy tylko do symulacji UI (który tip/quiz pokazać), nie do zapisu
      const { week, year } = getWeekKey(); // realny tydzień, bez devDateStr
      const today = toISO();               // realna dzisiejsza data
      const serverRes = await rpc.saveResult(token, {
        p_action:      "quiz",
        p_today:       today,
        p_correct:     res.correct,
        p_total:       res.total,
        p_time_bonus:  res.timeBonus,
        p_week_year:   year,
        p_week_number: week,
      });
      setResult({ ...res, newPoints: serverRes.total_points });
      setQuizDone(true);
      if (onConfirmed) onConfirmed();
    } catch (e) {
      alert(T.save_error + e.message);
    } finally {
      setSaving(false);
    }
  }

  // Nie pokazuj jeśli ładuje, brak daty startu lub to nie dzień quizu
  if (loading || !isQuizDay(programStart, devDateStr)) return null;

  // Quiz właśnie ukończony — pokaż wynik
if (result) return (
  <QuizRewardModal
    result={result}
    totalPoints={result.newPoints}
    onClose={() => setResult(null)}
  />
);

  // Quiz już wykonany w tym tygodniu
  if (quizDone) return (
    <div style={{ margin: "8px 12px 0", background: "#EAF3DE", border: `1px solid #8AB73E`, borderRadius: 8, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 18 }}>✅</span>
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#27500A" }}>{T.quiz_weekly_done}</div>
        <div style={{ fontSize: 11, color: "#3B6D11" }}>{T.quiz_return}</div>
      </div>
    </div>
  );

  if (saving) return (
    <div style={{ margin: "8px 12px 0", padding: "12px 16px", textAlign: "center", fontSize: 12, color: "#A0A0A0" }}>
      {T.saving_result}
    </div>
  );

  // Quiz dostępny — karta z przyciskiem
  return (
    <>
      <div style={{ margin: "8px 12px 0", borderRadius: 12, overflow: "hidden", border: "0.5px solid rgba(0,0,0,0.15)", boxShadow: "0 4px 12px rgba(0,0,0,0.12)" }}>
        <div style={{ background: "#262624", padding: "10px 14px", display: "flex", alignItems: "center", gap: 8, borderBottom: "0.5px solid rgba(0,0,0,0.15)" }}>
          <span style={{ fontSize: 14 }}>📝</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#A0A0A0", letterSpacing: .5 }}>{T.quiz_weekly_label}</span>
          <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: "#6E9430", background: "#EAF3DE", padding: "2px 8px", borderRadius: 4 }}>do 60 pkt</span>
        </div>
        <div style={{ background: "#30302E", padding: "14px 16px" }}>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,.65)", marginBottom: 12, lineHeight: 1.5 }}>
            {T.quiz_summary.replace("{n}", questions.length)}
          </div>
          <button
            onClick={() => setShowQuiz(true)}
            style={{ width: "100%", padding: "11px", background: "#639922", border: "none", borderRadius: 8, color: "#FFFFFF", fontSize: 13, fontWeight: 700, cursor: "pointer", boxSizing: "border-box" }}>
            {T.quiz_start}
          </button>
        </div>
      </div>
      {showQuiz && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 12, fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif" }}
          onClick={() => setShowQuiz(false)}>
          <div style={{ background: "#EFEFEF", width: "100%", maxWidth: 390, maxHeight: "92dvh", borderRadius: 18, boxShadow: "0 32px 80px rgba(0,0,0,.5)", display: "flex", flexDirection: "column", overflow: "hidden" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ background: "#2C2C2C", padding: "13px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
              <span style={{ color: "#fff", fontWeight: 700, fontSize: 15 }}>📝 Quiz tygodniowy</span>
              <button onClick={() => setShowQuiz(false)} style={{ background: "rgba(255,255,255,.12)", border: "none", color: "#ccc", fontSize: 16, cursor: "pointer", width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
              <WeeklyQuiz questions={questions} onResult={handleResult}/>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ─── Panel Dev — tylko dla trenerów i adminów ───────────────────────────── */
function DevPanel({ token, userId, onDevDate, seenDates, devQuizDone, onReset, onFullReset, resetting, simDay, setSimDay }) {
  const [open,         setOpen]         = useState(false);
  const [programStart, setProgramStart] = useState(null);
  const [allQuestions, setAllQuestions] = useState([]);
  const [loading,      setLoading]      = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    async function load() {
      try {
        const [gameRows, standaloneQuizzes] = await Promise.all([
          db.get(token, "user_gamification", `user_id=eq.${userId}&select=program_start_date`).catch(() => []),
          db.get(token, "quizzes", "training_id=is.null&select=id").catch(() => []),
        ]);
        const ps = gameRows[0]?.program_start_date || null;
        setProgramStart(ps);
        if (standaloneQuizzes.length > 0) {
          const ids = standaloneQuizzes.map(q => q.id).join(",");
          const qs = await db.get(token, "quiz_questions", `quiz_id=in.(${ids})&order=created_at.asc&select=*`).catch(() => []);
          setAllQuestions(qs);
        }
      } catch {}
      finally { setLoading(false); }
    }
    load();
  }, [open, token, userId]);

  function getSimDateStr(dayNumber) {
    if (!programStart) return null;
    const start = new Date(programStart + "T00:00:00");
    start.setDate(start.getDate() + dayNumber - 1);
    return start.toISOString().slice(0, 10);
  }

  const simDateStr   = programStart ? getSimDateStr(simDay) : null;
  const { cycleNumber, dayInCycle } = simDateStr
    ? getProgramInfo(programStart, simDateStr)
    : { cycleNumber: 0, dayInCycle: 0 };
  const isQuiz  = dayInCycle === 6;
  const cycleQs = simDateStr ? getWeekQuestions(allQuestions, programStart, simDateStr).filter(Boolean) : [];
  const todayTip = (!isQuiz && cycleQs.length > 0) ? cycleQs[dayInCycle] : null;

  // Oblicz seenDays (Set<index 0-5>) z seenDates (Set<ISO string>) dla bieżącego cyklu
  const seenDays = new Set();
  if (programStart && cycleQs.length > 0) {
    for (let i = 0; i < 6; i++) {
      const d = getSimDateStr(cycleNumber * 7 + i + 1);
      if (d && seenDates.has(d)) seenDays.add(i);
    }
  }
  const allTipsSeen = cycleQs.length > 0 && cycleQs.every((_, i) => seenDays.has(i));
  const DAY_COLORS  = ["#8AB73E","#8AB73E","#8AB73E","#8AB73E","#8AB73E","#8AB73E","#E67E22"];

  // Liczba widzianych tipów z aktualnego cyklu
  const seenCount = cycleQs.filter((_, i) => seenDays.has(i)).length;

  return (
    <div style={{ margin: "8px 12px 0" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: "100%", padding: "8px 14px", background: open ? "#2C2C2C" : "#1A1A1A", border: "1.5px dashed #555", borderRadius: 8, color: "#A0A0A0", fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, letterSpacing: .5 }}>
        <span style={{ fontSize: 14 }}>🛠</span>
        <span>PANEL DEWELOPERA — Symulator cyklu</span>
        {(seenCount > 0 || devQuizDone) && (
          <span style={{ fontSize: 10, background: "#2A5A00", color: "#8AB73E", padding: "2px 7px", borderRadius: 10, fontWeight: 700 }}>
            {seenCount}/6 tipów · {devQuizDone ? "Quiz ✓" : "Quiz —"}
          </span>
        )}
        <span style={{ marginLeft: "auto", fontSize: 14 }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div style={{ background: "#1A1A1A", border: "1.5px dashed #555", borderTop: "none", borderRadius: "0 0 8px 8px", padding: "14px 14px 16px" }}>
          {loading && <div style={{ color: "#888", fontSize: 12, textAlign: "center", padding: 12 }}>{T.loading_data}</div>}

          {!loading && !programStart && (
            <div style={{ color: "#E67E22", fontSize: 12, padding: "8px 0" }}>
              ⚠️ Brak program_start_date — uczestnik musi najpierw potwierdzić Tip Dnia (poza dev mode).
            </div>
          )}

          {!loading && programStart && (
            <>
              {/* Info + pasek postępu sesji */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10, color: "#666", marginBottom: 6, letterSpacing: .5 }}>
                  START: <span style={{ color: "#A0A0A0", fontWeight: 700 }}>{programStart}</span>
                  &nbsp;·&nbsp; PULA: <span style={{ color: "#A0A0A0", fontWeight: 700 }}>{allQuestions.length} pytań</span>
                </div>
                {/* Pasek sesji: 6 tipów + quiz */}
                <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
                  {cycleQs.map((_, i) => (
                    <div key={i} style={{
                      flex: 1, height: 6, borderRadius: 3,
                      background: seenDays.has(i) ? "#8AB73E" : "#2A2A2A",
                      border: "1px solid #333",
                      transition: "background .3s",
                    }} title={`D${i+1}${seenDays.has(i) ? " ✓ widziany" : " — niewidziany"}`}/>
                  ))}
                  <div style={{ width: 2, background: "#444", height: 10 }}/>
                  <div style={{
                    flex: 1, height: 6, borderRadius: 3,
                    background: devQuizDone ? "#E67E22" : "#2A2A2A",
                    border: "1px solid #333",
                    transition: "background .3s",
                  }} title={devQuizDone ? "Quiz ✓ ukończony" : "Quiz — nieukończony"}/>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3, fontSize: 9, color: "#555" }}>
                  <span>Tipy D1–D6</span>
                  <span>Quiz D7</span>
                </div>
              </div>

              {/* Suwak dnia */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: "#888", fontWeight: 700 }}>SYMULOWANY DZIEŃ PROGRAMU</span>
                  <span style={{ fontSize: 13, fontWeight: 900, color: DAY_COLORS[dayInCycle] }}>
                    Dzień {simDay} · Cykl {cycleNumber + 1} ·
                    {isQuiz
                      ? <span style={{ color: "#E67E22" }}> 📝 QUIZ</span>
                      : <span style={{ color: seenDays.has(dayInCycle) ? "#6E9430" : "#8AB73E" }}>
                          {" "}💡 Tip #{dayInCycle + 1}{seenDays.has(dayInCycle) ? " ✓" : ""}
                        </span>
                    }
                  </span>
                </div>
                <input type="range" min={1} max={14} value={simDay}
                  onChange={e => setSimDay(Number(e.target.value))}
                  style={{ width: "100%", accentColor: "#8AB73E" }}/>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#555", marginTop: 2 }}>
                  <span>← Cykl 1 (D1–D7)</span>
                  <span>Cykl 2 (D8–D14) →</span>
                </div>
              </div>

              {/* Mapa pytań cyklu */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: "#666", marginBottom: 6, letterSpacing: .5, fontWeight: 700 }}>
                  PYTANIA CYKLU {cycleNumber + 1}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {cycleQs.map((q, i) => {
                    const isCurrent = i === dayInCycle && !isQuiz;
                    const isSeen    = seenDays.has(i);
                    return (
                      <div key={q.id} style={{
                        padding: "7px 10px", borderRadius: 6,
                        background: isCurrent ? "rgba(138,183,62,.15)" : isSeen ? "rgba(138,183,62,.06)" : "rgba(255,255,255,.03)",
                        border: `1px solid ${isCurrent ? "#8AB73E" : isSeen ? "#3A5A20" : "#222"}`,
                        display: "flex", alignItems: "flex-start", gap: 8,
                        opacity: isSeen && !isCurrent ? 0.6 : 1,
                      }}>
                        <span style={{ fontSize: 10, fontWeight: 800, minWidth: 44, flexShrink: 0,
                          color: isCurrent ? "#8AB73E" : isSeen ? "#6E9430" : "#444" }}>
                          {isCurrent ? "▶ D" + (i + 1) : (isSeen ? "✓ D" : "D") + (i + 1)}
                        </span>
                        <span style={{ fontSize: 11, color: isSeen ? "#666" : "#A0A0A0", lineHeight: 1.4, flex: 1 }}>
                          {q.question}
                        </span>
                        {isSeen && !isCurrent && (
                          <span style={{ fontSize: 9, color: "#3A5A20", fontWeight: 700, flexShrink: 0 }}>WIDZIANY</span>
                        )}
                      </div>
                    );
                  })}
                  {cycleQs.length === 0 && (
                    <div style={{ color: "#555", fontSize: 12, textAlign: "center", padding: 8 }}>{T.no_questions}</div>
                  )}
                  {/* Wiersz quizu */}
                  {cycleQs.length > 0 && (
                    <div style={{
                      padding: "7px 10px", borderRadius: 6,
                      background: isQuiz ? "rgba(230,126,34,.12)" : devQuizDone ? "rgba(230,126,34,.06)" : "rgba(255,255,255,.03)",
                      border: `1px solid ${isQuiz ? "#E67E22" : devQuizDone ? "#7A4A10" : "#222"}`,
                      display: "flex", alignItems: "center", gap: 8,
                      opacity: devQuizDone && !isQuiz ? 0.6 : 1,
                    }}>
                      <span style={{ fontSize: 10, fontWeight: 800, minWidth: 44, flexShrink: 0,
                        color: isQuiz ? "#E67E22" : devQuizDone ? "#E67E22" : "#444" }}>
                        {isQuiz ? "▶ D7" : devQuizDone ? "✓ D7" : "D7"}
                      </span>
                      <span style={{ fontSize: 11, color: devQuizDone ? "#666" : "#A0A0A0", flex: 1 }}>
                        📝 Quiz tygodniowy — {allTipsSeen ? "wszystkie tipy przejrzane ✓" : `przejrzane: ${seenCount}/6 tipów`}
                      </span>
                      {devQuizDone && !isQuiz && <span style={{ fontSize: 9, color: "#7A4A10", fontWeight: 700, flexShrink: 0 }}>UKOŃCZONY</span>}
                    </div>
                  )}
                </div>
              </div>

              {/* Przyciski */}
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <button
                  onClick={() => onDevDate(isQuiz ? simDateStr : null)}
                  disabled={!isQuiz || devQuizDone}
                  style={{
                    flex: 1, padding: "9px 0", fontSize: 11, fontWeight: 700, borderRadius: 6,
                    background: isQuiz && !devQuizDone ? "#E67E22" : "#2A2A2A",
                    border:     `1px solid ${isQuiz && !devQuizDone ? "#E67E22" : "#444"}`,
                    color:      isQuiz && !devQuizDone ? "#fff" : "#555",
                    cursor:     isQuiz && !devQuizDone ? "pointer" : "not-allowed",
                  }}>
                  📝 {devQuizDone ? "Quiz ✓" : "Testuj Quiz (D7)"}
                </button>
                <button
                  onClick={() => onDevDate(!isQuiz ? simDateStr : null)}
                  disabled={isQuiz || !todayTip || seenDays.has(dayInCycle)}
                  style={{
                    flex: 1, padding: "9px 0", fontSize: 11, fontWeight: 700, borderRadius: 6,
                    background: !isQuiz && todayTip && !seenDays.has(dayInCycle) ? "#2A5A00" : "#2A2A2A",
                    border:     `1px solid ${!isQuiz && todayTip && !seenDays.has(dayInCycle) ? "#8AB73E" : "#444"}`,
                    color:      !isQuiz && todayTip && !seenDays.has(dayInCycle) ? "#8AB73E" : "#555",
                    cursor:     !isQuiz && todayTip && !seenDays.has(dayInCycle) ? "pointer" : "not-allowed",
                  }}>
                  💡 {seenDays.has(dayInCycle) && !isQuiz ? `D${dayInCycle+1} ✓` : `Testuj Tip (D${dayInCycle+1})`}
                </button>
              </div>

              {/* Reset sesji */}
              <button
                onClick={onReset}
                disabled={resetting}
                style={{
                  width: "100%", padding: "9px 0", fontSize: 11, fontWeight: 700, borderRadius: 6,
                  background: resetting ? "#2A2A2A" : "#3A0000",
                  border: `1px solid ${resetting ? "#444" : "#8B0000"}`,
                  color: resetting ? "#555" : "#FF6B6B",
                  cursor: resetting ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                }}>
                {resetting ? "⏳ Czyszczenie..." : "🔄 Reset sesji — zacznij flow od nowa"}
              </button>
              <div style={{ fontSize: 9, color: "#444", textAlign: "center", marginTop: 4, marginBottom: 10 }}>
                Kasuje dane testowe (week_year=-1) · Resetuje suwak do D1 · Nie dotyka prawdziwych danych
              </div>

              {/* Reset programu — danger zone */}
              <div style={{ borderTop: "1px solid #2A0000", paddingTop: 10 }}>
                <div style={{ fontSize: 9, color: "#8B0000", fontWeight: 700, letterSpacing: .5, marginBottom: 6, textAlign: "center" }}>
                  ⚠ DANGER ZONE
                </div>
                <button
                  onClick={onFullReset}
                  disabled={resetting}
                  style={{
                    width: "100%", padding: "9px 0", fontSize: 11, fontWeight: 700, borderRadius: 6,
                    background: "#1A0000",
                    border: "1px solid #8B0000",
                    color: "#FF4444",
                    cursor: resetting ? "not-allowed" : "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  }}>
                  💣 Reset programu uczestnika
                </button>
                <div style={{ fontSize: 9, color: "#4A0000", textAlign: "center", marginTop: 4 }}>
                  Kasuje tip_confirmations + quiz_weekly_results + user_gamification · Nieodwracalne
                </div>
              </div>

              {simDateStr && (
                <div style={{ fontSize: 10, color: "#555", textAlign: "center", marginTop: 6 }}>
                  Symulowana data: {simDateStr}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function MessagesTab({ onTipConfirmed, onMarkRead, readIds = new Set(), msgRefreshKey = 0 }) {
  const T = useT();
  const { user, token } = useUser();
  const isAdmin   = user?.role === "admin";
  const isDevUser = DEV_PANEL_ENABLED && (isAdmin || (user?.trainer_id != null));
  const [devDateStr,   setDevDateStr]   = useState(null);
  const [devSeenDates, setDevSeenDates] = useState(new Set()); // Set<ISO string>
  const [devQuizDone,  setDevQuizDone]  = useState(false);
  const [resetting,    setResetting]    = useState(false);
  const [devSimDay,    setDevSimDay]    = useState(1);
  const [devResetKey,  setDevResetKey]  = useState(0); // zmiana = wymusza remount TipBanner/WeeklyQuizBanner

  // Wywołane przez TipBanner po potwierdzeniu w dev mode
  function handleDevTipSeen(dateStr) {
    setDevSeenDates(prev => new Set([...prev, dateStr]));
  }

  // Wywołane przez WeeklyQuizBanner po ukończeniu quizu w dev mode
  function handleDevQuizDone() {
    setDevQuizDone(true);
  }

  // Reset sesji dev: kasuje dane testowe z bazy, resetuje lokalny stan
  async function handleDevReset() {
    setResetting(true);
    try {
      await db.remove(token, "quiz_weekly_results", `user_id=eq.${user.id}&week_year=eq.-1`).catch(() => {});
      setDevSeenDates(new Set());
      setDevQuizDone(false);
      setDevDateStr(null);
      setDevSimDay(1);
      setDevResetKey(k => k + 1);
    } catch {}
    finally { setResetting(false); }
  }

  // Reset programu: kasuje CAŁĄ historię uczestnika — tylko trener/admin
  async function handleFullReset() {
    if (!window.confirm("⚠️ UWAGA: Skasuje całą historię uczestnika (tipy, quizy, punkty, streak). Tej operacji nie można cofnąć. Kontynuować?")) return;
    setResetting(true);
    try {
      await Promise.all([
        db.remove(token, "tip_confirmations",   `user_id=eq.${user.id}`),
        db.remove(token, "quiz_weekly_results", `user_id=eq.${user.id}`),
        db.remove(token, "user_gamification",   `user_id=eq.${user.id}`),
      ]);
      setDevSeenDates(new Set());
      setDevQuizDone(false);
      setDevDateStr(null);
      setDevSimDay(1);
      setDevResetKey(k => k + 1);
      if (onTipConfirmed) onTipConfirmed();
    } catch (e) {
      alert("Błąd resetu: " + e.message);
    }
    finally { setResetting(false); }
  }

  // Dane użytkownika wyciągnięte na poziomie komponentu
  const userName  = user?.displayName || user?.name  || "";
  const userMail  = user?.email       || "";
  const userRole  = user?.role        || "";
  const userFirma = user?.firma       || "";
  const userPhone = user?.phone       || "";
  // Bieżąca data — aktualizuje się gdy użytkownik wraca do app po północy.
  // Zmiana tej wartości wymusza przeładowanie TipBanner i WeeklyQuizBanner.
  const [currentDate, setCurrentDate] = useState(toISO());
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") {
        const today = toISO();
        setCurrentDate(prev => prev !== today ? today : prev);
      }
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const [messages,  setMessages]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [err,       setErr]       = useState("");
  // formularz nowej wiadomości
  const [showForm,  setShowForm]  = useState(false);
  const [fTitle,    setFTitle]    = useState("");
  const [fBody,     setFBody]     = useState("");
  const [fType,     setFType]     = useState("info");
  const [fPinned,   setFPinned]   = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [formErr,   setFormErr]   = useState("");
  const [deleting,  setDeleting]  = useState(null);
  const [contactOpen, setContactOpen] = useState(false);

  async function loadMessages() {
    try {
      const data = await db.get(token, "messages", "order=pinned.desc,created_at.desc&select=*");
      setMessages(data);
    } catch { setErr(T.cannot_load); }
    finally { setLoading(false); }
  }

  function markRead(id) {
    if (onMarkRead) onMarkRead(id);
  }

  useEffect(() => { loadMessages(); }, []);
  // Odśwież listę gdy Realtime zgłosi nową wiadomość (msgRefreshKey rośnie)
  useEffect(() => { if (msgRefreshKey > 0) loadMessages(); }, [msgRefreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  async function sendMessage() {
    if (!fTitle.trim()) { setFormErr(T.title_required); return; }
    if (!fBody.trim())  { setFormErr(T.body_required); return; }
    setSaving(true); setFormErr("");
    try {
      await db.insert(token, "messages", {
        title:   fTitle.trim(),
        body:    fBody.trim(),
        type:    fType,
        pinned:  fPinned,
      });
      setFTitle(""); setFBody(""); setFType("info"); setFPinned(false);
      setShowForm(false);
      await loadMessages();
    } catch(e) { setFormErr(T.send_error + e.message); }
    finally { setSaving(false); }
  }

  async function deleteMessage(id) {
    setDeleting(id);
    try {
      await db.remove(token, "messages", `id=eq.${id}`);
      setMessages(p => p.filter(m => m.id !== id));
    } catch(e) { alert(T.delete_error + e.message); }
    finally { setDeleting(null); }
  }

  if (loading) return <div style={{background:C.greyBg,flex:1,display:"flex",alignItems:"center",justifyContent:"center"}}><Spinner/></div>;

  return (
    <div style={{background:C.greyBg,flex:1,minHeight:0,display:"flex",flexDirection:"column",position:"relative",overflow:"hidden"}}>
    <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",paddingBottom:"calc(72px + env(safe-area-inset-bottom, 0px))"}}>
      {err && <div style={{background:"#FDEDEC",border:`1px solid ${C.red}`,margin:12,padding:"12px 16px",fontSize:13,color:C.red}}>{err}</div>}

      {/* PANEL DEV — tylko dla trenerów i adminów */}
      {isDevUser && (
        <DevPanel
          token={token} userId={user?.id}
          onDevDate={setDevDateStr}
          seenDates={devSeenDates}
          devQuizDone={devQuizDone}
          onReset={handleDevReset}
          onFullReset={handleFullReset}
          resetting={resetting}
          simDay={devSimDay}
          setSimDay={setDevSimDay}
        />
      )}
      {devDateStr && (
        <div style={{ margin: "4px 12px 0", padding: "6px 12px", background: "rgba(230,126,34,.12)", border: "1px solid #E67E22", borderRadius: 6, fontSize: 11, color: "#E67E22", display: "flex", alignItems: "center", gap: 6 }}>
          <span>🛠</span> Tryb symulacji: <strong>{devDateStr}</strong>
          <button onClick={() => setDevDateStr(null)} style={{ marginLeft: "auto", background: "none", border: "none", color: "#E67E22", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>✕</button>
        </div>
      )}

      {/* TIP DNIA — tylko dla nie-adminów */}
      {!isAdmin && (
        <TipBanner
          key={devResetKey}
          token={token} userId={user?.id}
          onConfirmed={onTipConfirmed}
          devDateStr={devDateStr}
          onDevSeen={handleDevTipSeen}
          currentDate={currentDate}
        />
      )}

      {/* QUIZ TYGODNIOWY — 7. dzień programu, tylko dla nie-adminów */}
      {!isAdmin && (
        <WeeklyQuizBanner
          key={`quiz-${devResetKey}`}
          token={token} userId={user?.id}
          onConfirmed={onTipConfirmed}
          devDateStr={devDateStr}
          onDevQuizDone={handleDevQuizDone}
          currentDate={currentDate}
        />
      )}

      {/* PANEL ADMINA */}
      {isAdmin && (
        <div style={{margin:"12px 12px 0",background:C.white,border:`2px solid ${C.green}`,padding:16}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:showForm?16:0}}>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:1,color:C.greenDk,textTransform:"uppercase"}}>⚙ Panel administratora</div>
            <button
              style={{background:showForm?"none":C.black,border:`1px solid ${showForm?C.grey:C.black}`,color:showForm?C.greyDk:C.white,padding:"7px 14px",fontSize:12,fontWeight:600,cursor:"pointer"}}
              onClick={() => { setShowForm(p => !p); setFormErr(""); }}>
              {showForm ? T.cancel : T.new_message}
            </button>
          </div>

          {showForm && (
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              {/* Tytuł */}
              <div>
                <label style={{display:"block",fontSize:11,fontWeight:700,color:C.greyDk,marginBottom:5,letterSpacing:.5}}>TYTUŁ *</label>
                <input
                  style={{width:"100%",border:`1.5px solid ${C.grey}`,padding:"9px 12px",fontSize:14,color:C.black,outline:"none",boxSizing:"border-box"}}
                  value={fTitle} onChange={e => setFTitle(e.target.value)} placeholder="np. Nowe szkolenie w ofercie"/>
              </div>

              {/* Treść */}
              <div>
                <label style={{display:"block",fontSize:11,fontWeight:700,color:C.greyDk,marginBottom:5,letterSpacing:.5}}>TREŚĆ *</label>
                <textarea
                  style={{width:"100%",border:`1.5px solid ${C.grey}`,padding:"9px 12px",fontSize:13,color:C.black,outline:"none",boxSizing:"border-box",minHeight:90,resize:"vertical",fontFamily:"inherit"}}
                  value={fBody} onChange={e => setFBody(e.target.value)} placeholder={T.message_body_ph}/>
              </div>

              {/* Typ */}
              <div>
                <label style={{display:"block",fontSize:11,fontWeight:700,color:C.greyDk,marginBottom:8,letterSpacing:.5}}>TYP WIADOMOŚCI</label>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  {Object.entries(MSG_TYPES).map(([key, mt]) => (
                    <button key={key} onClick={() => setFType(key)}
                      style={{padding:"6px 14px",fontSize:12,fontWeight:600,cursor:"pointer",border:`2px solid ${fType===key?mt.color:C.grey}`,background:fType===key?mt.bg:C.white,color:fType===key?mt.color:C.greyDk}}>
                      {mt.icon} {key.charAt(0).toUpperCase()+key.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Przypnij */}
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <Toggle value={fPinned} color={C.green} onChange={() => setFPinned(p => !p)}/>
                <span style={{fontSize:13,color:C.black}}>Przypnij wiadomość na górze</span>
              </div>

              {/* Podgląd */}
              {(fTitle||fBody) && (
                <div>
                  <div style={{fontSize:11,fontWeight:700,color:C.greyDk,marginBottom:6,letterSpacing:.5}}>PODGLĄD</div>
                  <div style={{background:fPinned?(MSG_TYPES[fType]||MSG_TYPES.info).bg:C.greyBg,border:`1px solid ${(MSG_TYPES[fType]||MSG_TYPES.info).color+"44"}`,padding:14}}>
                    <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                      <span style={{fontSize:18}}>{(MSG_TYPES[fType]||MSG_TYPES.info).icon}</span>
                      <div>
                        <div style={{fontSize:13,fontWeight:700,color:C.black,marginBottom:4}}>{fTitle||"(brak tytułu)"}</div>
                        <div style={{fontSize:12,color:C.greyDk,lineHeight:1.6}}>{fBody||"(brak treści)"}</div>
                        {fPinned && <span style={{fontSize:9,fontWeight:700,color:(MSG_TYPES[fType]||MSG_TYPES.info).color,letterSpacing:1}}>PRZYPIĘTE</span>}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {formErr && <div style={{color:C.red,fontSize:12}}>{formErr}</div>}

              <button
                style={{background:saving?C.greyDk:C.black,border:"none",color:C.white,padding:"12px",fontSize:13,fontWeight:600,cursor:saving?"not-allowed":"pointer"}}
                onClick={sendMessage} disabled={saving}>
                {saving ? T.sending_msg : T.send_message}
              </button>
            </div>
          )}
        </div>
      )}

      {/* LISTA WIADOMOŚCI */}
      {!messages.length && !err && (
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"60%",padding:32,textAlign:"center"}}>
          <div style={{fontSize:40,marginBottom:16}}>📭</div>
          <div style={{fontSize:16,fontWeight:600,color:C.black,marginBottom:8}}>{T.no_messages}</div>
          <div style={{fontSize:13,color:C.greyMid}}>Nowe ogłoszenia pojawią się tutaj.</div>
        </div>
      )}
      <div style={{padding:"8px 12px 32px",display:"flex",flexDirection:"column",gap:8}}>
        {messages.map(m => {
          const mt = MSG_TYPES[m.type] || MSG_TYPES.info;
          const isRead = readIds.has(m.id);
          return (
            <div key={m.id} onClick={() => markRead(m.id)} style={{
              background: isRead ? "#F7F7F7" : C.white,
              borderRadius: 10,
              boxShadow: isRead ? "none" : "0 2px 8px rgba(0,0,0,0.08)",
              border: isRead ? "1px solid #E8E8E8" : "1px solid rgba(0,0,0,0.06)",
              cursor: "pointer",
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}>
              {/* Kolorowa belka przypięcia */}
              {m.pinned && (
                <div style={{
                  background: mt.color,
                  padding: "4px 14px",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}>
                  <span style={{fontSize:9,fontWeight:800,color:C.white,letterSpacing:1.2}}>📌 PRZYPIĘTE</span>
                </div>
              )}
              <div style={{display:"flex",flexDirection:"row"}}>
                {/* Lewa kolorowa belka — typ wiadomości */}
                <div style={{
                  width: 4,
                  flexShrink: 0,
                  background: isRead ? C.grey : mt.color,
                  borderRadius: "0 0 0 0",
                  opacity: isRead ? 0.4 : 1,
                }}/>
                <div style={{flex:1,padding:"12px 14px"}}>
                  {/* Tytuł + data w jednej linii */}
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8,marginBottom:5}}>
                    <div style={{
                      fontSize: 14,
                      fontWeight: isRead ? 500 : 700,
                      color: isRead ? C.greyDk : C.black,
                      lineHeight: 1.3,
                      flex: 1,
                    }}>{m.title}</div>
                    <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,flexShrink:0}}>
                      <span style={{fontSize:11,color:isRead ? C.greyMid : C.greyDk,whiteSpace:"nowrap"}}>
                        {formatDate(m.created_at)}
                      </span>
                      {isAdmin && (
                        <button
                          onClick={(e) => { e.stopPropagation(); if(window.confirm(T.delete_msg_confirm)) deleteMessage(m.id); }}
                          disabled={deleting===m.id}
                          style={{background:"none",border:`1px solid ${C.red}`,color:C.red,padding:"2px 7px",fontSize:10,fontWeight:600,cursor:"pointer",borderRadius:4}}>
                          {deleting===m.id ? "..." : T.delete}
                        </button>
                      )}
                    </div>
                  </div>
                  <div style={{
                    fontSize: 13,
                    color: isRead ? C.greyMid : C.greyDk,
                    lineHeight: 1.6,
                  }}>{m.body}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

    </div>{/* end scroll */}

      {/* ── FAB KONTAKT ── */}
      <div className="contact-fab" style={{position:"absolute",bottom:"calc(16px + env(safe-area-inset-bottom, 0px))",right:16,zIndex:900}}>
        {contactOpen && (
          <div style={{position:"absolute",bottom:56,right:0,background:C.white,borderRadius:12,boxShadow:"0 4px 24px rgba(0,0,0,.18)",padding:"8px 0",minWidth:180,overflow:"hidden"}}>
            {/* EMAIL */}
            <a href="#"
              onClick={(e) => {
                e.preventDefault();
                const subject = encodeURIComponent("Zapytanie o szkolenie - " + userName);
                const body = encodeURIComponent(
                  "Dzien dobry,\n\njestem zainteresowany/a szkoleniem.\n\nImie i nazwisko: " + userName +
                  "\nStanowisko: " + userRole +
                  "\nFirma: " + userFirma +
                  "\nAdres e-mail: " + userMail +
                  "\nTelefon kontaktowy: " + userPhone + "\n\nProsze o kontakt.\n\nZ powazaniem,\n" + userName
                );
                setContactOpen(false);
                window.location.href = "mailto:" + CONTACT_EMAIL + "?subject=" + subject + "&body=" + body;
              }}
              style={{display:"flex",alignItems:"center",gap:12,padding:"13px 18px",textDecoration:"none",color:C.black,borderBottom:`1px solid ${C.grey}`}}>
              <span style={{fontSize:20}}>✉️</span>
              <div>
                <div style={{fontSize:13,fontWeight:700}}>E-mail</div>
                <div style={{fontSize:10,color:C.greyMid}}>{CONTACT_EMAIL}</div>
              </div>
            </a>
            {/* TELEFON */}
            <a href={`tel:${CONTACT_PHONE.replace(/\s/g,"")}`}
              onClick={() => setContactOpen(false)}
              style={{display:"flex",alignItems:"center",gap:12,padding:"13px 18px",textDecoration:"none",color:C.black}}>
              <span style={{fontSize:20}}>📞</span>
              <div>
                <div style={{fontSize:13,fontWeight:700}}>Telefon</div>
                <div style={{fontSize:10,color:C.greyMid}}>{CONTACT_PHONE}</div>
              </div>
            </a>
          </div>
        )}
        <button onClick={() => setContactOpen(o => !o)}
          style={{width:64,height:64,borderRadius:"50%",background:contactOpen?C.greyDk:C.black,border:"none",color:C.white,fontSize:52,cursor:"pointer",boxShadow:"0 2px 16px rgba(0,0,0,.3)",display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1,paddingBottom:2}}>
          {contactOpen ? "✕" : "✆"}
        </button>
      </div>

      {/* Overlay zamykający menu */}
      {contactOpen && (
        <div onClick={() => setContactOpen(false)}
          style={{position:"absolute",inset:0,zIndex:899}}/>
      )}
    </div>
  );
}
