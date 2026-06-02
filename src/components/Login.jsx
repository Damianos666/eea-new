import { useState, useEffect, useRef } from "react";
import { C } from "../lib/constants";
import { auth, db, session } from "../lib/supabase";

/* ─── Parsowanie hash params z linku Supabase (recovery, magic link itp.) ── */
export function parseHashParams() {
  try {
    const hash = window.location.hash.slice(1); // usuń '#'
    if (!hash) return null;
    const params = Object.fromEntries(new URLSearchParams(hash));
    if (params.type && params.access_token) return params;
    return null;
  } catch { return null; }
}

export function clearHashFromUrl() {
  // Usuń hash z URL bez przeładowania strony
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
}
import { generateLogin } from "../lib/helpers";
import { ClipboardSvg, Field, Header } from "./SharedUI";
import { useT, useLang } from "../lib/LangContext";

export function LoginScreen({ onLogin }) {
  const T = useT();
  const { lang, switchLang } = useLang();
  const [mode, setMode] = useState("login");
  return (
    <div className="app-container" style={{height:"100%",display:"flex",flexDirection:"column",fontFamily:"'Helvetica Neue',Helvetica,Arial,sans-serif",overflow:"hidden",background:C.greyBg}}>
      <Header/>
      <div style={{background:C.greyBanner,borderBottom:`1px solid #D0D3D6`,padding:"11px 20px",textAlign:"center"}}>
        <strong style={{display:"block",fontSize:15,color:C.black,marginBottom:2}}>ENGEL Expert Academy</strong>
        <span style={{fontSize:13,color:C.greyDk}}>by Damian Świderski</span>
      </div>
      <div className="app-content" style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-start",padding:"20px 24px 40px",overflowY:"auto",WebkitOverflowScrolling:"touch"}}>
        <ClipboardSvg/>
        <div style={{display:"flex",gap:6,marginBottom:12,justifyContent:"center"}}>
          {["pl","en"].map(l => <button key={l} onClick={() => switchLang(l)} style={{padding:"4px 14px",fontSize:12,fontWeight:700,border:`1px solid ${lang===l?C.black:C.grey}`,background:lang===l?C.black:C.white,color:lang===l?C.white:C.greyMid,cursor:"pointer"}}>{l.toUpperCase()}</button>)}
        </div>
        <div style={{width:"100%",maxWidth:340,marginTop:"auto",marginBottom:"auto"}}>
          {mode === "recover"
            ? <RecoverForm onBack={() => setMode("login")}/>
            : <AuthForm mode={mode} setMode={setMode} onLogin={onLogin}/>
          }
        </div>
      </div>
    </div>
  );
}

const LS_REMEMBER_KEY = "eea_remember";

// Maksymalna liczba nieudanych prób przed blokadą
const MAX_ATTEMPTS = 3;
const LOCKOUT_SECONDS = 30;

