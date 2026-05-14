import { useState, useEffect, useCallback, useRef } from "react";
import { C } from "../lib/constants";
import { db } from "../lib/supabase";
import { useUser } from "../lib/UserContext";
import { useT } from "../lib/LangContext";
import { Spinner } from "./SharedUI";
import {
  PROG_LEVELS, getLevelInfo, getEarnedBadges,
  calcQuizPoints, QUIZ_DURATION,
} from "../lib/gamification";

/* ─── Pomocniki ──────────────────────────────────────────────────────────── */
const toISO = (d = new Date()) => d.toISOString().slice(0, 10);

function anonymize(name) {
  if (!name) return "?";
  return name.trim().split(/\s+/).map(p => (p[0] || "?").toUpperCase() + ".").join("");
}

/* ─── Quiz tygodniowy ────────────────────────────────────────────────────── */
export function WeeklyQuiz({ questions, onResult }) {
  const T = useT();
  const [qIdx,    setQIdx]    = useState(0);
  const [answers, setAnswers] = useState({});   // { questionId: chosen }
  const [chosen,  setChosen]  = useState(null);
  const [phase,   setPhase]   = useState("question"); // question | answer | result
  const [timeLeft,setTimeLeft]= useState(QUIZ_DURATION);
  const timerRef              = useRef(null);

  /* Wspólny timer dla całego quizu */
  const startTimer = useCallback(() => {
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { clearInterval(timerRef.current); setPhase("result"); return 0; }
        return t - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => {
    startTimer();
    return () => clearInterval(timerRef.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleAnswer(key) {
    if (chosen) return;
    clearInterval(timerRef.current);
    setChosen(key);
    setAnswers(prev => ({ ...prev, [questions[qIdx].id]: key }));
    setPhase("answer");
  }

  function goNext() {
    const nextIdx = qIdx + 1;
    if (nextIdx >= questions.length) {
      setPhase("result");
    } else {
      setQIdx(nextIdx);
      setChosen(null);
      setPhase("question");
      startTimer();
    }
  }

  const currentQ = questions[qIdx];
  const timerPct = (timeLeft / QUIZ_DURATION) * 100;
  const timerColor = timerPct > 50 ? C.green : timerPct > 20 ? C.amber : C.red;
  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;

  /* Wynik końcowy */
if (phase === "result") {
  const correct = questions.filter(q => answers[q.id] === q.correct).length;
  const { pct, points, basePoints, timeBonus } = calcQuizPoints(correct, questions.length, timeLeft);
  // Przekaż wynik do rodzica (WeeklyQuizBanner) — modal pokazuje się tam
  onResult({ pct, points, basePoints, timeBonus, correct, total: questions.length });
  return null;
}

  if (!currentQ) return null;
  const ANSWER_COLORS = { a: "#2980B9", b: "#8E44AD", c: "#E67E22" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Timer + licznik */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ fontSize: 11, color: C.greyMid, fontWeight: 600 }}>
            Pytanie {qIdx + 1} / {questions.length}
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, color: timerColor }}>
            {mins}:{String(secs).padStart(2, "0")}
          </span>
        </div>
        <div style={{ height: 4, background: C.grey, borderRadius: 2, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${timerPct}%`, background: timerColor, borderRadius: 2, transition: "width 1s linear, background .3s" }}/>
        </div>
      </div>

      {/* Pasek postępu pytań */}
      <div style={{ display: "flex", gap: 3 }}>
        {questions.map((q, i) => {
          const ans = answers[q.id];
          const correct = ans === q.correct;
          return (
            <div key={i} style={{
              flex: 1, height: 5, borderRadius: 3,
              background: i < qIdx
                ? (correct ? C.green : C.red)
                : i === qIdx ? C.amber : C.grey,
              transition: "background .3s",
            }}/>
          );
        })}
      </div>

      {/* Pytanie */}
      <div style={{ background: C.black, padding: "18px 16px", borderRadius: 12 }}>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,.4)", fontWeight: 700, letterSpacing: .5, marginBottom: 8 }}>
          PYTANIE TYGODNIA
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.white, lineHeight: 1.5 }}>
          {currentQ.question}
        </div>
      </div>

      {/* Odpowiedzi */}
      {phase === "question" && ["a", "b", "c"].map(k => (
        <button key={k} onClick={() => handleAnswer(k)}
          style={{
            padding: "12px 14px", background: C.white, border: "none", borderRadius: 10,
            fontSize: 14, fontWeight: 600, color: C.black, cursor: "pointer",
            textAlign: "left", display: "flex", alignItems: "center", gap: 12,
            boxShadow: "0 1px 3px rgba(0,0,0,.08)",
          }}>
          <span style={{
            width: 26, height: 26, borderRadius: "50%", background: ANSWER_COLORS[k],
            color: "#fff", fontSize: 12, fontWeight: 800,
            display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            {k.toUpperCase()}
          </span>
          <span style={{ flex: 1, lineHeight: 1.4 }}>{currentQ[`answer_${k}`]}</span>
        </button>
      ))}

      {/* Odpowiedź z wynikiem */}
      {phase === "answer" && (
        <>
          {["a", "b", "c"].map(k => {
            const isCorrect = k === currentQ.correct;
            const isChosen  = k === chosen;
            const bg     = isCorrect ? "#F0F7E0" : isChosen ? "#FDEDEC" : "#f5f5f5";
            const color  = isCorrect ? C.greenDk : isChosen ? C.red : C.greyMid;
            const border = isCorrect ? `2px solid ${C.green}` : isChosen ? `2px solid ${C.red}` : "2px solid transparent";
            return (
              <div key={k} style={{ padding: "12px 14px", background: bg, border, borderRadius: 10, display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{
                  width: 26, height: 26, borderRadius: "50%",
                  background: isCorrect ? C.green : isChosen ? C.red : "#ccc",
                  color: "#fff", fontSize: 12, fontWeight: 800,
                  display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  {k.toUpperCase()}
                </span>
                <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color, lineHeight: 1.4 }}>
                  {currentQ[`answer_${k}`]}
                </span>
                {isCorrect && <span style={{ fontSize: 16 }}>✓</span>}
              </div>
            );
          })}
          <button onClick={goNext}
            style={{ padding: "14px", background: C.green, border: "none", borderRadius: 10, color: C.white, fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            {qIdx + 1 < questions.length ? T.gram_next : T.gram_result}
          </button>
        </>
      )}
    </div>
  );
}

/* ─── RANKING ────────────────────────────────────────────────────────────── */
function Ranking({ token, userId }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [gameRows, profiles] = await Promise.all([
          db.get(token, "user_gamification", "order=points.desc&limit=30&select=*"),
          db.get(token, "profiles", "select=id,name"),
        ]);
        const profileMap = {};
        profiles.forEach(p => { profileMap[p.id] = p.name || ""; });
        setEntries(gameRows.map((r, i) => ({
          ...r,
          rank:     i + 1,
          initials: anonymize(profileMap[r.user_id] || ""),
          isMe:     r.user_id === userId,
        })));
      } catch {}
      finally { setLoading(false); }
    }
    load();
  }, [token, userId]);

  if (loading) return <div style={{ textAlign: "center", padding: 40 }}><Spinner/></div>;

  const me = entries.find(e => e.isMe);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Moja pozycja */}
      <div style={{ background: C.black, borderRadius: 12, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,.4)", fontWeight: 700, letterSpacing: .5 }}>TWOJA POZYCJA</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: me ? C.green : C.greyMid }}>
            {me ? `#${me.rank}` : "—"}
          </div>
        </div>
        {me && (
          <div style={{ marginLeft: "auto", textAlign: "right" }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.green }}>{me.points} pkt</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,.4)" }}>🔥 {me.streak_current || 0} dni</div>
          </div>
        )}
      </div>

      {/* TOP lista */}
      {entries.map(e => (
        <div key={e.user_id} style={{
          background:  e.isMe ? C.greenBg : C.white,
          border:      e.isMe ? `2px solid ${C.green}` : `1px solid ${C.grey}`,
          borderRadius: 8,
          padding:     "10px 14px",
          display:     "flex",
          alignItems:  "center",
          gap:         12,
          boxShadow:   "0 1px 3px rgba(0,0,0,.05)",
        }}>
          {/* Medal dla top 3 */}
          <span style={{ fontSize: 15, width: 28, textAlign: "center", flexShrink: 0 }}>
            {e.rank === 1 ? "🥇" : e.rank === 2 ? "🥈" : e.rank === 3 ? "🥉" : `#${e.rank}`}
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.black }}>
              {e.initials}
              {e.isMe && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: C.green, background: C.greenBg, padding: "1px 5px", borderRadius: 3 }}>TY</span>}
            </div>
            <div style={{ fontSize: 11, color: C.greyMid }}>🔥 {e.streak_current || 0} dni</div>
          </div>
          <span style={{ fontSize: 15, fontWeight: 800, color: e.isMe ? C.greenDk : C.black }}>
            {e.points} pkt
          </span>
        </div>
      ))}

      {!entries.length && (
        <div style={{ textAlign: "center", color: C.greyMid, padding: 32, fontSize: 13 }}>
          Brak danych rankingu
        </div>
      )}
    </div>
  );
}

