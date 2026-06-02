import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { C, LVL_LABEL } from "../lib/constants";
import { Confetti } from "./SharedUI";
import { useT } from "../lib/LangContext";
import { useUser } from "../lib/UserContext";
import { useToast } from "../lib/ToastContext";
import { err as logErr } from "../lib/logger";

// certGenerator ładowany tylko gdy użytkownik klika "Pobierz PDF"
// dzięki temu @react-pdf/renderer (~1.5MB) nie trafia do głównego bundla
async function loadAndGenerate(args) {
  const { generateCertificate } = await import("../lib/certGenerator");
  return generateCertificate(args);
}

const LOGO_URL = "/logo.png";

// ─── LINKEDIN DEEP LINK ───────────────────────────────────────────────────────
// Otwiera LinkedIn z pre-wypełnionym formularzem "Dodaj certyfikat".
// organizationId: ID firmy ENGEL na LinkedIn (https://linkedin.com/company/76790490)
const ENGEL_LINKEDIN_ORG_ID = "76790490";

function buildLinkedInUrl(entry, certId) {
  const [dd, mm, yyyy] = entry.date.split(".");
  const params = new URLSearchParams({
    startTask:      "CERTIFICATION_NAME",
    name:           entry.training.title,
    organizationId: ENGEL_LINKEDIN_ORG_ID,
    issueYear:      yyyy,
    issueMonth:     String(parseInt(mm, 10)),
    certId:         certId,
    certUrl: `https://engelexpert.academy/verify/${certId}`
   });
  return `https://www.linkedin.com/profile/add?${params}`;
}

// Ikona LinkedIn (SVG inline, 16×16)
function LinkedInIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{flexShrink:0}}>
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  );
}

/* ─── PORTAL WRAPPER ─────────────────────────────────────────────────────── */
// Renderuje dzieci bezpośrednio w document.body — omija overflow:hidden rodzica
// i naprawia position:fixed na iOS Safari wewnątrz app-container.
function Portal({ children }) {
  return createPortal(children, document.body);
}

export function CelebModal({ entry, onClose }) {
  const T = useT();
  const [vis, setVis] = useState(false);
  useEffect(() => { setTimeout(() => setVis(true), 30); }, []);
  return (
    <Portal>
      <Confetti active={vis}/>
      <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.55)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999,padding:20,fontFamily:"'Helvetica Neue',Helvetica,Arial,sans-serif"}} onClick={onClose}>
        <div style={{background:C.white,width:"100%",maxWidth:340,overflow:"hidden",transition:"all .4s cubic-bezier(.175,.885,.32,1.275)",transform:vis?"scale(1)":"scale(.85)",opacity:vis?1:0,boxShadow:"0 20px 60px rgba(0,0,0,.35)"}} onClick={e => e.stopPropagation()}>
          <div style={{height:5,background:C.green}}/>
          <div style={{fontSize:48,textAlign:"center",padding:"24px 0 8px"}}>🏆</div>
          <div style={{textAlign:"center",fontSize:28,fontWeight:700,color:C.black}}>Gratulacje!</div>
          <div style={{textAlign:"center",fontSize:13,color:C.greyMid,marginTop:4,marginBottom:20}}>{T.training_done_sub}</div>
          <div style={{margin:"0 24px 16px",background:C.greyBg,padding:"14px 16px",borderLeft:`4px solid ${C.green}`}}>
            <div style={{fontSize:15,fontWeight:700,color:C.black}}>{entry.training.title}</div>
            <div style={{fontSize:12,color:C.greyMid,marginTop:4}}>{entry.training.category} · {entry.training.duration}</div>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",margin:"0 24px 16px"}}>
            <span style={{fontSize:10,fontWeight:700,letterSpacing:2,color:C.greyMid}}>{T.training_date_label}</span>
            <span style={{fontSize:13,fontWeight:600,color:C.greyDk,fontFamily:"monospace"}}>{entry.date}</span>
          </div>
          <div style={{margin:"0 24px 20px",border:`1px solid ${C.green}`,background:"rgba(138,183,62,.08)",padding:"10px 20px",textAlign:"center",color:C.greenDk,fontWeight:700,fontSize:13,letterSpacing:3}}>✓ &nbsp; ZALICZONE</div>
          <button style={{display:"block",width:"calc(100% - 48px)",margin:"0 24px 24px",background:C.black,border:"none",color:C.white,padding:15,fontSize:15,fontWeight:600,cursor:"pointer"}} onClick={onClose}>{T.continue_btn}</button>
        </div>
      </div>
    </Portal>
  );
}

