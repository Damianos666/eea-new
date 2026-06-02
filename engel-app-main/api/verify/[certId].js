// ─────────────────────────────────────────────────────────────────────────────
// VERIFY — Vercel Serverless Function
// Route: /verify/:certId  (np. /verify/15A0724T569Z)
//
// Dlaczego serverless zamiast React SPA?
//   • Zero bundle React (~600KB) — odpowiedź to czysty HTML
//   • Vercel Edge cache — drugi i kolejne requesty: ~50ms
//   • Zapytanie do Supabase idzie z serwera Vercel (blisko Supabase EU)
//     zamiast z przeglądarki użytkownika (np. z telefonu w Azji)
//   • Supabase "cold start" po pauzie = niewidoczny dla użytkownika
//     (serwer czeka, przeglądarka dostaje gotowy HTML)
// ─────────────────────────────────────────────────────────────────────────────

const SB_URL  = process.env.VITE_SUPABASE_URL;
const SB_ANON = process.env.VITE_SUPABASE_ANON_KEY;
const ENGEL_ORG_ID = "76790490";

// ─── Supabase fetch ───────────────────────────────────────────────────────────
async function fetchCert(certId) {
  const query = new URLSearchParams({
    cert_id: `eq.${certId}`,
    select:  "cert_id,date,training_data,trainer,created_at,user_display_name",
  });
  const r = await fetch(`${SB_URL}/rest/v1/completions?${query}`, {
    headers: {
      "apikey":        SB_ANON,
      "Authorization": `Bearer ${SB_ANON}`,
    },
  });
  if (!r.ok) return null;
  const rows = await r.json();
  return rows[0] || null;
}

// ─── LinkedIn deep-link ───────────────────────────────────────────────────────
function buildLinkedInUrl(cert, certUrl) {
  const training = cert.training_data || {};
  const [dd, mm, yyyy] = (cert.date || "").split(".");
  const params = new URLSearchParams({
    startTask:      "CERTIFICATION_NAME",
    name:           training.title || "",
    organizationId: ENGEL_ORG_ID,
    issueYear:      yyyy || "",
    issueMonth:     String(parseInt(mm || "1", 10)),
    certId:         cert.cert_id,
    certUrl,
  });
  return `https://www.linkedin.com/profile/add?${params}`;
}

