import { C } from "../lib/constants";
import { getLevelInfo } from "../lib/gamification";
import { getQuizMessage } from "../lib/messages";

// ─── Modal wyniku quizu tygodniowego ─────────────────────────────────────────
// Używany w:
//   MessagesTab.jsx  — po ukończeniu WeeklyQuizBanner
//   GramTab.jsx      — po ukończeniu WeeklyQuiz (faza "result")
//
// Props:
//   result     — { pct, points, basePoints, timeBonus, correct, total }
//   totalPoints — łączna liczba punktów użytkownika PO zapisaniu wyniku
//   onClose    — funkcja zamykająca modal

export function QuizRewardModal({ result, totalPoints, onClose }) {
  const { pct, points, basePoints, timeBonus, correct, total } = result;
  const { current: lvl, next: nextLvl } = getLevelInfo(totalPoints);
  const ptsToNext = nextLvl ? nextLvl.pts - totalPoints : 0;
  const lvlProgress = nextLvl
    ? Math.min(100, Math.round(((totalPoints - lvl.pts) / (nextLvl.pts - lvl.pts)) * 100))
    : 100;

  const message = getQuizMessage(pct);

  // Ikona trofeum zależna od wyniku
  const trophy = pct >= 90 ? "🏆" : pct >= 70 ? "🥈" : pct >= 50 ? "🥉" : "📚";

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,.6)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
        fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 340,
          background: C.white,
          borderRadius: 18,
          padding: "28px 24px 24px",
          boxShadow: "0 24px 60px rgba(0,0,0,.3)",
        }}
      >
        {/* Trofeum + punkty */}
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 44, marginBottom: 10, lineHeight: 1 }}>{trophy}</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.black, marginBottom: 4 }}>
            +{points} punktów!
          </div>
          <div style={{ fontSize: 13, color: C.greyMid }}>
            Quiz tygodniowy ukończony · {correct}/{total} poprawnych
          </div>
        </div>

        {/* Rozbicie punktów */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <div style={{
            flex: 1, background: C.greyBg, borderRadius: 10,
            padding: "12px", textAlign: "center",
            border: `0.5px solid ${C.grey}`,
          }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: C.greenDk, marginBottom: 2 }}>+{basePoints}</div>
            <div style={{ fontSize: 11, color: C.greyMid }}>za odpowiedzi</div>
          </div>
          <div style={{
            flex: 1, borderRadius: 10, padding: "12px", textAlign: "center",
            background: timeBonus > 0 ? C.greenBg : C.greyBg,
            border: `0.5px solid ${timeBonus > 0 ? C.green : C.grey}`,
          }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: timeBonus > 0 ? C.greenDk : C.greyMid, marginBottom: 2 }}>
              +{timeBonus}
            </div>
            <div style={{ fontSize: 11, color: timeBonus > 0 ? C.greenDk : C.greyMid }}>bonus czasowy</div>
          </div>
        </div>

        {/* Poziom + pasek postępu */}
        <div style={{
          background: C.greyBg, borderRadius: 12,
          padding: "14px 16px", marginBottom: 16,
          border: `0.5px solid ${C.grey}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{
                width: 36, height: 36, borderRadius: "50%", background: C.greenBg,
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
              }}>
                {lvl.badge}
              </div>
              <div>
                <div style={{ fontSize: 11, color: C.greyMid, fontWeight: 600, letterSpacing: .4, marginBottom: 1 }}>
                  POZIOM {lvl.level}
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.black }}>{lvl.label}</div>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: C.greenDk, lineHeight: 1 }}>{totalPoints}</div>
              <div style={{ fontSize: 11, color: C.greyMid, marginTop: 2 }}>punktów</div>
            </div>
          </div>

          <div style={{ height: 6, background: C.grey, borderRadius: 3, overflow: "hidden", marginBottom: 8 }}>
            <div style={{
              height: "100%", width: `${lvlProgress}%`,
              background: C.green, borderRadius: 3, transition: "width .5s ease",
            }}/>
          </div>

          {nextLvl ? (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 12, color: C.greyMid }}>
                Następny: <span style={{ color: C.black, fontWeight: 700 }}>{nextLvl.badge} {nextLvl.label}</span>
              </div>
              <div style={{
                fontSize: 12, fontWeight: 700, color: C.greenDk,
                background: C.greenBg, padding: "3px 10px", borderRadius: 4,
              }}>
                {ptsToNext} pkt
              </div>
            </div>
          ) : (
            <div style={{ textAlign: "center", fontSize: 13, fontWeight: 700, color: C.green }}>
              🏆 Najwyższy poziom osiągnięty!
            </div>
          )}
        </div>

        {/* Hasło motywujące */}
        <div style={{
          textAlign: "center", fontSize: 13, color: C.greyDk,
          lineHeight: 1.6, marginBottom: 18,
        }}>
          {message}
        </div>

        {/* Przycisk */}
        <button
          onClick={onClose}
          style={{
            width: "100%", padding: 13,
            background: C.black, border: "none",
            color: C.white, fontSize: 14, fontWeight: 700,
            cursor: "pointer", borderRadius: 10,
          }}
        >
          Zamknij
        </button>
      </div>
    </div>
  );
}