/* ─── CERT MODAL ─────────────────────────────────────────────────────────── */
export function CertModal({ entry, user, onClose }) {
  const T = useT();
  const { addToast } = useToast();
  const { token } = useUser();
  const [generating, setGenerating] = useState(false);
  // cert_id pochodzi z entry (załadowany z DB przy logowaniu lub tuż po skanowaniu QR).
  // Fallback odpala się tylko dla starych rekordów które nie mają cert_id w DB.
  const [certId, setCertId] = useState(entry.cert_id || null);
  const sub = [user.displayRole, user.firma].filter(Boolean).join(" · ");

  useEffect(() => {
    if (certId) return; // już mamy — nie rób nic
    let cancelled = false;

    async function resolveCertId() {
      try {
        // 1. Spróbuj pobrać z bazy — może już jest (race condition po skanowaniu)
        const { db } = await import("../lib/supabase");
        const rows = await db.get(
          user.accessToken, "completions",
          `user_id=eq.${user.id}&training_id=eq.${entry.training.id}&select=cert_id`
        );
        const fromDb = rows?.[0]?.cert_id;
        if (fromDb) {
          if (!cancelled) setCertId(fromDb);
          return;
        }

        // 2. Stary rekord bez cert_id — wygeneruj i zapisz do bazy
        const { generateCertId, isDuplicateCertId } = await import("../lib/certId");
        const MAX_ATTEMPTS = 5;
        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
          const id = generateCertId({ trainingId: entry.training.id, date: entry.date });
          try {
            await db.update(
              user.accessToken, "completions",
              `user_id=eq.${user.id}&training_id=eq.${entry.training.id}`,
              { cert_id: id }
            );
            if (!cancelled) setCertId(id);
            break;
          } catch(retryErr) {
            if (isDuplicateCertId(retryErr) && attempt < MAX_ATTEMPTS - 1) continue;
            throw retryErr;
          }
        }
      } catch {
        if (!cancelled) setCertId("ERR");
      }
    }

    resolveCertId();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function downloadPDF() {
    setGenerating(true);
    try {
      await loadAndGenerate({
        participantName: user.displayName,
        trainingTitle:   entry.training.title,
        certId:          certId,
        parsedCode: {
          trainerNum: parseInt(entry.key?.slice(-1)) || 1,
          date:       entry.date,
          prefix:     entry.training.id,
          duration:   entry.training.duration,
        },
        token: token,
      });
    } catch(e) {
      logErr("Błąd generowania certyfikatu:", e);
      addToast(T.cert_error + e.message);
    } finally {
      setGenerating(false);
    }
  }

  // certId jest gotowy gdy nie jest już wartością początkową "…"
  const certReady = !!certId && certId !== 'ERR';

  return (
    <Portal>
      <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999,padding:"16px",fontFamily:"'Helvetica Neue',Helvetica,Arial,sans-serif"}} onClick={onClose}>
        <div style={{background:C.white,width:"100%",maxWidth:390,maxHeight:"92dvh",overflowY:"auto",borderRadius:16,boxShadow:"0 24px 64px rgba(0,0,0,.4)"}} onClick={e => e.stopPropagation()}>
          <div style={{background:C.darkHdr,padding:"16px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",borderRadius:"16px 16px 0 0"}}>
            <div>
              <img src={LOGO_URL} alt="ENGEL" style={{height:22,mixBlendMode:"screen"}}/>
              <div style={{color:"#aaa",fontSize:10,marginTop:2,letterSpacing:2}}>CERTYFIKAT UKOŃCZENIA</div>
            </div>
            <button onClick={onClose} style={{background:"none",border:"none",color:"#fff",fontSize:18,cursor:"pointer",opacity:.7}}>✕</button>
          </div>
          <div style={{height:3,background:C.green}}/>
          <div style={{padding:24}}>
            <div style={{fontSize:9,fontWeight:700,letterSpacing:3,color:C.greyMid,marginBottom:6}}>{T.participant_label}</div>
            <div style={{fontSize:20,fontWeight:700,color:C.black}}>{user.displayName}</div>
            {sub && <div style={{fontSize:12,color:C.greyDk,marginTop:3}}>{sub}</div>}
            <div style={{height:1,background:C.grey,margin:"16px 0"}}/>
            <div style={{fontSize:9,fontWeight:700,letterSpacing:3,color:C.greyMid,marginBottom:6}}>{T.training_label_cert}</div>
            <div style={{fontSize:16,fontWeight:700,color:C.black}}>{entry.training.title}</div>
            <div style={{fontSize:12,color:C.greyDk,marginTop:3}}>{entry.training.category} · {LVL_LABEL[entry.training.level]} · {entry.training.duration}</div>
            <div style={{height:1,background:C.grey,margin:"16px 0"}}/>
            <div style={{display:"flex",gap:32}}>
              <div><div style={{fontSize:9,fontWeight:700,letterSpacing:2,color:C.greyMid,marginBottom:4}}>DATA</div><div style={{fontFamily:"monospace",fontSize:14,fontWeight:600}}>{entry.date}</div></div>
              <div><div style={{fontSize:9,fontWeight:700,letterSpacing:2,color:C.greyMid,marginBottom:4}}>{T.cert_number_label}</div><div style={{fontFamily:"monospace",fontSize:14,fontWeight:600}}>{certId && certId !== "ERR" ? certId : <span style={{color:"#bbb",fontSize:12}}>{certId === "ERR" ? "err" : T.linkedin_loading}</span>}</div></div>
            </div>
            {entry.trainer && (
              <>
                <div style={{height:1,background:C.grey,margin:"16px 0"}}/>
                <div style={{fontSize:9,fontWeight:700,letterSpacing:3,color:C.greyMid,marginBottom:6}}>{T.trainer_label_cert}</div>
                <div style={{fontSize:15,fontWeight:700,color:C.black}}>{entry.trainer}</div>
              </>
            )}
          </div>

          {/* ── PRZYCISKI AKCJI ─────────────────────────────────────────── */}
          <div style={{borderTop:`1px solid ${C.grey}`,padding:"12px 24px",display:"flex",flexDirection:"column",gap:8}}>

            {/* Wiersz 1: Zamknij + Pobierz PDF */}
            <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
              <button onClick={onClose}
                style={{background:"none",border:`1px solid ${C.grey}`,color:C.greyDk,padding:"12px 20px",fontSize:13,fontWeight:600,cursor:"pointer"}}>
                Zamknij
              </button>
              <button onClick={downloadPDF} disabled={generating}
                style={{background:generating?C.greyDk:C.green,border:"none",color:C.white,padding:"12px 24px",fontSize:13,fontWeight:600,cursor:generating?"not-allowed":"pointer",display:"flex",alignItems:"center",gap:8}}>
                {generating
                  ? <><span style={{width:14,height:14,border:"2px solid rgba(255,255,255,.4)",borderTopColor:"#fff",borderRadius:"50%",display:"inline-block",animation:"spin .7s linear infinite"}}/> {T.generating}</>
                  : <>{T.download_pdf}</>
                }
              </button>
            </div>

            {/* Wiersz 2: Dodaj do LinkedIn — pełna szerokość */}
            <a
              href={certReady ? buildLinkedInUrl(entry, certId) : undefined}
              target="_blank"
              rel="noopener noreferrer"
              onClick={!certReady ? e => e.preventDefault() : undefined}
              style={{
                display:         "flex",
                alignItems:      "center",
                justifyContent:  "center",
                gap:             8,
                width:           "100%",
                padding:         "12px 0",
                background:      certReady ? "#0A66C2" : C.greyDk,
                color:           "#fff",
                fontSize:        13,
                fontWeight:      600,
                textDecoration:  "none",
                cursor:          certReady ? "pointer" : "not-allowed",
                opacity:         certReady ? 1 : 0.6,
                boxSizing:       "border-box",
              }}>
              <LinkedInIcon />
              {certReady ? T.add_linkedin : T.linkedin_loading}
            </a>

          </div>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      </div>
    </Portal>
  );
}


