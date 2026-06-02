import { useState, useCallback, useMemo, useEffect, useRef, lazy, Suspense, Component } from "react";
import { C, GROUPS } from "./lib/constants";
import { auth, db, session, setOnTokenRefreshed, realtime, isTokenExpired } from "./lib/supabase";
import { calcProgress } from "./lib/helpers";
import { log, err as logErr } from "./lib/logger";
import { LangProvider } from "./lib/LangContext";
import { useSafeArea } from "./lib/useSafeArea";
import { ToastProvider, useToast } from "./lib/ToastContext";
import { UserContext, useUser } from "./lib/UserContext";
import { Header, Spinner } from "./components/SharedUI";
import { LoginScreen, ResetPasswordForm, parseHashParams, clearHashFromUrl } from "./components/Login";
import { TrainingTab } from "./components/TrainingTab";
import { CatalogTab } from "./components/CatalogTab";
import { ScheduleTab } from "./components/ScheduleTab";
import { MessagesTab } from "./components/MessagesTab";
import { ProfileTab } from "./components/ProfileTab";
import { TrainerScheduleTab } from "./components/TrainerScheduleTab";
import { loadPendingSync, markSynced, pruneExpired } from "./lib/reportStorage";
import { TabBar, TAB_ICONS_TRAINER } from "./components/TabBar";

// POPRAWKA: GramTab lazy — nie trafia do głównego bundla, ładuje się tylko gdy otwarty
const GramTab    = lazy(() => import("./components/GramTab").then(m => ({ default: m.GramTab })));

// Lazy imports — AdminPanel (~400KB) i komponenty trenera ładują się tylko gdy potrzebne
const AdminPanel   = lazy(() => import("./components/admin/AdminPanel").then(m => ({ default: m.AdminPanel })));
const AdminCodeGen = lazy(() => import("./components/admin/AdminCodeGen").then(m => ({ default: m.AdminCodeGen })));
const AdminQuiz    = lazy(() => import("./components/admin/AdminQuiz").then(m => ({ default: m.AdminQuiz })));

// Publiczne strony — lazy, bez logowania
const RegistrationForm = lazy(() => import("./components/RegistrationForm").then(m => ({ default: m.RegistrationForm })));
const TermsPage        = lazy(() => import("./components/TermsPage").then(m => ({ default: m.TermsPage })));
const VerifyPage       = lazy(() => import("./components/VerifyPage").then(m => ({ default: m.VerifyPage })));

// POPRAWKA: Error Boundary — łapie niesłowne błędy JS i pokazuje ekran błędu
// zamiast białego ekranu. Klasa bo React Error Boundary wymaga komponentu klasowego.
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // W produkcji logi są wyciszone przez logger.js — tu używamy console.error
    // bo to krytyczny błąd który zawsze chcemy widzieć
    console.error("[ErrorBoundary]", error, info?.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={{
        height: "100%", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        background: "#EFEFEF", padding: 32, textAlign: "center",
        fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif",
      }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#1A1A1A", marginBottom: 8 }}>
          Coś poszło nie tak
        </div>
        <div style={{ fontSize: 13, color: "#686868", lineHeight: 1.6, marginBottom: 24, maxWidth: 300 }}>
          Wystąpił nieoczekiwany błąd. Odśwież stronę — jeśli problem się powtarza, skontaktuj się z administratorem.
        </div>
        <button
          onClick={() => window.location.reload()}
          style={{
            background: "#1A1A1A", border: "none", color: "#fff",
            padding: "12px 28px", fontSize: 14, fontWeight: 600,
            cursor: "pointer", borderRadius: 6,
          }}>
          Odśwież stronę
        </button>
        {import.meta.env.DEV && this.state.error && (
          <pre style={{
            marginTop: 24, fontSize: 10, color: "#C0392B",
            textAlign: "left", maxWidth: "100%", overflow: "auto",
            background: "#FDEDEC", padding: 12, borderRadius: 4,
          }}>
            {this.state.error.toString()}
          </pre>
        )}
      </div>
    );
  }
}

