import { useState, useRef } from "react";
import { C, GROUPS, TRAINERS } from "../../lib/constants";
import { TRAININGS } from "../../data/trainings";
import { edge } from "../../lib/supabase";
import { useUser } from "../../lib/UserContext";

export function AdminCodeGen({ defaultTrainer }) {
  const { token } = useUser();
  const [mode,        setMode]        = useState("normal");
  const [selGroup,    setSelGroup]    = useState(GROUPS[0].id);
  const [selTraining, setSelTraining] = useState(TRAININGS.find(t => t.group === GROUPS[0].id)?.id || TRAININGS[0].id);
  const [selTrainer,  setSelTrainer]  = useState(defaultTrainer ? Number(defaultTrainer) : 1);
  const [loading,     setLoading]     = useState(false);
  const [err,         setErr]         = useState("");
  const [result,      setResult]      = useState(null);
  const [qrDataUrl,   setQrDataUrl]   = useState(null);
  const [copied,      setCopied]      = useState(false);
  const [specialTitle, setSpecialTitle] = useState("");
  const [specialDays,  setSpecialDays]  = useState(1);

  function handleGroupChange(gid) {
    setSelGroup(gid);
    const first = TRAININGS.find(t => t.group === gid);
    if (first) setSelTraining(first.id);
  }

  async function generateCode() {
    setLoading(true); setErr(""); setResult(null); setQrDataUrl(null);
    try {
      const training = TRAININGS.find(t => t.id === selTraining);
      const short    = mode === "special" ? "ST" : (training?.short || selTraining);
      const days     = mode === "special" ? specialDays : null;
      const data     = await edge.generateCode(token, short, selTrainer, mode === "special", specialTitle, days);
      // Append days to verifyUrl so the scanner can read it
      const appUrl   = import.meta.env.VITE_APP_URL || window.location.origin;
      const params   = new URLSearchParams();
      if (mode === "special" && specialTitle) params.set("title", specialTitle);
      if (mode === "special" && days)         params.set("days",  days);
      const query    = params.toString() ? `?${params.toString()}` : "";
      const verifyUrl = `${appUrl}/verify/${data.code}${query}`;
      setResult({ ...data, verifyUrl });
      const QRCode = await import("qrcode");
      const dataUrl = await QRCode.default.toDataURL(verifyUrl, {
        width: 320, margin: 2,
        color: { dark: "#1A1A1A", light: "#FFFFFF" },
      });
      setQrDataUrl(dataUrl);
    } catch (e) {
      setErr(e.message || "Błąd generowania kodu");
    } finally {
      setLoading(false);
    }
  }

  function copyCode() {
    if (!result?.code) return;
    navigator.clipboard.writeText(result.code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const groupTrainings   = TRAININGS.filter(t => t.group === selGroup);
  const selectedTraining = TRAININGS.find(t => t.id === selTraining);
  const today = new Date().toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit", year: "numeric" });

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ background: C.white, padding: 18, borderTop: `3px solid ${C.green}` }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: C.greyDk, marginBottom: 14, textTransform: "uppercase" }}>
          Generator kodów QR
        </div>

        <div style={{ display: "flex", gap: 0, marginBottom: 18, border: `1px solid ${C.grey}`, overflow: "hidden" }}>
          {[["normal", "📋 Standardowe"], ["special", "⭐ Specjalne (ST)"]].map(([val, label]) => (
            <button key={val} onClick={() => { setMode(val); setResult(null); setQrDataUrl(null); setSpecialTitle(""); }}
              style={{ flex: 1, padding: "9px 0", fontSize: 11, fontWeight: 700, cursor: "pointer", border: "none",
                background: mode === val ? C.black : C.white, color: mode === val ? C.white : C.greyDk }}>
              {label}
            </button>
          ))}
        </div>

        {mode === "normal" && (
          <>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.greyDk, marginBottom: 8, letterSpacing: .5 }}>KROK 1 — KATEGORIA</label>
              <select value={selGroup} onChange={e => handleGroupChange(e.target.value)}
                style={{ width: "100%", padding: "11px 14px", fontSize: 13, border: `1.5px solid ${C.green}`, background: C.white, color: C.black, cursor: "pointer" }}>
                {GROUPS.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.greyDk, marginBottom: 8, letterSpacing: .5 }}>KROK 2 — SZKOLENIE</label>
              <select value={selTraining} onChange={e => setSelTraining(e.target.value)}
                style={{ width: "100%", padding: "11px 14px", fontSize: 13, border: `1.5px solid ${C.green}`, background: C.white, color: C.black, cursor: "pointer" }}>
                {groupTrainings.map(t => <option key={t.id} value={t.id}>{t.short} — {t.title}</option>)}
              </select>
            </div>
          </>
        )}

        {mode === "special" && (
          <>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.greyDk, marginBottom: 8, letterSpacing: .5 }}>
                KROK 1 — NAZWA SZKOLENIA *
              </label>
              <input
                value={specialTitle}
                onChange={e => setSpecialTitle(e.target.value)}
                placeholder="np. Szkolenie specjalne z obsługi"
                style={{ width: "100%", padding: "11px 14px", fontSize: 13, border: `1.5px solid ${C.green}`, background: C.white, color: C.black, outline: "none", boxSizing: "border-box" }}
              />
              <div style={{ fontSize: 11, color: C.greyMid, marginTop: 5 }}>
                Nazwa zostanie zakodowana w QR — uczestnik nie musi jej wpisywać.
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.greyDk, marginBottom: 8, letterSpacing: .5 }}>
                KROK 2 — LICZBA DNI
              </label>
              <div style={{ display: "flex", gap: 6 }}>
                {[1, 2, 3, 4, 5].map(d => (
                  <button key={d} onClick={() => setSpecialDays(d)}
                    style={{ flex: 1, padding: "10px 0", fontSize: 14, fontWeight: 700, cursor: "pointer",
                      border: `1.5px solid ${specialDays === d ? C.green : C.grey}`,
                      background: specialDays === d ? C.green : C.white,
                      color: specialDays === d ? C.white : C.greyDk, borderRadius: 4 }}>
                    {d}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 11, color: C.greyMid, marginTop: 5 }}>
                Liczba dni zostanie zakodowana w QR i automatycznie przypisana uczestnikowi.
              </div>
            </div>
          </>
        )}

        <div style={{ marginBottom: 18 }}>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.greyDk, marginBottom: 8, letterSpacing: .5 }}>
            {mode === "normal" ? "KROK 3" : "KROK 3"} — TRENER
          </label>
          <select value={selTrainer} onChange={e => setSelTrainer(Number(e.target.value))}
            style={{ width: "100%", padding: "11px 14px", fontSize: 13, border: `1.5px solid ${C.green}`, background: C.white, color: C.black, cursor: "pointer" }}>
            {Object.entries(TRAINERS).map(([num, name]) => <option key={num} value={num}>{name}</option>)}
          </select>
        </div>

        <button onClick={generateCode} disabled={loading || (mode === "special" && !specialTitle.trim())}
          style={{ width: "100%", background: (loading || (mode === "special" && !specialTitle.trim())) ? C.greyDk : C.black, border: "none", color: C.white,
            padding: 14, fontSize: 14, fontWeight: 700, cursor: (loading || (mode === "special" && !specialTitle.trim())) ? "not-allowed" : "pointer", marginBottom: 8 }}>
          {loading ? "Generuję..." : "🔑 Generuj kod QR"}
        </button>

        {err && <div style={{ color: C.red, fontSize: 12, paddingTop: 8 }}>{err}</div>}
      </div>

      {result && qrDataUrl && (
        <div style={{ background: C.white, border: `3px solid ${C.green}`, padding: 20, textAlign: "center" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.greyDk, letterSpacing: 1, marginBottom: 4, textTransform: "uppercase" }}>
            {mode === "special" ? `Szkolenie specjalne (ST) — ${result.specialTitle || specialTitle}` : selectedTraining?.title}
          </div>
          <div style={{ fontSize: 11, color: C.greyMid, marginBottom: 16 }}>
            📅 {today} · 👤 {TRAINERS[selTrainer]}{mode === "special" ? ` · 📆 ${specialDays} ${specialDays === 1 ? "dzień" : "dni"}` : ""}
          </div>

          <img src={qrDataUrl} alt="QR kod szkolenia"
            style={{ width: 280, height: 280, display: "block", margin: "0 auto 20px", imageRendering: "pixelated" }}/>

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
            <div style={{ flex: 1, height: 1, background: C.grey }}/>
            <span style={{ fontSize: 11, color: C.greyMid, whiteSpace: "nowrap" }}>lub wpisz kod ręcznie</span>
            <div style={{ flex: 1, height: 1, background: C.grey }}/>
          </div>

          <div style={{ fontFamily: "monospace", fontSize: 26, fontWeight: 700, letterSpacing: 4, color: C.black, marginBottom: 12, wordBreak: "break-all" }}>
            {result.code}
          </div>

          <button onClick={copyCode} style={{
            background: copied ? C.green : C.greyBg, color: copied ? C.white : C.greyDk,
            border: `1px solid ${copied ? C.green : C.grey}`, padding: "8px 20px",
            fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all .2s",
          }}>
            {copied ? "✓ Skopiowano" : "Kopiuj kod"}
          </button>

          <div style={{ fontSize: 11, color: C.greyMid, marginTop: 14, lineHeight: 1.6 }}>
            ⏱ Ważny tylko dziś (±1 dzień na strefy czasowe)<br/>
            🔒 Podpisany kryptograficznie — nie do podrobienia
          </div>
        </div>
      )}

    </div>
  );
}