/* ─── EXPERT CERT MODAL ──────────────────────────────────────────────────── */
// Ładuje generateExpertCertificate lazy — nie wciąga @react-pdf/renderer
// do bundla dopóki użytkownik nie kliknie "Pobierz PDF".
async function loadAndGenerateExpert(args) {
  const { generateExpertCertificate } = await import("../lib/expertCertGenerator");
  return generateExpertCertificate(args);
}

/**
 * Modal certyfikatu eksperckiego / Master.
 *
 * Props:
 *   titleType    — "tech" | "ur" | "maszyny" | "master"
 *   titleLabel   — np. "ENGEL Process Expert"
 *   titleBadge   — emoji
 *   earnedDate   — DD.MM.YYYY (data ostatniego zaliczenia w grupie)
 *   onClose      — callback
 */
export function ExpertCertModal({ titleType, titleLabel, titleBadge, earnedDate, onClose }) {
  const { user, token } = useUser();
  const { addToast }    = useToast();
  const isMaster = titleType === "master";

  const ACCENT = {
    tech:    "#3B6D11",
    ur:      "#7A4500",
    maszyny: "#8B1A1A",
    master:  "#3D2070",
  }[titleType] || "#3B6D11";

  const ACCENT_BG = {
    tech:    "#EAF3DE",
    ur:      "#FDF0DC",
    maszyny: "#FDEAEA",
    master:  "#F0EAFE",
  }[titleType] || "#EAF3DE";

  const [certId,     setCertId]     = useState(null);
  const [generating, setGenerating] = useState(false);

  // Załaduj lub wygeneruj cert ID przy otwarciu modala.
  // Fallback na localStorage gdy kolumna expert_certs jeszcze nie istnieje w DB
  // (przed uruchomieniem migracji SQL).
  useEffect(() => {
    let cancelled = false;
    const LS_KEY = `eea_expert_cert_${user.id}_${titleType}`;

    async function resolveCertId() {
      const { generateExpertCertId } = await import("../lib/expertCertId");

      // ── Próba 1: baza danych (kolumna profiles.expert_certs) ─────────────
      try {
        const rows = await db.get(
          user.accessToken, "profiles",
          `id=eq.${user.id}&select=expert_certs`
        );
        const existing = rows?.[0]?.expert_certs?.[titleType];
        if (existing) {
          // Mamy w DB — synchronizuj też localStorage i zakończ
          try { localStorage.setItem(LS_KEY, existing); } catch(_) {}
          if (!cancelled) setCertId(existing);
          return;
        }
        // Wygeneruj nowy i zapisz do DB
        const newId = generateExpertCertId({ type: titleType });
        const prev  = rows?.[0]?.expert_certs || {};
        await db.update(
          user.accessToken, "profiles",
          `id=eq.${user.id}`,
          { expert_certs: { ...prev, [titleType]: newId } }
        );
        try { localStorage.setItem(LS_KEY, newId); } catch(_) {}
        if (!cancelled) setCertId(newId);
        return;
      } catch(dbErr) {
        // Kolumna expert_certs jeszcze nie istnieje lub błąd sieci
        // → fallback na localStorage
        console.warn("[ExpertCert] DB niedostępne, fallback na localStorage:", dbErr?.message);
      }

      // ── Fallback: localStorage ────────────────────────────────────────────
      try {
        const cached = localStorage.getItem(LS_KEY);
        if (cached) {
          if (!cancelled) setCertId(cached);
          return;
        }
        // Pierwszy raz — wygeneruj i zapisz lokalnie
        const newId = generateExpertCertId({ type: titleType });
        localStorage.setItem(LS_KEY, newId);
        if (!cancelled) setCertId(newId);
      } catch(lsErr) {
        console.error("[ExpertCert] Błąd localStorage:", lsErr?.message);
        if (!cancelled) setCertId("ERR");
      }
    }

    resolveCertId();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function downloadPDF() {
    if (!certId || certId === "ERR") return;
    setGenerating(true);
    try {
      const sub = [user.displayRole, user.firma].filter(Boolean).join(" · ");
      await loadAndGenerateExpert({
        participantName: user.displayName,
        sub,
        titleLabel,
        titleType,
        certId,
        earnedDate,
      });
    } catch(e) {
      addToast("Błąd generowania certyfikatu: " + e.message);
    } finally {
      setGenerating(false);
    }
  }

  // LinkedIn deep-link dla tytułu eksperckiego
  function buildLinkedInUrl() {
    if (!certId || certId === "ERR" || !earnedDate) return null;
    const [dd, mm, yyyy] = earnedDate.split(".");
    const params = new URLSearchParams({
      startTask:      "CERTIFICATION_NAME",
      name:           titleLabel,
      organizationId: "76790490",
      issueYear:      yyyy,
      issueMonth:     String(parseInt(mm, 10)),
      certId,
      certUrl: `https://engelexpert.academy/verify/${certId}`,
    });
    return `https://www.linkedin.com/profile/add?${params}`;
  }

  const certReady   = !!certId && certId !== "ERR";
  const linkedInUrl = buildLinkedInUrl();
  const sub = [user.displayRole, user.firma].filter(Boolean).join(" · ");

  return (
    <Portal>
      <div
        style={{ position:"fixed",inset:0,background:"rgba(0,0,0,.7)",
          display:"flex",alignItems:"center",justifyContent:"center",
          zIndex:9999,padding:"16px",fontFamily:"'Helvetica Neue',Helvetica,Arial,sans-serif" }}
        onClick={onClose}>
        <div
          style={{ background:C.white,width:"100%",maxWidth:390,
            maxHeight:"92dvh",overflowY:"auto",
            borderRadius:16,boxShadow:"0 24px 64px rgba(0,0,0,.4)" }}
          onClick={e => e.stopPropagation()}>

          {/* ── Header — identyczny z CertModal ── */}
          <div style={{ background:C.darkHdr,padding:"16px 20px",
            display:"flex",alignItems:"center",justifyContent:"space-between",
            borderRadius:"16px 16px 0 0" }}>
            <div>
              <img src="/logo.png" alt="ENGEL" style={{ height:22, mixBlendMode:"screen" }}/>
              <div style={{ color:"#aaa",fontSize:10,marginTop:2,letterSpacing:2 }}>
                {isMaster ? "CERTYFIKAT TYTUŁU" : "CERTYFIKAT TYTUŁU EKSPERCKIEGO"}
              </div>
            </div>
            <button onClick={onClose}
              style={{ background:"none",border:"none",color:"#fff",fontSize:18,cursor:"pointer",opacity:.7 }}>
              ✕
            </button>
          </div>
          <div style={{ height:3, background:C.green }}/>

          {/* ── Treść — identyczna struktura z CertModal ── */}
          <div style={{ padding:24 }}>

            {/* Uczestnik */}
            <div style={{ fontSize:9,fontWeight:700,letterSpacing:3,color:C.greyMid,marginBottom:6 }}>
              UCZESTNIK
            </div>
            <div style={{ fontSize:20,fontWeight:700,color:C.black }}>{user.displayName}</div>
            {sub && <div style={{ fontSize:12,color:C.greyDk,marginTop:3 }}>{sub}</div>}

            <div style={{ height:1,background:C.grey,margin:"16px 0" }}/>

            {/* Tytuł */}
            <div style={{ fontSize:9,fontWeight:700,letterSpacing:3,color:C.greyMid,marginBottom:6 }}>
              {isMaster ? "TYTUŁ" : "TYTUŁ EKSPERCKI"}
            </div>
            <div style={{ fontSize:16,fontWeight:700,color:C.black }}>{titleLabel}</div>
            <div style={{ fontSize:12,color:C.greyDk,marginTop:3 }}>
              {isMaster
                ? "Tech. · UR · Obsługa · Wszystkie kategorie"
                : `ENGEL Expert Academy · ${titleBadge}`}
            </div>

            <div style={{ height:1,background:C.grey,margin:"16px 0" }}/>

            {/* Data i nr certyfikatu */}
            <div style={{ display:"flex",gap:32 }}>
              <div>
                <div style={{ fontSize:9,fontWeight:700,letterSpacing:2,color:C.greyMid,marginBottom:4 }}>
                  DATA
                </div>
                <div style={{ fontFamily:"monospace",fontSize:14,fontWeight:600 }}>
                  {earnedDate || "—"}
                </div>
              </div>
              <div>
                <div style={{ fontSize:9,fontWeight:700,letterSpacing:2,color:C.greyMid,marginBottom:4 }}>
                  NR CERTYFIKATU
                </div>
                <div style={{ fontFamily:"monospace",fontSize:14,fontWeight:600,
                  color: certReady ? C.black : "#bbb" }}>
                  {certId
                    ? (certId === "ERR" ? <span style={{color:"#bbb",fontSize:12}}>błąd</span> : certId)
                    : <span style={{color:"#bbb",fontSize:12}}>ładowanie…</span>}
                </div>
              </div>
            </div>

          </div>

          {/* ── Przyciski — identyczne z CertModal ── */}
          <div style={{ borderTop:`1px solid ${C.grey}`,padding:"12px 24px",
            display:"flex",flexDirection:"column",gap:8 }}>

            <div style={{ display:"flex",gap:10,justifyContent:"flex-end" }}>
              <button onClick={onClose}
                style={{ background:"none",border:`1px solid ${C.grey}`,color:C.greyDk,
                  padding:"12px 20px",fontSize:13,fontWeight:600,cursor:"pointer" }}>
                Zamknij
              </button>
              <button onClick={downloadPDF} disabled={generating || !certReady}
                style={{ background:generating||!certReady ? C.greyDk : C.green,
                  border:"none",color:C.white,padding:"12px 24px",fontSize:13,
                  fontWeight:600,cursor:generating||!certReady?"not-allowed":"pointer",
                  display:"flex",alignItems:"center",gap:8 }}>
                {generating
                  ? <><span style={{ width:14,height:14,border:"2px solid rgba(255,255,255,.4)",
                      borderTopColor:"#fff",borderRadius:"50%",display:"inline-block",
                      animation:"spin .7s linear infinite" }}/> Generuję…</>
                  : <>{"\uD83D\uDCC4"} Pobierz PDF</>}
              </button>
            </div>

            <a
              href={linkedInUrl || undefined}
              target="_blank"
              rel="noopener noreferrer"
              onClick={!linkedInUrl ? e => e.preventDefault() : undefined}
              style={{ display:"flex",alignItems:"center",justifyContent:"center",gap:8,
                width:"100%",padding:"12px 0",
                background: linkedInUrl ? "#0A66C2" : C.greyDk,
                color:"#fff",fontSize:13,fontWeight:600,textDecoration:"none",
                cursor: linkedInUrl ? "pointer" : "not-allowed",
                opacity: linkedInUrl ? 1 : 0.6,
                boxSizing:"border-box" }}>
              <LinkedInIcon/>
              {certReady ? "Dodaj do profilu LinkedIn" : "Ładowanie…"}
            </a>

          </div>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      </div>
    </Portal>
  );
}