export function AuthForm({ mode, setMode, onLogin }) {
  const T = useT();
  const [email,    setEmail]    = useState("");
  const [pass,     setPass]     = useState("");
  const [remember, setRemember] = useState(false);
  const [name,     setName]     = useState("");
  const [genLogin, setGenLogin] = useState("");
  const [err,      setErr]      = useState("");
  const [info,     setInfo]     = useState("");
  const [shake,    setShake]    = useState(false);
  const [loading,  setLoading]  = useState(false);

  // NAPRAWA: Rate limiting po stronie klienta — blokada po MAX_ATTEMPTS nieudanych próbach.
  // Nie zastępuje zabezpieczeń serwerowych, ale eliminuje najprostsze ataki słownikowe
  // i podwójne kliknięcia przycisku.
  const [attempts, setAttempts] = useState(0);
  const [lockout,  setLockout]  = useState(0); // sekundy do odblokowania
  const lockoutTimer = useRef(null);

  useEffect(() => {
    const savedRemember = localStorage.getItem(LS_REMEMBER_KEY) === "true";
    setRemember(savedRemember);
    if (savedRemember) {
      const saved = session.load();
      if (saved?.user?.email) setEmail(saved.user.email);
    }
  }, []);

  // Wyczyść timer przy odmontowaniu
  useEffect(() => () => { if (lockoutTimer.current) clearInterval(lockoutTimer.current); }, []);

  function startLockout() {
    let sec = LOCKOUT_SECONDS;
    setLockout(sec);
    lockoutTimer.current = setInterval(() => {
      sec--;
      setLockout(sec);
      if (sec <= 0) {
        clearInterval(lockoutTimer.current);
        setAttempts(0);
      }
    }, 1000);
  }

  function sw(m) { setMode(m); setErr(""); setInfo(""); }
  useEffect(() => {
    setGenLogin(name.trim().split(/\s+/).length >= 2 ? generateLogin(name) : "");
  }, [name]);

  async function doLogin() {
    if (lockout > 0) return;
    if (!email.trim() || !pass) { setErr(T.fill_all_fields); return; }
    setLoading(true); setErr("");
    try {
      const s = await auth.signIn(email.trim().toLowerCase(), pass);

      if (remember) {
        localStorage.setItem(LS_REMEMBER_KEY, "true");
        session.save(s.access_token, s.refresh_token, s.user, true);  // persist → localStorage
      } else {
        localStorage.removeItem(LS_REMEMBER_KEY);
        session.save(s.access_token, s.refresh_token, s.user, false); // persist=false → tylko RAM
      }

      // Udane logowanie — resetuj licznik prób
      setAttempts(0);
      onLogin({
        id:          s.user.id,
        accessToken: s.access_token,
        email:       s.user.email,
      });
    } catch(e) {
      setErr(e.message || T.login_error);
      setShake(true); setTimeout(() => setShake(false), 400);

      // Zwiększ licznik i zablokuj po MAX_ATTEMPTS próbach
      setAttempts(prev => {
        const next = prev + 1;
        if (next >= MAX_ATTEMPTS) startLockout();
        return next;
      });
    } finally { setLoading(false); }
  }

  async function doRegister() {
    if (!email.trim() || !pass) { setErr(T.email_required); return; }
    if (pass.length < 8) { setErr(T.password_min_length); return; }
    if (!email.includes("@")) { setErr(T.email_invalid); return; }
    setLoading(true); setErr("");
    try {
      const result = await auth.signUp(email.trim().toLowerCase(), pass);
      if (!result.user) throw new Error(T.account_create_error);

      const emailName = email.trim().split("@")[0];
      await db.insert(result.access_token, "profiles", {
        id: result.user.id,
        login: emailName,
        name: emailName,
        role: null,
        firma: null,
        active_groups: ["tech","ur","maszyny"],
        notif_reminder: true,
        notif_cert: true,
      }).catch(() => {});

      setInfo(T.account_created);
      sw("login"); setEmail(email); setPass("");
    } catch(e) {
      const msg = e.message || "";
      if (msg.includes("already registered") || msg.includes("User already registered")) {
        setErr(T.email_exists);
      } else {
        setErr(msg || T.register_error);
      }
    }
    finally { setLoading(false); }
  }

  const isLocked = lockout > 0;

  return (
    <>
      <div style={{display:"flex"}}>
        {[["login",T.login_btn],["register",T.register_btn]].map(([m,l]) => (
          <button key={m} onClick={() => sw(m)}
            style={{flex:1,padding:"12px",background:mode===m?C.black:C.white,color:mode===m?C.white:C.greyDk,border:`1px solid ${mode===m?C.black:C.grey}`,fontSize:14,fontWeight:600,cursor:"pointer"}}>
            {l}
          </button>
        ))}
      </div>
      <div style={{background:C.white,padding:24,boxShadow:"0 1px 6px rgba(0,0,0,.1)",animation:shake?"shake .35s ease":"none"}}>
        <style>{`@keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-7px)}75%{transform:translateX(7px)}}`}</style>
        {info && <div style={{background:C.greenBg,border:`1px solid ${C.green}`,color:C.greenDk,fontSize:13,padding:"10px 14px",marginBottom:16,lineHeight:1.5}}>{info}</div>}

        {mode === "login" ? (
          <>
            {/* autoComplete="email" i "current-password" pozwalają menedżerom haseł działać */}
            <Field label={T.email_label} type="email" value={email} onChange={v => { setEmail(v); setErr(""); }} placeholder={T.email_placeholder} autoComplete="email"/>
            <Field label={T.password_label} type="password" value={pass} onChange={v => { setPass(v); setErr(""); }} placeholder="••••••" autoComplete="current-password"/>

            <label style={{display:"flex",alignItems:"center",gap:10,marginBottom:16,cursor:"pointer",userSelect:"none"}}>
              <div onClick={() => setRemember(r => !r)} style={{
                width:20, height:20, flexShrink:0,
                border:`2px solid ${remember ? C.green : C.greyMid}`,
                background: remember ? C.green : C.white,
                display:"flex", alignItems:"center", justifyContent:"center",
                transition:"all .15s",
              }}>
                {remember && <svg width="12" height="9" viewBox="0 0 12 9" fill="none">
                  <path d="M1 4L4.5 7.5L11 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>}
              </div>
              <span style={{fontSize:13,color:C.greyDk}} onClick={() => setRemember(r => !r)}>
                {T.remember_me}
              </span>
            </label>

            {err && <div style={{color:C.red,fontSize:12,marginBottom:12}}>{err}</div>}

            {/* Komunikat blokady po zbyt wielu nieudanych próbach */}
            {isLocked && (
              <div style={{color:C.amber,fontSize:12,marginBottom:12,fontWeight:600}}>
                ⚠ {T.lockout_msg.replace("{n}", lockout)}
              </div>
            )}

            <button
              style={{width:"100%",background:isLocked||loading?C.greyDk:C.black,border:"none",color:C.white,padding:15,fontSize:15,fontWeight:600,cursor:isLocked||loading?"not-allowed":"pointer",marginBottom:12}}
              onClick={doLogin} disabled={isLocked||loading}>
              {isLocked ? `Zablokowano (${lockout}s)` : loading ? T.logging_in : T.login_btn}
            </button>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:C.greyMid}}>
              <span>{T.no_account} <span style={{color:C.black,fontWeight:700,cursor:"pointer",textDecoration:"underline"}} onClick={() => sw("register")}>{T.register}</span></span>
              <span style={{color:C.black,fontWeight:600,cursor:"pointer",textDecoration:"underline"}} onClick={() => setMode("recover")}>{T.forgot_password}</span>
            </div>
          </>
        ) : (
          <>
            {/* autoComplete="new-password" przy rejestracji — przeglądarka zaproponuje silne hasło */}
            <Field label={T.email_label + " *"} type="email" value={email} onChange={v => { setEmail(v); setErr(""); }} placeholder="np. jan@firma.pl" autoComplete="email"/>
            <Field label={T.password_label + " *"} type="password" value={pass} onChange={v => { setPass(v); setErr(""); }} placeholder={T.password_placeholder} autoComplete="new-password"/>
            {err && <div style={{color:C.red,fontSize:12,marginBottom:12}}>{err}</div>}
            <button style={{width:"100%",background:loading?C.greyDk:C.black,border:"none",color:C.white,padding:15,fontSize:15,fontWeight:600,cursor:loading?"not-allowed":"pointer",marginBottom:12}}
              onClick={doRegister} disabled={loading}>{loading ? T.registering : T.register}</button>
            <div style={{textAlign:"center",fontSize:12,color:C.greyMid}}>{T.have_account} <span style={{color:C.black,fontWeight:700,cursor:"pointer",textDecoration:"underline"}} onClick={() => sw("login")}>{T.login_link}</span></div>
          </>
        )}
      </div>
    </>
  );
}

