// ─────────────────────────────────────────────────────────────────────────────
// VERIFY PAGE — publiczna strona weryfikacji certyfikatu
// URL: /verify/:certId   np. /verify/17A0921K9X7M2
//
// Dostęp: bez logowania (anon key Supabase)
// Dane: tabela `completions` z kolumną cert_id (dodaj przez SQL w Supabase)
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";

const SB_URL  = import.meta.env.VITE_SUPABASE_URL;
const SB_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

const C = {
  black:   "#1A1A1A",
  white:   "#FFFFFF",
  green:   "#8AB73E",
  greenDk: "#5A8020",
  grey:    "#E5E5E5",
  greyBg:  "#F5F5F5",
  greyMid: "#999999",
  greyDk:  "#686868",
  red:     "#C0392B",
};

// Pobiera dane certyfikatu z Supabase (anon — bez tokenu)
async function fetchCert(certId) {
  const query = new URLSearchParams({
    cert_id: `eq.${certId}`,
    select:  "cert_id,date,training_data,trainer,created_at,user_id",
  });
  const r = await fetch(`${SB_URL}/rest/v1/completions?${query}`, {
    headers: {
      "apikey":        SB_ANON,
      "Authorization": `Bearer ${SB_ANON}`,
    },
  });
  if (!r.ok) throw new Error("Błąd połączenia z bazą danych.");
  const rows = await r.json();
  if (!rows.length) return null;
  const cert = rows[0];

  // Pobierz aktualną nazwę z profilu (zawsze świeża)
  if (cert.user_id) {
    try {
      const pq = new URLSearchParams({ id: `eq.${cert.user_id}`, select: "name" });
      const pr = await fetch(`${SB_URL}/rest/v1/cert_participant_names?${pq}`, {
        headers: { "apikey": SB_ANON, "Authorization": `Bearer ${SB_ANON}` },
      });
      if (pr.ok) {
        const profiles = await pr.json();
        cert.participant_name = profiles[0]?.name || null;
      }
    } catch { cert.participant_name = null; }
  }

  return cert;
}

// Ikona checkmark (SVG)
function CheckIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="24" fill={C.green} opacity="0.12"/>
      <circle cx="24" cy="24" r="18" fill={C.green} opacity="0.2"/>
      <path d="M14 24l8 8 12-14" stroke={C.green} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// Ikona X (błąd)
function CrossIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="24" fill={C.red} opacity="0.1"/>
      <circle cx="24" cy="24" r="18" fill={C.red} opacity="0.15"/>
      <path d="M16 16l16 16M32 16L16 32" stroke={C.red} strokeWidth="3" strokeLinecap="round"/>
    </svg>
  );
}

function Field({ label, value }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: C.greyMid, marginBottom: 4, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: C.black }}>
        {value}
      </div>
    </div>
  );
}