/* ─── GŁÓWNY KOMPONENT ───────────────────────────────────────────────────── */
export function GramTab({ onClose, onGoToMessages }) {
  const { user, token } = useUser();
  const T = useT();
  const [view,         setView]         = useState("dashboard");
  const [loading,      setLoading]      = useState(true);
  const [gameData,     setGameData]     = useState({ points: 0, streak_current: 0, streak_last_date: null, program_start_date: null });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [gameRows] = await Promise.all([
        db.get(token, "user_gamification", `user_id=eq.${user.id}&select=*`).catch(() => []),
      ]);
      const gd = gameRows[0] || { points: 0, streak_current: 0, streak_last_date: null, program_start_date: null };
      setGameData(gd);
    } catch {}
    finally { setLoading(false); }
  }, [token, user.id]);

  useEffect(() => { load(); }, [load]);

  /* ── Modal wrapper ── */
  const wrap = (content) => (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", paddingTop: "calc(12px + env(safe-area-inset-top, 0px))", paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))", paddingLeft: 12, paddingRight: 12, boxSizing: "border-box", fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif" }}
      onClick={onClose}
    >
      <div
        style={{ background: "#EFEFEF", width: "100%", maxWidth: 390, maxHeight: "100%", borderRadius: 18, boxShadow: "0 32px 80px rgba(0,0,0,.5)", display: "flex", flexDirection: "column", overflow: "hidden" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ background: C.darkHdr, padding: "13px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <span style={{ color: C.white, fontWeight: 700, fontSize: 15 }}>🎮 Gram — ENGEL Virtual Expert Academy</span>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,.12)", border: "none", color: "#ccc", fontSize: 16, cursor: "pointer", width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
        </div>

        {/* Nawigacja wewnętrzna */}
        <div style={{ display: "flex", background: C.white, borderBottom: `1px solid ${C.grey}`, flexShrink: 0 }}>
          {[
            ["dashboard", "🏠", T.gram_dashboard],
            ["ranking",   "🏆", T.gram_ranking],
          ].map(([v, icon, label]) => (
            <button key={v} onClick={() => setView(v)}
              style={{
                flex: 1, background: "none", border: "none",
                borderBottom: `3px solid ${view === v ? C.green : "transparent"}`,
                padding: "9px 4px", fontSize: 11, fontWeight: 700,
                color: view === v ? C.black : C.greyMid,
                cursor: "pointer", letterSpacing: .3,
                display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
              }}>
              <span style={{ fontSize: 14 }}>{icon}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>

        {/* Treść */}
        <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          {content}
        </div>
      </div>
    </div>
  );

  /* Loading */
  if (loading) return wrap(<div style={{ textAlign: "center", padding: 40 }}><Spinner/></div>);

  /* Ranking */
  if (view === "ranking") return wrap(<Ranking token={token} userId={user.id}/>);

  /* ── DASHBOARD ─────────────────────────────────────────────────────────── */
  const pts = gameData.points || 0;
  const { current: lvl, next: nextLvl, pct: lvlPct } = getLevelInfo(pts);

  // Wszystkie misje powyżej aktualnego poziomu
  const futureLevels = PROG_LEVELS.filter(l => l.pts > pts);
  // Pierwsza misja (najbliższy poziom) trafia do hero
  const heroNextLvl = futureLevels[0] || null;
  // Kolejne dwie trafiają do sekcji T.gram_to_earn
  const missionLevels = futureLevels.slice(1, 3);

  const earnedLevels = PROG_LEVELS.filter(l => pts >= l.pts);

  // Wypełnij siatkę do 12 pól (4×3)
  const badgeGrid = Array.from({ length: 12 }, (_, i) => PROG_LEVELS[i] || null);

  const sectionLabel = (text) => (
    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: .8, color: C.greyMid,
      display: "flex", alignItems: "center", gap: 6 }}>
      {text}
      <div style={{ flex: 1, height: 1, background: C.grey }}/>
    </div>
  );

  return wrap(
    <>
      {/* ── HERO — ciemne tło ── */}
      <div style={{ background: C.black, borderRadius: 12, padding: 16 }}>

        {/* Wiersz: odznaka / poziom+nazwa / punkty */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", background: C.green,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>
            {lvl.badge}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,.4)", fontWeight: 700, letterSpacing: .8, marginBottom: 2 }}>
              POZIOM {lvl.level}
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.white }}>{lvl.label}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: C.green, lineHeight: 1 }}>{pts}</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,.35)", marginTop: 2 }}>punktów</div>
          </div>
        </div>

        {/* Pasek postępu — bez labeli nad nim */}
        <div style={{ height: 8, background: "rgba(255,255,255,.1)", borderRadius: 4, overflow: "hidden", marginBottom: 10 }}>
          <div style={{ height: "100%", width: `${lvlPct}%`, background: C.green, borderRadius: 4, transition: "width .4s ease" }}/>
        </div>

        {/* Następny poziom wbudowany w hero */}
        {heroNextLvl ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10,
            background: "rgba(255,255,255,.06)", border: "0.5px solid rgba(255,255,255,.1)",
            borderRadius: 8, padding: "9px 12px", marginBottom: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: C.greenDk,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 }}>
              {heroNextLvl.badge}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.white, marginBottom: 1 }}>{heroNextLvl.label}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,.35)" }}>Zdobądź {heroNextLvl.pts} pkt</div>
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.green,
              background: "rgba(99,153,34,.2)", padding: "2px 8px", borderRadius: 4 }}>
              {heroNextLvl.pts - pts} pkt
            </div>
          </div>
        ) : (
          <div style={{ textAlign: "center", fontSize: 12, fontWeight: 700, color: C.green, marginBottom: 10 }}>
            🏆 Najwyższy poziom osiągnięty!
          </div>
        )}

        {/* Streak */}
        <div style={{ display: "flex", gap: 8, paddingTop: 10, borderTop: "0.5px solid rgba(255,255,255,.08)" }}>
          <div style={{ background: "rgba(255,255,255,.06)", border: "0.5px solid rgba(255,255,255,.12)",
            borderRadius: 6, padding: "4px 10px", fontSize: 11, color: "rgba(255,255,255,.5)",
            display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.green }}>
              {gameData.streak_current || 0}
            </span> dni z rzędu
          </div>
          <div style={{ background: "rgba(255,255,255,.06)", border: "0.5px solid rgba(255,255,255,.12)",
            borderRadius: 6, padding: "4px 10px", fontSize: 11, color: "rgba(255,255,255,.5)" }}>
            Tydzień 3. cyklu
          </div>
        </div>
      </div>

      {/* ── TIP DNIA — białe tło ── */}
      <button
        onClick={(e) => { e.stopPropagation(); onClose(); window.dispatchEvent(new CustomEvent("gram:goToMessages")); }}
        style={{ background: C.white, border: `0.5px solid ${C.grey}`, borderRadius: 12,
          padding: 14, display: "flex", alignItems: "center", gap: 12, cursor: "pointer",
          width: "100%", textAlign: "left" }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: C.greenBg,
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <circle cx="9" cy="9" r="7" stroke={C.greenDk} strokeWidth="1.5"/>
            <path d="M9 5v5M9 12v1" stroke={C.greenDk} strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.black, marginBottom: 2 }}>Tip dnia czeka +10 pkt</div>
          <div style={{ fontSize: 11, color: C.greyMid }}>Przejdź do Wiadomości</div>
        </div>
        <div style={{ fontSize: 18, color: C.greyMid }}>›</div>
      </button>

      {/* ── DO ZDOBYCIA — białe tło, od drugiej misji ── */}
      {missionLevels.length > 0 && (
        <>
          {sectionLabel(T.gram_to_earn)}
          {missionLevels.map((m, i) => (
            <div key={m.level} style={{ background: C.white, border: `0.5px solid ${C.grey}`,
              borderRadius: 10, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12,
              opacity: i === 0 ? .55 : .3 }}>
              <div style={{ width: 40, height: 40, borderRadius: "50%", background: C.greyBg,
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
                {m.badge}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.black, marginBottom: 2 }}>{m.label}</div>
                <div style={{ fontSize: 11, color: C.greyMid }}>Zdobądź {m.pts} pkt</div>
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.greyMid,
                background: C.greyBg, padding: "2px 8px", borderRadius: 4 }}>
                {m.pts - pts} pkt
              </div>
            </div>
          ))}
        </>
      )}

      {/* ── ZDOBYTE — siatka 4×3 ── */}
      {earnedLevels.length > 0 && (
        <>
          {sectionLabel(T.gram_earned)}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8,
            background: C.white, border: `0.5px solid ${C.grey}`, borderRadius: 12, padding: 12 }}>
            {badgeGrid.map((b, i) => {
              const earned = b && pts >= b.pts;
              return (
                <div key={i} style={{ background: earned ? C.greenBg : C.greyBg,
                  borderRadius: 8, padding: "8px 6px", textAlign: "center",
                  opacity: (!b || !earned) ? .3 : 1 }}>
                  <div style={{ fontSize: 20 }}>{b ? b.badge : "·"}</div>
                  <div style={{ fontSize: 9, fontWeight: 700, marginTop: 3, lineHeight: 1.2,
                    color: earned ? C.greenDk : C.greyMid }}>
                    {b ? b.label : "—"}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── ZDOBYWAJ PUNKTY — białe tło ── */}
      {sectionLabel(T.gram_earn_points)}
      <div style={{ background: C.white, border: `0.5px solid ${C.grey}`, borderRadius: 12,
        padding: "12px 14px", display: "flex", flexDirection: "column" }}>
        {[
          { text: T.gram_tip_daily, pts: T.gram_pts_10 },
          { text: T.gram_quiz_weekly,   pts: T.gram_pts_90 },
          { text: T.gram_rewards,           pts: "—", dim: true },
        ].map(({ text, pts: p, dim }, i, arr) => (
          <div key={text} style={{ display: "flex", alignItems: "center", gap: 10,
            padding: "9px 0", borderBottom: i < arr.length - 1 ? `0.5px solid ${C.grey}` : "none",
            opacity: dim ? .4 : 1 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.green, flexShrink: 0 }}/>
            <div style={{ flex: 1, fontSize: 13, color: C.black }}>{text}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.greenDk }}>{p}</div>
          </div>
        ))}
      </div>
    </>
  );
}