/* ─── RESET PASSWORD FORM (po kliknięciu linku z maila) ─────────────────── */
export function ResetPasswordForm({ accessToken, onDone }) {
  const [pass,    setPass]    = useState("");
  const [pass2,   setPass2]   = useState("");
  const [err,     setErr]     = useState("");
  const [loading, setLoading] = useState(false);
  const [done,    setDone]    = useState(false);

  async function save() {
    if (!pass || !pass2) { setErr("Wypełnij oba pola."); return; }
    if (pass.length < 8)  { setErr("Hasło musi mieć co najmniej 8 znaków."); return; }
    if (pass !== pass2)   { setErr("Hasła nie są identyczne."); return; }
    setLoading(true); setErr("");
    try {
      await auth.updatePassword(accessToken, pass);
      setDone(true);
      setTimeout(() => onDone(), 2500);
    } catch(e) {
      setErr(e.message || "Błąd zmiany hasła. Spróbuj ponownie.");
    } finally { setLoading(false); }
  }

  return (
    <div className="app-container" style={{height:"100%",display:"flex",flexDirection:"column",fontFamily:"'Helvetica Neue',Helvetica,Arial,sans-serif",overflow:"hidden",background:"#EFEFEF"}}>
      <Header/>
      <div style={{background:"#E8EAEC",borderBottom:"1px solid #D0D3D6",padding:"11px 20px",textAlign:"center"}}>
        <strong style={{display:"block",fontSize:15,color:"#1A1A1A",marginBottom:2}}>ENGEL Expert Academy</strong>
        <span style={{fontSize:13,color:"#686868"}}>Resetowanie hasła</span>
      </div>
      <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"20px 24px 40px",overflowY:"auto"}}>
        <div style={{width:"100%",maxWidth:340}}>
          {done ? (
            <div style={{background:"#fff",padding:24,boxShadow:"0 1px 6px rgba(0,0,0,.1)",textAlign:"center"}}>
              <div style={{fontSize:40,marginBottom:12}}>✅</div>
              <div style={{fontSize:16,fontWeight:700,marginBottom:8}}>Hasło zostało zmienione</div>
              <div style={{fontSize:13,color:"#686868",lineHeight:1.6}}>Za chwilę zostaniesz przekierowany do logowania…</div>
            </div>
          ) : (
            <div style={{background:"#fff",padding:24,boxShadow:"0 1px 6px rgba(0,0,0,.1)"}}>
              <div style={{fontSize:15,fontWeight:700,marginBottom:4}}>Ustaw nowe hasło</div>
              <div style={{fontSize:13,color:"#686868",marginBottom:20,lineHeight:1.5}}>
                Wpisz nowe hasło do swojego konta ENGEL Expert Academy.
              </div>
              <Field label="NOWE HASŁO" type="password" value={pass}
                onChange={v => { setPass(v); setErr(""); }}
                placeholder="min. 8 znaków" autoComplete="new-password"/>
              <Field label="POWTÓRZ HASŁO" type="password" value={pass2}
                onChange={v => { setPass2(v); setErr(""); }}
                placeholder="••••••••" autoComplete="new-password"/>
              {err && <div style={{color:"#C0392B",fontSize:12,marginBottom:12}}>{err}</div>}
              <button
                style={{width:"100%",background:loading?"#686868":"#1A1A1A",border:"none",color:"#fff",
                        padding:14,fontSize:14,fontWeight:600,cursor:loading?"not-allowed":"pointer"}}
                onClick={save} disabled={loading}>
                {loading ? "Zapisuję…" : "Zapisz nowe hasło"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── RECOVER FORM ───────────────────────────────────────────────────────── */
export function RecoverForm({ onBack }) {
  const T = useT();
  const [email,   setEmail]   = useState("");
  const [err,     setErr]     = useState("");
  const [loading, setLoading] = useState(false);
  const [done,    setDone]    = useState(false);

  async function send() {
    if (!email.trim() || !email.includes("@")) { setErr(T.email_invalid); return; }
    setLoading(true); setErr("");
    try {
      await auth.recover(email.trim().toLowerCase());
      setDone(true);
    } catch(e) { setErr(e.message || T.reset_error); }
    finally { setLoading(false); }
  }

  return (
    <>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
        <button onClick={onBack} style={{background:"none",border:"none",cursor:"pointer",color:C.greyDk,fontSize:22,padding:0}}>←</button>
        <span style={{fontSize:16,fontWeight:700,color:C.black}}>{T.recover_title}</span>
      </div>
      <div style={{background:C.white,padding:24,boxShadow:"0 1px 6px rgba(0,0,0,.1)"}}>
        {done ? (
          <div style={{textAlign:"center",padding:"8px 0"}}>
            <div style={{fontSize:40,marginBottom:12}}>📧</div>
            <div style={{fontSize:16,fontWeight:700,color:C.black,marginBottom:8}}>{T.email_sent_title}</div>
            <div style={{fontSize:13,color:C.greyDk,lineHeight:1.6,marginBottom:20}}>{T.email_sent_body.replace("{email}", email)}</div>
            <button style={{width:"100%",background:C.black,border:"none",color:C.white,padding:14,fontSize:14,fontWeight:600,cursor:"pointer"}} onClick={onBack}>{T.back_to_login}</button>
          </div>
        ) : (
          <>
            <div style={{fontSize:13,color:C.greyDk,lineHeight:1.6,marginBottom:20}}>
              {T.recover_instruction}
            </div>
            <Field label="E-MAIL" type="email" value={email} onChange={v => { setEmail(v); setErr(""); }} placeholder={T.email_placeholder} autoComplete="email"/>
            {err && <div style={{color:C.red,fontSize:12,marginBottom:12}}>{err}</div>}
            <button style={{width:"100%",background:loading?C.greyDk:C.black,border:"none",color:C.white,padding:14,fontSize:14,fontWeight:600,cursor:loading?"not-allowed":"pointer"}}
              onClick={send} disabled={loading}>{loading ? T.sending : T.reset_btn}</button>
          </>
        )}
      </div>
    </>
  );
}