export function VerifyPage() {
  // Wyciągnij certId z URL: /verify/17A0921K9X7M2
  const certId = window.location.pathname.split("/verify/")[1]?.trim();

  const [status, setStatus] = useState("loading"); // "loading" | "valid" | "invalid" | "error"
  const [cert,   setCert]   = useState(null);

  useEffect(() => {
    if (!certId) { setStatus("invalid"); return; }
    fetchCert(certId)
      .then(data => {
        if (!data) { setStatus("invalid"); return; }
        setCert(data);
        setStatus("valid");
      })
      .catch(() => setStatus("error"));
  }, [certId]);

  const containerStyle = {
    minHeight:      "100vh",
    background:     C.greyBg,
    display:        "flex",
    flexDirection:  "column",
    alignItems:     "center",
    justifyContent: "center",
    padding:        "32px 16px",
    fontFamily:     "'Helvetica Neue', Helvetica, Arial, sans-serif",
  };

  // ── ŁADOWANIE ──────────────────────────────────────────────────────────────
  if (status === "loading") {
    return (
      <div style={containerStyle}>
        <span style={{ width: 32, height: 32, border: `3px solid ${C.grey}`, borderTopColor: C.green, borderRadius: "50%", display: "inline-block", animation: "spin .8s linear infinite" }}/>
        <div style={{ marginTop: 16, color: C.greyMid, fontSize: 14 }}>Weryfikacja certyfikatu…</div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  // ── BŁĄD POŁĄCZENIA ────────────────────────────────────────────────────────
  if (status === "error") {
    return (
      <div style={containerStyle}>
        <div style={{ background: C.white, maxWidth: 420, width: "100%", borderRadius: 16, padding: 40, textAlign: "center", boxShadow: "0 4px 24px rgba(0,0,0,.08)" }}>
          <CrossIcon/>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.black, marginTop: 20 }}>Błąd połączenia</div>
          <div style={{ fontSize: 13, color: C.greyMid, marginTop: 8 }}>
            Nie udało się połączyć z bazą danych. Spróbuj ponownie za chwilę.
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: 24, background: C.black, border: "none", color: C.white, padding: "12px 28px", fontSize: 13, fontWeight: 600, cursor: "pointer", borderRadius: 8 }}>
            Spróbuj ponownie
          </button>
        </div>
      </div>
    );
  }

  // ── NIEWAŻNY / NIE ZNALEZIONO ──────────────────────────────────────────────
  if (status === "invalid") {
    return (
      <div style={containerStyle}>
        <div style={{ background: C.white, maxWidth: 420, width: "100%", borderRadius: 16, padding: 40, textAlign: "center", boxShadow: "0 4px 24px rgba(0,0,0,.08)" }}>
          <CrossIcon/>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.black, marginTop: 20 }}>Certyfikat nie istnieje</div>
          <div style={{ fontSize: 13, color: C.greyMid, marginTop: 8, lineHeight: 1.6 }}>
            Numer certyfikatu <strong style={{ fontFamily: "monospace" }}>{certId || "—"}</strong> nie został znaleziony w bazie ENGEL Expert Academy.
          </div>
          <div style={{ marginTop: 16, fontSize: 12, color: C.greyMid }}>
            Jeśli uważasz że to błąd, skontaktuj się z organizatorem szkolenia.
          </div>
          <a href="/" style={{ display: "inline-block", marginTop: 24, background: C.black, color: C.white, padding: "12px 28px", fontSize: 13, fontWeight: 600, textDecoration: "none", borderRadius: 8 }}>
            Wróć do strony głównej
          </a>
        </div>
      </div>
    );
  }

  // ── WAŻNY CERTYFIKAT ───────────────────────────────────────────────────────
  const training = cert.training_data || {};

  // Formatowanie daty z "DD.MM.YYYY" → "DD.MM.YYYY" (już jest OK)
  // lub z ISO (jeśli kiedyś zmienisz format w bazie)
  const dateDisplay = cert.date || "—";

  return (
    <div style={containerStyle}>

      {/* Karta certyfikatu */}
      <div style={{ background: C.white, maxWidth: 460, width: "100%", borderRadius: 16, overflow: "hidden", boxShadow: "0 4px 24px rgba(0,0,0,.08)" }}>

        {/* Header */}
        <div style={{ background: "#1A1A1A", padding: "20px 28px", display: "flex", alignItems: "center", gap: 16 }}>
          <img src="/logo-header.png" alt="ENGEL" style={{ height: 24, mixBlendMode: "screen" }}/>
          <div>
            <div style={{ color: "#aaa", fontSize: 10, letterSpacing: 2 }}>EXPERT ACADEMY</div>
            <div style={{ color: "#fff", fontSize: 12, fontWeight: 600, marginTop: 2 }}>Weryfikacja certyfikatu</div>
          </div>
        </div>

        {/* Zielony pasek */}
        <div style={{ height: 4, background: C.green }}/>

        {/* Status badge */}
        <div style={{ padding: "28px 28px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28 }}>
            <CheckIcon/>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color: C.green }}>Certyfikat ważny</div>
              <div style={{ fontSize: 12, color: C.greyMid, marginTop: 2 }}>Dokument zweryfikowany w bazie ENGEL Expert Academy</div>
            </div>
          </div>

          {/* Separator */}
          <div style={{ height: 1, background: C.grey, marginBottom: 24 }}/>

          {/* Dane */}
          {cert.participant_name && (
            <Field label="Uczestnik" value={cert.participant_name}/>
          )}
          <Field label="Szkolenie" value={training.title || "—"}/>
          {training.category && (
            <Field label="Kategoria" value={`${training.category}${training.duration ? ` · ${training.duration}` : ""}`}/>
          )}
          <Field label="Data ukończenia" value={dateDisplay}/>
          {cert.trainer && (
            <Field label="Trener" value={cert.trainer}/>
          )}

          {/* Nr certyfikatu */}
          <div style={{ marginTop: 8, background: C.greyBg, padding: "14px 18px", borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 3, color: C.greyMid, textTransform: "uppercase", marginBottom: 4 }}>Nr certyfikatu</div>
              <div style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 700, color: C.black, letterSpacing: 1 }}>{cert.cert_id}</div>
            </div>
            <div style={{ background: C.green, color: C.white, fontSize: 10, fontWeight: 700, padding: "6px 12px", borderRadius: 20, letterSpacing: 1 }}>
              WAŻNY
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: "20px 28px 28px", marginTop: 8 }}>
          <div style={{ fontSize: 11, color: C.greyMid, lineHeight: 1.6, borderTop: `1px solid ${C.grey}`, paddingTop: 16 }}>
            Certyfikat wydany przez <strong>ENGEL Expert Academy</strong>. Weryfikacja przeprowadzona automatycznie na podstawie zaszyfrowanego numeru certyfikatu. Data weryfikacji: <strong>{new Date().toLocaleDateString("pl-PL")}</strong>.
          </div>
        </div>
      </div>

      {/* Link powrotu */}
      <div style={{ marginTop: 24 }}>
        <a href="/" style={{ fontSize: 12, color: C.greyMid, textDecoration: "none" }}>
          ← ENGEL Expert Academy
        </a>
      </div>

    </div>
  );
}