// OPTYMALIZACJA: Style wyciągnięte poza render — nowe obiekty NIE tworzą się co renderze.
const styles = {
  loadingWrapper: { height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: C.greyBg, fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif" },
  loadingInner:   { textAlign: "center" },
  spinner:        { width: 40, height: 40, border: `3px solid ${C.grey}`, borderTopColor: C.green, borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" },
  loadingText:    { color: C.greyDk, fontSize: 14 },
  appContainer:   { height: "100%", display: "flex", flexDirection: "column", fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif", background: C.greyBg, overflow: "hidden" },
  banner:         { background: C.greyBanner, borderBottom: "1px solid #D0D3D6", padding: "9px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" },
  bannerName:     { fontSize: 13, color: C.greyDk, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginRight: 8 },
  trainerBadge:   { fontSize: 11, fontWeight: 700, color: C.green, flexShrink: 0, background: C.greenBg, padding: "2px 8px", borderRadius: 4 },
  progressText:   { fontSize: 13, fontWeight: 700, color: C.green, flexShrink: 0 },
  appContent:     { flex: 1, minHeight: 0, position: "relative", overflow: "hidden" },
  tabVisible:     { display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" },
  tabHidden:      { display: "none",  flexDirection: "column", height: "100%", overflow: "hidden" },
  trainerContent: { flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", display: "flex", flexDirection: "column", paddingBottom: "calc(60px + var(--safe-bottom, 0px))" },
  tabBar:         { display: "flex", background: C.white, borderTop: `1px solid ${C.grey}`, flexShrink: 0 },
  suspenseFallback: { height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: C.greyBg },
};

const TRAINER_TABS = [
  "Terminarz",
  "Kody",
  "Wiadomości",
  "Quiz",
  "Profil",
];

export default function App({ onMounted }) {
  return (
    // POPRAWKA: ErrorBoundary owija całą aplikację — biały ekran zastąpiony
    // czytelnym komunikatem z przyciskiem "Odśwież stronę"
    <ErrorBoundary>
      <LangProvider>
        <ToastProvider>
          <AppRoot onMounted={onMounted} />
        </ToastProvider>
      </LangProvider>
    </ErrorBoundary>
  );
}

function AppRoot({ onMounted }) {
  const { addToast } = useToast();

  const [user,              setUserRaw]         = useState(null);
  const [tab,               setTab]             = useState(0);
  const [completed,         setCompleted]       = useState([]);
  const [activeGroups,      setActiveGroups]    = useState(["tech","ur","maszyny"]);
  const [notifReminder,     setNotifReminder]   = useState(true);
  const [notifCert,         setNotifCert]       = useState(true);
  const [dataLoading,       setDataLoading]     = useState(false);
  const [msgCount,          setMsgCount]        = useState(0);
  const [readIds,           setReadIds]         = useState(new Set());
  const [msgRefreshKey,     setMsgRefreshKey]   = useState(0);
  const [sessionChecked,    setSessionChecked]  = useState(false);
  const [resetToken,        setResetToken]      = useState(null); // access_token z linku recovery
  const [trainerView,       setTrainerViewRaw]  = useState("client");
  const [trainingOverrides, setTrainingOverrides] = useState({});
  const [gameData,          setGameData]         = useState({ points: 0, streak_current: 0 });
  const [gramRefreshKey,    setGramRefreshKey]   = useState(0);
  const [scheduleRefreshKey, setScheduleRefreshKey] = useState(0);
  const prevTabRef = useRef(null);

  // Odświeża Terminarz klienta gdy użytkownik wchodzi na tab 2
  const handleSetTab = useCallback((newTab) => {
    if (newTab === 2 && prevTabRef.current !== 2) {
      setScheduleRefreshKey(k => k + 1);
    }
    prevTabRef.current = newTab;
    setTab(newTab);
  }, []);

  const lastMsgAt       = useRef(null);
  const realtimeUnsub   = useRef(null);
  const lastMsgsRef     = useRef([]);

  // Odczytuje env(safe-area-inset-bottom) po renderze i ustawia --safe-bottom
  // Ukryj splash screen po pierwszym renderze
  useEffect(() => { if (onMounted) onMounted(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Obsługa linku recovery z Supabase — hash zawiera access_token i type=recovery
  useEffect(() => {
    const params = parseHashParams();
    if (params?.type === "recovery" && params?.access_token) {
      setResetToken(params.access_token);
      clearHashFromUrl();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useSafeArea();

  function requestNotifPermission() {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }

  const checkMessages = useCallback(async (token, userId) => {
    if (!token || !userId) return;
    try {
      // Sekwencyjnie — nie równolegle. Przy wygasłym tokenie fetchWithRefresh
      // odświeży go dla pierwszego requestu, drugi używa już świeżego tokena.
      // Promise.all spowodowałby race condition na rotacji refresh tokena.
      const msgs = await db.get(token, "messages",
        "order=created_at.desc&select=id,created_at,title&limit=20");
      const freshToken = session.getToken() || token;
      const reads = await db.get(freshToken, "message_reads",
        `user_id=eq.${userId}&select=message_id`);
      lastMsgsRef.current = msgs;
      const readSet = new Set(reads.map(r => r.message_id));
      // MERGE zamiast replace — chroni optymistyczny stan handleMarkRead.
      // Gdyby checkMessages odpaliło się (przez Realtime) zanim db.upsert message_reads
      // dobił do bazy, zastąpienie setReadIds(readSet) skasowałoby właśnie kliknięte przeczytanie.
      setReadIds(prev => {
        const merged = new Set([...prev, ...readSet]);
        setMsgCount(msgs.filter(m => !merged.has(m.id)).length);
        return merged;
      });
      if (!msgs.length) return;
      const newestAt = msgs[0].created_at;
      if (lastMsgAt.current && newestAt > lastMsgAt.current) {
        const newMsgs = msgs.filter(m => m.created_at > lastMsgAt.current);
        if ("Notification" in window && Notification.permission === "granted") {
          newMsgs.forEach(m => {
            new Notification("📬 ENGEL Expert Academy", {
              body: m.title, icon: "/pwa-192.png", badge: "/pwa-192.png",
              tag: `msg-${m.id}`, renotify: true,
            });
          });
        }
      }
      lastMsgAt.current = newestAt;
    } catch { /* cicho ignoruj błędy pollingu */ }
  }, []);

  useEffect(() => {
    if (!user) {
      if (realtimeUnsub.current) { realtimeUnsub.current(); realtimeUnsub.current = null; }
      lastMsgAt.current = null;
      return;
    }
    requestNotifPermission();
    checkMessages(user.accessToken, user.id);
    // Realtime — push z Supabase zamiast pollingu co 5 minut.
    // onInsert odpala checkMessages natychmiast gdy pojawi się nowa wiadomość.
    realtimeUnsub.current = realtime.onNewMessage(
      user.accessToken,
      () => {
        checkMessages(session.getToken() || user.accessToken, user.id);
        setMsgRefreshKey(k => k + 1);
      }
    );
    return () => { if (realtimeUnsub.current) { realtimeUnsub.current(); realtimeUnsub.current = null; } };
  }, [user, checkMessages]);

  const setTrainerView = useCallback(async (v) => {
    setTrainerViewRaw(v);
    setTab(4);
    try {
      await db.update(user.accessToken, "profiles", `id=eq.${user.id}`, { trainer_view: v });
    } catch(e) { logErr("[TRAINER VIEW] save error:", e.message); }
  }, [user]);

  const handleMarkRead = useCallback(async (messageId) => {
    if (!user || readIds.has(messageId)) return;
    // Optymistyczna aktualizacja — badge reaguje natychmiast
    setReadIds(prev => new Set([...prev, messageId]));
    setMsgCount(prev => Math.max(0, prev - 1));
    try {
      await db.upsert(user.accessToken, "message_reads",
        { user_id: user.id, message_id: messageId },
        "user_id,message_id"
      );
    } catch(e) {
      // Rollback jeśli zapis się nie powiódł
      logErr("[MARK READ] error:", e.message);
      setReadIds(prev => { const r = new Set(prev); r.delete(messageId); return r; });
      setMsgCount(prev => prev + 1);
    }
  }, [user, readIds]);

  useEffect(() => {
    setOnTokenRefreshed((newToken) => {
      session.setToken(newToken);
      setUserRaw(prev => prev ? { ...prev, accessToken: newToken } : prev);
      log("[TOKEN REFRESH] accessToken zaktualizowany w stanie React");
    });
  }, []);

  const refreshTimerRef = useRef(null);
  const TOKEN_REFRESH_INTERVAL = 50 * 60 * 1000;

  // ─── Globalny sync: wysyła wszystkie pending raporty z localStorage ──────────
  // Odpala się przy: starcie aplikacji (jeśli online) + powrocie internetu
  const syncAllPendingReports = useCallback(async () => {
    if (!navigator.onLine) return;
    const tok = session.getToken();
    if (!tok) return;
    try {
      pruneExpired();
      // Skanuj localStorage w poszukiwaniu kluczy "_sync"
      const syncKeys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith("engel_report_") && key.endsWith("_sync")) {
          syncKeys.push(key);
        }
      }
      if (syncKeys.length === 0) return;
      log(`[GlobalSync] Znaleziono ${syncKeys.length} pending raportów`);
      for (const key of syncKeys) {
        try {
          const raw = localStorage.getItem(key);
          if (!raw) continue;
          const { payload } = JSON.parse(raw);
          if (!payload) continue;
          await db.upsert(tok, "service_reports", payload, "local_uuid");
          localStorage.removeItem(key);
          log(`[GlobalSync] Wysłano: ${key}`);
        } catch (e) {
          logErr(`[GlobalSync] Błąd dla ${key}:`, e.message);
        }
      }
    } catch (e) {
      logErr("[GlobalSync] Nieoczekiwany błąd:", e.message);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Listener na powrót internetu + sync przy starcie
  useEffect(() => {
    const onOnline = () => {
      log("[GlobalSync] Internet wrócił — uruchamiam sync pending raportów");
      syncAllPendingReports();
    };
    window.addEventListener("online", onOnline);
    // Przy starcie jeśli już online — sprawdź od razu
    if (navigator.onLine) syncAllPendingReports();
    return () => window.removeEventListener("online", onOnline);
  }, [syncAllPendingReports]);
  // ─────────────────────────────────────────────────────────────────────────────

  const proactiveRefresh = useCallback(async () => {
    const saved = session.load();
    if (!saved?.refreshToken) return;
    try {
      const refreshed = await auth.refreshSession(saved.refreshToken);
      session.save(refreshed.access_token, refreshed.refresh_token, refreshed.user);
      session.setToken(refreshed.access_token);
      setUserRaw(prev => prev ? { ...prev, accessToken: refreshed.access_token } : prev);
      log("[TOKEN REFRESH] proaktywne odświeżenie zakończone sukcesem");
    } catch(e) {
      logErr("[TOKEN REFRESH] błąd proaktywnego odświeżenia:", e.message);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      if (refreshTimerRef.current) { clearInterval(refreshTimerRef.current); refreshTimerRef.current = null; }
      return;
    }
    refreshTimerRef.current = setInterval(proactiveRefresh, TOKEN_REFRESH_INTERVAL);
    return () => { if (refreshTimerRef.current) clearInterval(refreshTimerRef.current); };
  }, [user, proactiveRefresh]);

  // iOS/Android zamraża timery gdy PWA idzie w tło — proactiveRefresh nie odpali się przez noc.
  // Ten handler sprawdza sesję gdy użytkownik wraca do app po przerwie.
  useEffect(() => {
    async function onVisible() {
      if (document.visibilityState !== "visible") return;
      if (!user) return;
      const currentToken = session.getToken();
      if (!currentToken || isTokenExpired(currentToken)) await proactiveRefresh();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [user, proactiveRefresh]);

  useEffect(() => {
    async function restoreSession() {
      const saved = session.load();
      if (!saved?.refreshToken) { setSessionChecked(true); return; }
      try {
        const refreshed = await auth.refreshSession(saved.refreshToken);
        session.save(refreshed.access_token, refreshed.refresh_token, refreshed.user);
        await handleLogin({
          id:          refreshed.user.id,
          accessToken: refreshed.access_token,
          email:       refreshed.user.email,
          _skipSessionSave: true,
        });
      } catch {
        session.clear();
      } finally {
        setSessionChecked(true);
      }
    }
    restoreSession();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogin = useCallback(async (rawUser) => {
    setDataLoading(true);
    try {
      log("[LOGIN] user.id =", rawUser.id);

      // ── Etap 1: profil ────────────────────────────────────────────────────
      // Rola użytkownika jest zapisana w tabeli profiles, nie w JWT Supabase.
      // Musimy ją poznać zanim zdecydujemy, które dane pobierać w etapie 2.
      const profileRows = await db.get(
        rawUser.accessToken, "profiles", `id=eq.${rawUser.id}&select=*`
      ).catch(() => []);

      const profile    = profileRows[0] || null;
      const role       = profile?.role       || rawUser.role       || null;
      const trainer_id = profile?.trainer_id ?? rawUser.trainer_id ?? null;
      const isAdmin    = role === "admin";
      const isTrainer  = trainer_id != null;

      // ── Etap 2: dane zależne od roli ──────────────────────────────────────
      //
      //  completions       — klient (postęp szkoleń) + trener (własny postęp
      //                      w ProfileTab). Admin nie ma własnych zaliczeń do
      //                      wyświetlenia, więc pomijamy.
      //
      //  training_overrides — tylko klient: wyświetlane w TrainingTab.
      //                       Admin zarządza nimi przez AdminTrainings (własny
      //                       fetch), trener ich nie widzi w ogóle.
      //
      //  user_gamification  — klient i trener (pasek postępu w ProfileTab).
      //                       Admin nie ma widoku gamifikacji.
      //
      log("[LOGIN] role=", role, "| isTrainer=", isTrainer);

      const [comps, overrides, gameRows] = await Promise.all([
        !isAdmin
          ? db.get(rawUser.accessToken, "completions",
              `user_id=eq.${rawUser.id}&order=created_at.asc&select=*`).catch(() => [])
          : Promise.resolve([]),

        !isAdmin && !isTrainer
          ? db.get(rawUser.accessToken, "training_overrides", "select=*").catch(() => [])
          : Promise.resolve([]),

        !isAdmin
          ? db.get(rawUser.accessToken, "user_gamification",
              `user_id=eq.${rawUser.id}&select=points,streak_current`).catch(() => [])
          : Promise.resolve([]),
      ]);

      const u = {
        id:           rawUser.id,
        email:        rawUser.email,
        accessToken:  rawUser.accessToken,
        name:         profile?.name          || rawUser.name         || rawUser.email,
        login:        profile?.login         || rawUser.login        || rawUser.email,
        role,
        stanowisko:   profile?.stanowisko    || rawUser.stanowisko   || null,
        firma:        profile?.firma         || rawUser.firma        || null,
        phone:        profile?.phone         || rawUser.phone        || null,
        active_groups: profile?.active_groups || rawUser.active_groups || ["tech","ur","maszyny"],
        notif_reminder: profile?.notif_reminder ?? rawUser.notif_reminder ?? true,
        notif_cert:     profile?.notif_cert     ?? rawUser.notif_cert     ?? true,
        trainer_id,
        trainer_view:   profile?.trainer_view    ?? "client",
        name_locked:    profile?.name_locked     ?? false,
      };
      u.displayName = u.name;
      u.displayRole = u.stanowisko || "";

      setUserRaw(u);
      if (Array.isArray(u.active_groups) && u.active_groups.length)
        setActiveGroups(u.active_groups);
      setNotifReminder(u.notif_reminder);
      setNotifCert(u.notif_cert);
      setTrainerViewRaw(u.trainer_view || "client");

      log("[LOGIN] completions loaded:", comps.length);
      setCompleted(comps.map(c => ({
        training:   c.training_data,
        date:       c.date,
        key:        c.code_key,
        trainer:    c.trainer || null,
        trainerNum: parseInt(c.code_key?.slice(-1)) || 1,
        cert_id:    c.cert_id || null,
      })));

      const overridesMap = {};
      overrides.forEach(ov => { overridesMap[ov.training_id] = ov; });
      setTrainingOverrides(overridesMap);

      const gd = gameRows[0] || { points: 0, streak_current: 0 };
      setGameData({ points: gd.points || 0, streak_current: gd.streak_current || 0 });

    } catch(e) {
      logErr("[LOGIN] ERROR loading data:", e.message);
    } finally {
      setDataLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleComplete = useCallback(async (entry) => {
    const { generateCertId, isDuplicateCertId } = await import("./lib/certId");
    const MAX_ATTEMPTS = 5;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const certId = generateCertId({ trainingId: entry.training.id, date: entry.date });

      // Optymistyczny update — modal od razu ma cert_id
      setCompleted(p => {
        const filtered = p.filter(c => c.training.id !== entry.training.id);
        return [...filtered, { ...entry, cert_id: certId }];
      });

      try {
        const payload = {
          training_data:      entry.training,
          date:               entry.date,
          code_key:           entry.key,
          trainer:            entry.trainer || null,
          cert_id:            certId,
        };
        const updated = await db.update(
          user.accessToken, "completions",
          `user_id=eq.${user.id}&training_id=eq.${entry.training.id}`,
          payload
        );
        if (!updated || updated.length === 0) {
          await db.insert(user.accessToken, "completions", {
            user_id:     user.id,
            training_id: entry.training.id,
            ...payload,
          });
        }
        break; // sukces — wyjdź z pętli
      } catch(e) {
        if (isDuplicateCertId(e) && attempt < MAX_ATTEMPTS - 1) {
          log(`[COMPLETE] cert_id kolizja (próba ${attempt + 1}), genenuję nowy…`);
          continue; // wygeneruj nowy cert_id i spróbuj ponownie
        }
        logErr("[COMPLETE] ERROR saving:", e.message);
        addToast("⚠️ Błąd zapisu: " + e.message);
        break;
      }
    }
  }, [user, addToast]);

  const handleLogout = useCallback(async () => {
    try { await auth.signOut(user?.accessToken); } catch {}
    try { await caches.delete("supabase-api"); } catch {}
    try { localStorage.removeItem("eea_remember"); } catch {}
    if (realtimeUnsub.current) { realtimeUnsub.current(); realtimeUnsub.current = null; }
    setUserRaw(null); setCompleted([]); setTab(0); setMsgCount(0);
    setTrainerViewRaw("client"); setTrainingOverrides({});
    setActiveGroups(["tech","ur","maszyny"]); setNotifReminder(true); setNotifCert(true);
  }, [user]);

  const refreshGameData = useCallback(async () => {
    if (!user?.accessToken || !user?.id) return;
    try {
      const rows = await db.get(user.accessToken, "user_gamification", `user_id=eq.${user.id}&select=points,streak_current`);
      const gd = rows[0] || { points: 0, streak_current: 0 };
      setGameData({ points: gd.points || 0, streak_current: gd.streak_current || 0 });
      setGramRefreshKey(k => k + 1);
    } catch {}
  }, [user]);

  const progress = useMemo(
    () => calcProgress(completed, activeGroups),
    [completed, activeGroups]
  );

  const bannerSub = useMemo(
    () => [user?.stanowisko, user?.firma].filter(Boolean).join(" · "),
    [user?.stanowisko, user?.firma]
  );

  const userContextValue = useMemo(() => ({
    user,
    token: user?.accessToken ?? null,
    setUser: setUserRaw,
    progress,
  }), [user, progress]);

  // ── Publiczne strony — dostępne bez logowania ─────────────────────────
  // Sprawdzamy pathname PRZED sessionChecked żeby nie czekać na auth.
  // Klasa public-page na html+body włącza overflow:auto (CSS w index.html).
  // Klasa jest TYLKO na public pages — nie wycieka do widoku app.
  const pathname = window.location.pathname;
  const isVerifyPage = pathname.startsWith("/verify/");
  const isPublicPage = pathname === "/rejestracja" || pathname === "/regulamin" || isVerifyPage;
  if (isPublicPage) {
    document.documentElement.classList.add("public-page");
    document.body.classList.add("public-page");
  } else {
    document.documentElement.classList.remove("public-page");
    document.body.classList.remove("public-page");
  }
  if (pathname === "/rejestracja") {
    return (
      <Suspense fallback={<div style={styles.suspenseFallback}><Spinner/></div>}>
        <RegistrationForm />
      </Suspense>
    );
  }
  if (pathname === "/regulamin") {
    return (
      <Suspense fallback={<div style={styles.suspenseFallback}><Spinner/></div>}>
        <TermsPage />
      </Suspense>
    );
  }
  if (isVerifyPage) {
    return (
      <Suspense fallback={<div style={styles.suspenseFallback}><Spinner/></div>}>
        <VerifyPage />
      </Suspense>
    );
  }

  if (!sessionChecked) return (
    <div style={styles.loadingWrapper}>
      <div style={styles.loadingInner}>
        <div style={styles.spinner}/>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <span style={styles.loadingText}>Ładowanie...</span>
      </div>
    </div>
  );

  if (!user) {
    if (resetToken) {
      return (
        <ResetPasswordForm
          accessToken={resetToken}
          onDone={() => setResetToken(null)}
        />
      );
    }
    return <LoginScreen onLogin={handleLogin}/>;
  }

  const isAdmin = user.role === "admin";
  const isTrainer     = user.trainer_id != null;
  const inTrainerView = isTrainer && trainerView === "trainer";

  return (
    <UserContext.Provider value={userContextValue}>

      {isAdmin ? (
        <Suspense fallback={<div style={styles.suspenseFallback}><Spinner/></div>}>
          <AdminPanel user={user} onLogout={handleLogout}/>
        </Suspense>
      ) : inTrainerView ? (
        <TrainerView
          tab={tab} setTab={setTab}
          msgCount={msgCount}
          completed={completed}
          activeGroups={activeGroups}
          setActiveGroups={setActiveGroups}
          onLogout={handleLogout}
          trainerView={trainerView}
          setTrainerView={setTrainerView}
          bannerSub={bannerSub}
          readIds={readIds}
          onMarkRead={handleMarkRead}
          msgRefreshKey={msgRefreshKey}
          gramRefreshKey={gramRefreshKey}
        />
      ) : (
        <ClientView
          tab={tab} setTab={handleSetTab}
          completed={completed}
          activeGroups={activeGroups}
          setActiveGroups={setActiveGroups}
          onLogout={handleLogout}
          trainerView={trainerView}
          setTrainerView={setTrainerView}
          dataLoading={dataLoading}
          msgCount={msgCount}
          progress={progress}
          bannerSub={bannerSub}
          trainingOverrides={trainingOverrides}
          onComplete={handleComplete}
          gameData={gameData}
          onTipConfirmed={refreshGameData}
          gramRefreshKey={gramRefreshKey}
          scheduleRefreshKey={scheduleRefreshKey}
          readIds={readIds}
          onMarkRead={handleMarkRead}
          msgRefreshKey={msgRefreshKey}
        />
      )}
    </UserContext.Provider>
  );
}

/* ─── WIDOK TRENERA ──────────────────────────────────────────────────────── */
function TrainerView({ tab, setTab, msgCount, completed, activeGroups, setActiveGroups, onLogout, trainerView, setTrainerView, bannerSub, readIds, onMarkRead, msgRefreshKey, gramRefreshKey }) {
  const { user } = useUser();
  const [showGram, setShowGram] = useState(false);

  useEffect(() => {
    const handler = () => { setShowGram(false); setTab(2); };
    window.addEventListener("gram:goToMessages", handler);
    return () => window.removeEventListener("gram:goToMessages", handler);
  }, [setTab]);

  return (
    <div className="app-container" style={styles.appContainer}>
      <Header onLogout={onLogout}/>
      <div style={styles.banner}>
        <span style={styles.bannerName}>
          {user.displayName}{bannerSub ? ` · ${bannerSub}` : ""}
        </span>
        <span style={styles.trainerBadge}>TRENER</span>
      </div>
      <div style={styles.trainerContent}>
        <div style={tab === 0 ? {display:"flex",flexDirection:"column"} : {display:"none"}}>
          <TrainerScheduleTab trainerNum={user.trainer_id}/>
        </div>
        <div style={tab === 1 ? {display:"flex",flexDirection:"column"} : {display:"none"}}>
          <Suspense fallback={<Spinner/>}>
            <AdminCodeGen defaultTrainer={user.trainer_id}/>
          </Suspense>
        </div>
        <div style={tab === 2 ? {display:"flex",flexDirection:"column"} : {display:"none"}}>
          <MessagesTab readIds={readIds} onMarkRead={onMarkRead} msgRefreshKey={msgRefreshKey}/>
        </div>
        <div style={tab === 3 ? {display:"flex",flexDirection:"column"} : {display:"none"}}>
          <Suspense fallback={<Spinner/>}>
            <AdminQuiz/>
          </Suspense>
        </div>
        <div style={tab === 4 ? {display:"flex",flexDirection:"column"} : {display:"none"}}>
          <ProfileTab
            completed={completed}
            activeGroups={activeGroups}
            setActiveGroups={setActiveGroups}
            onLogout={onLogout}
            trainerView={trainerView}
            setTrainerView={setTrainerView}
            onOpenGram={() => setShowGram(true)}
          />
        </div>
      </div>
      <TrainerTabBar tab={tab} setTab={setTab} msgCount={msgCount}/>
      {showGram && (
        <Suspense fallback={<div style={styles.suspenseFallback}><Spinner/></div>}>
          <GramTab key={gramRefreshKey} onClose={() => setShowGram(false)} onGoToMessages={() => { setShowGram(false); setTab(2); }}/>
        </Suspense>
      )}
    </div>
  );
}

/* ─── WIDOK KLIENTA ──────────────────────────────────────────────────────── */
function ClientView({ tab, setTab, completed, activeGroups, setActiveGroups, onLogout, trainerView, setTrainerView, dataLoading, msgCount, progress, bannerSub, trainingOverrides, onComplete, gameData, onTipConfirmed, gramRefreshKey, scheduleRefreshKey, readIds, onMarkRead, msgRefreshKey }) {
  const { user } = useUser();
  const [showGram, setShowGram] = useState(false);

  useEffect(() => {
    const handler = () => { setShowGram(false); setTab(3); };
    window.addEventListener("gram:goToMessages", handler);
    return () => window.removeEventListener("gram:goToMessages", handler);
  }, [setTab]);

  return (
    <div className="app-container" style={styles.appContainer}>
      <Header onLogout={onLogout}/>
      <div style={styles.banner}>
        <span style={styles.bannerName}>
          {user.displayName}{bannerSub ? ` · ${bannerSub}` : ""}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <button
            onClick={() => setShowGram(true)}
            style={{ background: "none", border: "none", padding: "2px 6px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, borderRadius: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.greyDk }}>🔥 {gameData?.streak_current || 0}</span>
            <span style={{ color: C.grey, fontSize: 12 }}>·</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.green }}>{gameData?.points || 0} pkt</span>
          </button>
        </div>
      </div>
      <div style={styles.appContent}>
        <div style={tab === 0 ? styles.tabVisible : styles.tabHidden}>
          <TrainingTab completed={completed} onComplete={onComplete} activeGroups={activeGroups} loading={dataLoading} trainingOverrides={trainingOverrides}/>
        </div>
        <div style={tab === 1 ? styles.tabVisible : styles.tabHidden}>
          <CatalogTab completed={completed} activeGroups={activeGroups}/>
        </div>
        <div style={tab === 2 ? styles.tabVisible : styles.tabHidden}>
          <ScheduleTab refreshKey={scheduleRefreshKey} activeGroups={activeGroups} trainerNum={user.trainer_id}/>
        </div>
        <div style={tab === 3 ? styles.tabVisible : styles.tabHidden}>
          <MessagesTab onTipConfirmed={onTipConfirmed} readIds={readIds} onMarkRead={onMarkRead} msgRefreshKey={msgRefreshKey}/>
        </div>
        <div style={tab === 4 ? styles.tabVisible : styles.tabHidden}>
          <ProfileTab
            completed={completed}
            activeGroups={activeGroups}
            setActiveGroups={setActiveGroups}
            onLogout={onLogout}
            trainerView={trainerView}
            setTrainerView={setTrainerView}
            onOpenGram={() => setShowGram(true)}
          />
        </div>
      </div>
      <TabBar tab={tab} setTab={setTab} completedCount={completed.length} msgCount={msgCount}/>
      {/* POPRAWKA: GramTab w Suspense — lazy import, spinner podczas ładowania */}
      {showGram && (
        <Suspense fallback={<div style={styles.suspenseFallback}><Spinner/></div>}>
          <GramTab key={gramRefreshKey} onClose={() => setShowGram(false)} onGoToMessages={() => { setShowGram(false); setTab(3); }}/>
        </Suspense>
      )}
    </div>
  );
}

/* ─── TABBAR TRENERA ─────────────────────────────────────────────────────── */
const tabBtnBase = { flex: 1, background: "none", border: "none", padding: "8px 2px", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, cursor: "pointer", position: "relative" };

function TrainerTabBar({ tab, setTab, msgCount }) {
  return (
    <div className="tabbar" style={styles.tabBar}>
      {TRAINER_TABS.map((label, i) => {
        const Icon = TAB_ICONS_TRAINER[i];
        return (
          <button key={i} onClick={() => setTab(i)}
            style={{ ...tabBtnBase, borderTop: `3px solid ${tab === i ? C.green : "transparent"}` }}>
            {i === 2 && msgCount > 0 && (
              <div style={{ position: "absolute", top: 4, right: "calc(50% - 16px)", background: C.red, color: C.white, borderRadius: "50%", width: 15, height: 15, fontSize: 8, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {msgCount}
              </div>
            )}
            <Icon active={tab === i}/>
            <span style={{ fontSize: 10, fontWeight: 600, color: tab === i ? C.black : C.greyMid, letterSpacing: .2 }}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