// ─── HTML helpers ─────────────────────────────────────────────────────────────
const esc = s => String(s ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

function field(label, value) {
  if (!value) return "";
  return `
    <div class="field">
      <div class="field-label">${esc(label)}</div>
      <div class="field-value">${esc(value)}</div>
    </div>`;
}

// ─── HTML templates ───────────────────────────────────────────────────────────
function htmlValid(cert, certUrl) {
  const training  = cert.training_data || {};
  const category  = [training.category, training.duration].filter(Boolean).join(" · ");
  const linkedIn  = buildLinkedInUrl(cert, certUrl);
  const today     = new Date().toLocaleDateString("pl-PL");

  return `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Certyfikat ${esc(cert.cert_id)} – ENGEL Expert Academy</title>
  <meta name="description" content="Weryfikacja certyfikatu ENGEL Expert Academy – ${esc(training.title || "")}"/>
  <meta property="og:title" content="Certyfikat – ENGEL Expert Academy"/>
  <meta property="og:description" content="${esc(training.title || "")} · ${esc(cert.date || "")}"/>
  <meta name="robots" content="noindex,nofollow"/>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100vh;
      background: #F5F5F5;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 32px 16px;
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      color: #1A1A1A;
    }
    .card {
      background: #fff;
      max-width: 460px;
      width: 100%;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 4px 24px rgba(0,0,0,.08);
    }
    .card-header {
      background: #1A1A1A;
      padding: 20px 28px;
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .card-header img { height: 24px; mix-blend-mode: screen; }
    .card-header-sub { color: #aaa; font-size: 10px; letter-spacing: 2px; margin-top: 2px; }
    .card-header-title { color: #fff; font-size: 12px; font-weight: 600; }
    .green-bar { height: 4px; background: #8AB73E; }
    .card-body { padding: 28px 28px 0; }
    .status-row { display: flex; align-items: center; gap: 16px; margin-bottom: 28px; }
    .status-text-main { font-size: 18px; font-weight: 700; color: #8AB73E; }
    .status-text-sub  { font-size: 12px; color: #999; margin-top: 2px; }
    .divider { height: 1px; background: #E5E5E5; margin-bottom: 24px; }
    .field { margin-bottom: 16px; }
    .field-label { font-size: 9px; font-weight: 700; letter-spacing: 3px; color: #999; margin-bottom: 4px; text-transform: uppercase; }
    .field-value { font-size: 15px; font-weight: 600; }
    .cert-num-box {
      margin-top: 8px;
      background: #F5F5F5;
      padding: 14px 18px;
      border-radius: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .cert-num-label { font-size: 9px; font-weight: 700; letter-spacing: 3px; color: #999; text-transform: uppercase; margin-bottom: 4px; }
    .cert-num-value { font-family: monospace; font-size: 16px; font-weight: 700; letter-spacing: 1px; }
    .badge {
      background: #8AB73E;
      color: #fff;
      font-size: 10px;
      font-weight: 700;
      padding: 6px 12px;
      border-radius: 20px;
      letter-spacing: 1px;
    }
    .card-footer {
      padding: 20px 28px 28px;
      margin-top: 8px;
      font-size: 11px;
      color: #999;
      line-height: 1.6;
      border-top: 1px solid #E5E5E5;
      margin: 8px 28px 0;
      padding: 16px 0 28px;
    }
    .linkedin-section { margin-top: 20px; text-align: center; }
    .linkedin-hint { font-size: 12px; color: #999; margin-bottom: 10px; }
    .linkedin-btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: #0A66C2;
      color: #fff;
      padding: 11px 22px;
      font-size: 13px;
      font-weight: 600;
      text-decoration: none;
      border-radius: 8px;
    }
    .back-link { margin-top: 24px; font-size: 12px; color: #999; text-decoration: none; }
    svg { flex-shrink: 0; }
  </style>
</head>
<body>

  <div class="card">
    <div class="card-header">
      <img src="/logo.png" alt="ENGEL"/>
      <div>
        <div class="card-header-sub">EXPERT ACADEMY</div>
        <div class="card-header-title">Weryfikacja certyfikatu</div>
      </div>
    </div>
    <div class="green-bar"></div>

    <div class="card-body">
      <div class="status-row">
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
          <circle cx="24" cy="24" r="24" fill="#8AB73E" opacity="0.12"/>
          <circle cx="24" cy="24" r="18" fill="#8AB73E" opacity="0.2"/>
          <path d="M14 24l8 8 12-14" stroke="#8AB73E" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <div>
          <div class="status-text-main">Certyfikat ważny</div>
          <div class="status-text-sub">Dokument zweryfikowany w bazie ENGEL Expert Academy</div>
        </div>
      </div>

      <div class="divider"></div>

      ${field("Uczestnik",       cert.user_display_name)}
      ${field("Szkolenie",       training.title)}
      ${field("Kategoria",       category)}
      ${field("Data ukończenia", cert.date)}
      ${field("Trener",          cert.trainer)}

      <div class="cert-num-box">
        <div>
          <div class="cert-num-label">Nr certyfikatu</div>
          <div class="cert-num-value">${esc(cert.cert_id)}</div>
        </div>
        <div class="badge">WAŻNY</div>
      </div>
    </div>

    <div class="card-footer">
      Certyfikat wydany przez <strong>ENGEL Expert Academy</strong>.
      Weryfikacja przeprowadzona automatycznie na podstawie zaszyfrowanego numeru certyfikatu.
      Data weryfikacji: <strong>${esc(today)}</strong>.
    </div>
  </div>

  <div class="linkedin-section">
    <div class="linkedin-hint">Jesteś właścicielem tego certyfikatu?</div>
    <a href="${esc(linkedIn)}" target="_blank" rel="noopener noreferrer" class="linkedin-btn">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
      </svg>
      Dodaj do profilu LinkedIn
    </a>
  </div>

  <a href="/" class="back-link">← ENGEL Expert Academy</a>

</body>
</html>`;
}

function htmlInvalid(certId) {
  return `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Certyfikat nie istnieje – ENGEL Expert Academy</title>
  <meta name="robots" content="noindex,nofollow"/>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100vh;
      background: #F5F5F5;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 32px 16px;
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    }
    .card {
      background: #fff;
      max-width: 420px;
      width: 100%;
      border-radius: 16px;
      padding: 40px;
      text-align: center;
      box-shadow: 0 4px 24px rgba(0,0,0,.08);
    }
    h1 { font-size: 20px; font-weight: 700; color: #1A1A1A; margin-top: 20px; }
    p  { font-size: 13px; color: #999; margin-top: 8px; line-height: 1.6; }
    .cert-id { font-family: monospace; font-weight: 700; color: #1A1A1A; }
    .hint { margin-top: 16px; font-size: 12px; color: #999; }
    a.btn {
      display: inline-block;
      margin-top: 24px;
      background: #1A1A1A;
      color: #fff;
      padding: 12px 28px;
      font-size: 13px;
      font-weight: 600;
      text-decoration: none;
      border-radius: 8px;
    }
    .back-link { margin-top: 24px; font-size: 12px; color: #999; text-decoration: none; display: block; }
  </style>
</head>
<body>
  <div class="card">
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="24" fill="#C0392B" opacity="0.1"/>
      <circle cx="24" cy="24" r="18" fill="#C0392B" opacity="0.15"/>
      <path d="M16 16l16 16M32 16L16 32" stroke="#C0392B" stroke-width="3" stroke-linecap="round"/>
    </svg>
    <h1>Certyfikat nie istnieje</h1>
    <p>Numer certyfikatu <span class="cert-id">${esc(certId || "—")}</span> nie został znaleziony w bazie ENGEL Expert Academy.</p>
    <p class="hint">Jeśli uważasz że to błąd, skontaktuj się z organizatorem szkolenia.</p>
    <a href="/" class="btn">Wróć do strony głównej</a>
  </div>
</body>
</html>`;
}

function htmlError() {
  return `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Błąd – ENGEL Expert Academy</title>
  <meta name="robots" content="noindex,nofollow"/>
  <style>
    body { min-height:100vh; background:#F5F5F5; display:flex; align-items:center; justify-content:center; padding:32px 16px; font-family:'Helvetica Neue',Helvetica,Arial,sans-serif; }
    .card { background:#fff; max-width:420px; width:100%; border-radius:16px; padding:40px; text-align:center; box-shadow:0 4px 24px rgba(0,0,0,.08); }
    h1 { font-size:20px; font-weight:700; margin-top:20px; }
    p  { font-size:13px; color:#999; margin-top:8px; }
    button { margin-top:24px; background:#1A1A1A; border:none; color:#fff; padding:12px 28px; font-size:13px; font-weight:600; cursor:pointer; border-radius:8px; }
  </style>
</head>
<body>
  <div class="card">
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="24" fill="#C0392B" opacity="0.1"/>
      <circle cx="24" cy="24" r="18" fill="#C0392B" opacity="0.15"/>
      <path d="M16 16l16 16M32 16L16 32" stroke="#C0392B" stroke-width="3" stroke-linecap="round"/>
    </svg>
    <h1>Błąd połączenia</h1>
    <p>Nie udało się połączyć z bazą danych. Spróbuj ponownie za chwilę.</p>
    <button onclick="location.reload()">Spróbuj ponownie</button>
  </div>
</body>
</html>`;
}

// ─── Handler ──────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const certId = req.query.certId?.trim();

  // Brak certId w URL
  if (!certId) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.status(400).send(htmlInvalid(""));
    return;
  }

  let cert;
  try {
    cert = await fetchCert(certId);
  } catch {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.status(502).send(htmlError());
    return;
  }

  if (!cert) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.status(404).send(htmlInvalid(certId));
    return;
  }

  // Ważny certyfikat — cache na Vercel Edge przez 5 minut
  // (cert_id jest immutable — raz wystawiony nie zmienia treści)
  const certUrl = `https://engelexpert.academy/verify/${certId}`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");
  res.status(200).send(htmlValid(cert, certUrl));
}
