import { useState, useEffect, useRef, useCallback } from "react";
import { C, GROUPS, TRAINERS } from "../../lib/constants";
import { TRAININGS } from "../../data/trainings";
import { db, SB_URL, authHeaders, edge } from "../../lib/supabase";
import { Spinner } from "../SharedUI";
import { useToast } from "../../lib/ToastContext";

/* ─── helpers ──────────────────────────────────────────────────────────────── */
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function fmtDate(raw) {
  if (!raw) return "";
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(raw)) return raw;
  const dateOnly = raw.split("T")[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
    const [y,m,d] = dateOnly.split("-");
    return `${d}.${m}.${y}`;
  }
  return raw;
}

function syntheticKey(trainingId, date, trainerNum) {
  const short = trainingId === "ST"
    ? "ST"
    : (TRAININGS.find(t => t.id === trainingId)?.short || trainingId).toUpperCase();
  const [y,m,d] = (date || today()).split("-");
  return `${short}${d}${m}${y}T${trainerNum || 1}`;
}

function stTrainingId(name) {
  return "ST_" + name.trim().toLowerCase()
    .replace(/ą/g,"a").replace(/ć/g,"c").replace(/ę/g,"e").replace(/ł/g,"l")
    .replace(/ń/g,"n").replace(/ó/g,"o").replace(/ś/g,"s").replace(/[źż]/g,"z")
    .replace(/[^a-z0-9]/g,"_").replace(/_+/g,"_").slice(0, 40);
}

/* ─── Badge komponenty ─────────────────────────────────────────────────────── */
function StatusBadge({ status }) {
  const cfg = {
    ok:      { bg: "#E8F8E8", color: "#27760A", label: "✓ Zaliczone" },
    already: { bg: "#FEF9E7", color: "#B7770D", label: "⚠ Już istnieje" },
    error:   { bg: "#FDEDEC", color: "#C0392B", label: "✕ Błąd" },
    pending: { bg: "#EBF5FB", color: "#2980B9", label: "⏳ Zapisywanie…" },
  }[status] || null;
  if (!cfg) return null;
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "2px 8px",
      background: cfg.bg, color: cfg.color, borderRadius: 4, whiteSpace: "nowrap",
    }}>{cfg.label}</span>
  );
}

/* ─── Sekcja: blokada imienia ──────────────────────────────────────────────── */
function NameLockSection({ user, token, onUnlocked }) {
  const { addToast } = useToast();
  const [unlocking, setUnlocking] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function doUnlock() {
    setUnlocking(true);
    try {
      const res = await db.update(token, "profiles", `id=eq.${user.id}`, { name_locked: false });
      if (res === null || res === undefined) throw new Error("Brak potwierdzenia z bazy — sprawdź RLS");
      addToast(`🔓 Odblokowano zmianę imienia dla ${user.name}`);
      onUnlocked();
    } catch (e) {
      addToast("✕ Błąd odblokowania: " + e.message);
    } finally {
      setUnlocking(false);
      setConfirmOpen(false);
    }
  }

  if (!user.name_locked) {
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "12px 14px", background: "#F0FBF0",
        border: "1px solid #a8e6b3", borderRadius: 8,
      }}>
        <span style={{ fontSize: 20 }}>🔓</span>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#1D8348" }}>Imię i nazwisko — odblokowane</div>
          <div style={{ fontSize: 11, color: "#27760A" }}>
            Użytkownik może zmienić imię i nazwisko (jeszcze nie zablokował).
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div style={{
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        padding: "12px 14px", background: "#fffbea",
        border: "1px solid #f5d78e", borderRadius: 8,
      }}>
        <span style={{ fontSize: 22 }}>🔒</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#7a4a00" }}>
            Imię i nazwisko — zablokowane
          </div>
          <div style={{ fontSize: 11, color: "#8a5a00", lineHeight: 1.4 }}>
            Użytkownik już raz zmienił imię. Certyfikaty są generowane na: <strong>{user.name}</strong>
          </div>
        </div>
        <button
          onClick={() => setConfirmOpen(true)}
          disabled={unlocking}
          style={{
            padding: "7px 14px", fontSize: 12, fontWeight: 700,
            background: "#e67e22", border: "none", color: "#fff",
            borderRadius: 6, cursor: "pointer", flexShrink: 0,
            display: "flex", alignItems: "center", gap: 6,
          }}
        >
          🔓 Odblokuj ponowną zmianę
        </button>
      </div>

      {/* Mini-modal potwierdzenia */}
      {confirmOpen && (
        <div style={{
          background: "#FFF8F0", border: "1.5px solid #e67e22",
          borderRadius: 8, padding: 14, marginTop: 4,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#7a4a00", marginBottom: 8 }}>
            Potwierdzenie odblokowania
          </div>
          <div style={{ fontSize: 12, color: C.greyDk, lineHeight: 1.5, marginBottom: 12 }}>
            Użytkownik <strong>{user.name}</strong> będzie mógł jednorazowo zmienić imię
            i nazwisko. Po zmianie pole zostanie automatycznie zablokowane ponownie.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setConfirmOpen(false)}
              style={{
                flex: 1, background: "none", border: `1px solid ${C.grey}`,
                color: C.greyDk, padding: "9px 0", fontSize: 12,
                fontWeight: 600, borderRadius: 6, cursor: "pointer",
              }}
            >
              Anuluj
            </button>
            <button
              onClick={doUnlock}
              disabled={unlocking}
              style={{
                flex: 2, background: unlocking ? "#ccc" : "#e67e22",
                border: "none", color: "#fff", padding: "9px 0",
                fontSize: 12, fontWeight: 700, borderRadius: 6,
                cursor: unlocking ? "not-allowed" : "pointer",
              }}
            >
              {unlocking ? "Odblokowuję…" : "✓ Tak, odblokuj"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/* ─── Sekcja: lista zaliczeń z możliwością kasowania ──────────────────────── */
function CompletionsSection({ selUser, userComps, token, onDeleted }) {
  const { addToast } = useToast();
  const [deleting, setDeleting] = useState(null); // training_id w trakcie kasowania
  const [confirmDel, setConfirmDel] = useState(null); // training_id do potwierdzenia

  async function doDelete(trainingId) {
    setDeleting(trainingId);
    try {
      await db.remove(token, "completions",
        `user_id=eq.${selUser.id}&training_id=eq.${trainingId}`
      );
      addToast("✓ Zaliczenie usunięte");
      onDeleted(trainingId);
    } catch (e) {
      addToast("✕ Błąd usuwania: " + e.message);
    } finally {
      setDeleting(null);
      setConfirmDel(null);
    }
  }

  if (userComps.length === 0) return null;

  return (
    <div style={{ background: C.white, borderRadius: 8, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,.08)" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.greyMid, letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>
        Zaliczone szkolenia — {selUser.name} ({userComps.length})
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {userComps.map((c) => {
          const t = TRAININGS.find(x => x.id === c.training_id) || c.training_data;
          const grp = GROUPS.find(g => g.id === t?.group);
          const isConfirming = confirmDel === c.training_id;
          const isDeletingThis = deleting === c.training_id;

          return (
            <div key={c.training_id} style={{
              borderRadius: 6, overflow: "hidden",
              border: `1px solid ${isConfirming ? "#E74C3C" : C.grey}`,
              transition: "border-color .15s",
            }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 10, padding: "9px 12px",
                background: isConfirming ? "#FDF3F3" : C.greyBg,
                borderLeft: `4px solid ${grp?.color || C.green}`,
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.black }}>
                    {t?.short || c.training_id} — {t?.title || "—"}
                  </div>
                  <div style={{ fontSize: 10, color: C.greyMid, marginTop: 2 }}>
                    📅 {fmtDate(c.date)}
                    {c.trainer && <span style={{ marginLeft: 8 }}>🎓 {c.trainer}</span>}
                  </div>
                </div>
                {!isConfirming && (
                  <button
                    onClick={() => setConfirmDel(c.training_id)}
                    disabled={isDeletingThis}
                    style={{
                      background: "none", border: `1px solid #E74C3C`, color: "#C0392B",
                      padding: "4px 10px", fontSize: 11, fontWeight: 700,
                      borderRadius: 5, cursor: "pointer", flexShrink: 0,
                    }}
                  >
                    Usuń
                  </button>
                )}
                {isConfirming && (
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button
                      onClick={() => setConfirmDel(null)}
                      style={{
                        background: "none", border: `1px solid ${C.grey}`,
                        color: C.greyDk, padding: "4px 10px", fontSize: 11,
                        fontWeight: 600, borderRadius: 5, cursor: "pointer",
                      }}
                    >
                      Anuluj
                    </button>
                    <button
                      onClick={() => doDelete(c.training_id)}
                      disabled={isDeletingThis}
                      style={{
                        background: isDeletingThis ? "#ccc" : "#C0392B",
                        border: "none", color: "#fff", padding: "4px 10px",
                        fontSize: 11, fontWeight: 700, borderRadius: 5,
                        cursor: isDeletingThis ? "not-allowed" : "pointer",
                      }}
                    >
                      {isDeletingThis ? "Usuwam…" : "✓ Potwierdź"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/* ─── Główny komponent ─────────────────────────────────────────────────────── */
/* ═══════════════════════════════════════════════════════════════════════════ */
export function AdminUsers({ token }) {
  const { addToast } = useToast();

  /* — wyszukiwarka — */
  const [query,        setQuery]        = useState("");
  const [users,        setUsers]        = useState([]);
  const [searching,    setSearching]    = useState(false);
  const [searchDone,   setSearchDone]   = useState(false);
  const searchTimer                     = useRef(null);

  /* — wybrany użytkownik — */
  const [selUser,      setSelUser]      = useState(null);
  const [userComps,    setUserComps]    = useState([]);
  const [loadingComps, setLoadingComps] = useState(false);

  /* — formularz zaliczenia — */
  const [trainingMode, setTrainingMode] = useState("normal");
  const [selGroup,     setSelGroup]     = useState(GROUPS[0].id);
  const [selTraining,  setSelTraining]  = useState(TRAININGS.find(t => t.group === GROUPS[0].id)?.id || "");
  const [selDate,      setSelDate]      = useState(today());
  const [selTrainer,   setSelTrainer]   = useState(1);
  const [stName,       setStName]       = useState("");
  const [stDays,       setStDays]       = useState(1);

  /* — batch queue — */
  const [queue,        setQueue]        = useState([]);
  const [saving,       setSaving]       = useState(false);

  /* — kasowanie konta — */
  const [deletePin,        setDeletePin]        = useState("");
  const [deletePinInput,   setDeletePinInput]   = useState("");
  const [deleteStatus,     setDeleteStatus]     = useState(null);
  const [deleteResult,     setDeleteResult]     = useState(null);
  const [deleteError,      setDeleteError]      = useState("");

  useEffect(() => {
    const first = TRAININGS.find(t => t.group === selGroup);
    if (first) setSelTraining(first.id);
  }, [selGroup]);

  /* ── Wyszukiwarka ───────────────────────────────────────────────────────── */
  const runSearch = useCallback(async (q) => {
    const trimmed = q.trim();
    if (trimmed.length < 2) { setUsers([]); setSearchDone(false); return; }
    setSearching(true);
    try {
      let data = [];
      let rpcOk = false;
      try {
        const r = await fetch(`${SB_URL}/rest/v1/rpc/search_users_for_admin`, {
          method: "POST",
          headers: { ...authHeaders(token), "Content-Type": "application/json" },
          body: JSON.stringify({ search_query: trimmed }),
        });
        if (r.ok) { data = await r.json(); rpcOk = true; }
      } catch { /* RPC niedostępne */ }

      if (!rpcOk) {
        const queries = new Set([trimmed]);
        if (trimmed.includes("@")) {
          const [local, domain] = trimmed.split("@");
          if (local)   queries.add(local);
          if (domain)  queries.add(domain);
          const spaced = local.replace(/[._-]/g, " ");
          if (spaced !== local) queries.add(spaced);
        }
        const results = new Map();
        for (const term of queries) {
          const enc = encodeURIComponent(`%${term}%`);
          try {
            const rows = await db.get(token, "profiles",
              `or=(name.ilike.${enc},login.ilike.${enc},firma.ilike.${enc})` +
              `&select=id,name,login,email,firma,stanowisko,role,trainer_id,name_locked&limit=30&order=name.asc`
            );
            if (Array.isArray(rows)) rows.forEach(r => results.set(r.id, r));
          } catch { /* ignoruj */ }
        }
        data = [...results.values()];
      }
      setUsers(Array.isArray(data) ? data : []);
    } catch(e) {
      addToast("Błąd wyszukiwania: " + e.message);
      setUsers([]);
    } finally {
      setSearching(false);
      setSearchDone(true);
    }
  }, [token, addToast]);

  useEffect(() => {
    clearTimeout(searchTimer.current);
    if (query.trim().length < 2) { setUsers([]); setSearchDone(false); return; }
    searchTimer.current = setTimeout(() => runSearch(query), 350);
    return () => clearTimeout(searchTimer.current);
  }, [query, runSearch]);

  /* ── Wybór użytkownika ──────────────────────────────────────────────────── */
  async function selectUser(u) {
    setSelUser(u);
    setUsers([]);
    setQuery(u.name || u.email || u.login || "");
    setSearchDone(false);
    setLoadingComps(true);
    try {
      const data = await db.get(token, "completions",
        `user_id=eq.${u.id}&select=training_id,training_data,date,code_key,trainer`
      );
      setUserComps(Array.isArray(data) ? data : []);
    } catch { setUserComps([]); }
    setLoadingComps(false);
    // Reset stanów akcji
    setQueue([]);
    setDeleteStatus(null);
  }

  function clearUser() {
    setSelUser(null); setUserComps([]); setQueue([]);
    setQuery(""); setSearchDone(false); setDeleteStatus(null);
  }

  /* ── Zaliczenia — dodawanie ─────────────────────────────────────────────── */
  function addToQueue() {
    if (!selUser) return;
    let training;
    if (trainingMode === "ST") {
      if (!stName.trim()) { addToast("⚠ Wpisz nazwę szkolenia specjalnego"); return; }
      const tid = stTrainingId(stName);
      training = {
        id: tid, short: "ST", title: stName.trim(),
        group: "tech", category: "specjalne",
        duration: stDays === 1 ? "1 dzień" : `${stDays} dni`,
        level: 1, isSpecial: true,
      };
    } else {
      training = TRAININGS.find(t => t.id === selTraining);
      if (!training) return;
    }
    if (queue.some(q => q.userId === selUser.id && q.training.id === training.id)) {
      addToast("⚠ To szkolenie jest już w kolejce dla tego uczestnika"); return;
    }
    const alreadyDone = userComps.some(c => c.training_id === training.id);
    setQueue(prev => [...prev, {
      id: `${selUser.id}_${training.id}_${Date.now()}`,
      userId: selUser.id,
      userName: selUser.name || selUser.login || selUser.id,
      training, date: selDate, trainerNum: selTrainer,
      trainerName: TRAINERS[selTrainer] || `T${selTrainer}`,
      status: alreadyDone ? "already" : null,
    }]);
    if (trainingMode === "ST") setStName("");
  }

  /* ── Zaliczenia — zapis ─────────────────────────────────────────────────── */
  async function saveAll() {
    const toSave = queue.filter(q => q.status !== "already" && q.status !== "ok");
    if (!toSave.length) return;
    setSaving(true);
    for (const item of toSave) {
      setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: "pending" } : q));
      try {
        const codeKey = syntheticKey(item.training.id, item.date, item.trainerNum);
        const payload = {
          user_id: item.userId, training_id: item.training.id,
          training_data: item.training, date: item.date,
          code_key: codeKey, trainer: item.trainerName,
        };
        const existing = await db.get(token, "completions",
          `user_id=eq.${item.userId}&training_id=eq.${item.training.id}&select=id`
        );
        if (existing?.length > 0) {
          await db.update(token, "completions",
            `user_id=eq.${item.userId}&training_id=eq.${item.training.id}`,
            { training_data: item.training, date: item.date, code_key: codeKey, trainer: item.trainerName }
          );
        } else {
          await db.insert(token, "completions", payload);
        }
        setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: "ok", codeKey } : q));
        // Dodaj do lokalnej listy zaliczeń
        setUserComps(prev => {
          const filtered = prev.filter(c => c.training_id !== item.training.id);
          return [...filtered, { training_id: item.training.id, training_data: item.training, date: item.date, trainer: item.trainerName }];
        });
      } catch(e) {
        setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: "error", err: e.message } : q));
      }
    }
    setSaving(false);
    addToast("✓ Zakończono zapis do bazy");
  }

  /* ── Kasowanie konta ────────────────────────────────────────────────────── */
  function startDelete() {
    const pin = String(Math.floor(100000 + Math.random() * 900000));
    setDeletePin(pin); setDeletePinInput(""); setDeleteStatus("confirm");
    setDeleteResult(null); setDeleteError("");
  }
  function cancelDelete() { setDeleteStatus(null); setDeletePinInput(""); setDeletePin(""); }
  async function confirmDelete() {
    if (deletePinInput !== deletePin) return;
    setDeleteStatus("deleting");
    try {
      const result = await edge.deleteUser(token, selUser.id);
      setDeleteResult(result); setDeleteStatus("done");
      addToast(`✓ Konto ${result.deleted_email} zostało usunięte`);
      clearUser();
    } catch(e) {
      setDeleteError(e.message || "Błąd serwera"); setDeleteStatus("error");
    }
  }

  const groupTrainings = TRAININGS.filter(t => t.group === selGroup);
  const pendingCount = queue.filter(q => q.status !== "already" && q.status !== "ok").length;

  /* ═════════════════════════════════════════════════════════════════════════ */
  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14, maxWidth: 800 }}>

      {/* ── Nagłówek ── */}
      <div style={{ background: C.white, borderRadius: 8, padding: "14px 18px", boxShadow: "0 1px 4px rgba(0,0,0,.08)" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.black, marginBottom: 4 }}>
          👥 Zarządzanie użytkownikami
        </div>
        <div style={{ fontSize: 12, color: C.greyMid, lineHeight: 1.5 }}>
          Wyszukaj użytkownika — przeglądaj i edytuj jego zaliczenia, odblokuj zmianę imienia lub usuń konto.
        </div>
      </div>

      {/* ── Wyszukiwarka ── */}
      <div style={{ background: C.white, borderRadius: 8, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,.08)" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.greyMid, letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>
          Znajdź użytkownika
        </div>

        {selUser ? (
          /* Karta wybranego użytkownika */
          <div style={{
            background: C.greyBg, border: `1.5px solid ${C.grey}`,
            borderRadius: 8, padding: "14px 16px",
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              {/* Avatar */}
              <div style={{
                width: 44, height: 44, borderRadius: "50%", background: C.black,
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                <span style={{ color: C.white, fontWeight: 700, fontSize: 16 }}>
                  {(selUser.name || "?").split(" ").map(n => n[0]).join("").slice(0,2).toUpperCase()}
                </span>
              </div>

              {/* Dane */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: C.black }}>{selUser.name || "—"}</span>
                  {selUser.role === "admin" && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: C.white, background: C.black, padding: "2px 7px", borderRadius: 4 }}>ADMIN</span>
                  )}
                  {selUser.trainer_id && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: C.green, background: C.greenBg, padding: "2px 7px", borderRadius: 4 }}>TRENER T{selUser.trainer_id}</span>
                  )}
                  {/* Ikona kłódki — status blokady imienia */}
                  <span
                    title={selUser.name_locked ? "Imię zablokowane" : "Imię odblokowane"}
                    style={{ fontSize: 16, cursor: "default" }}
                  >
                    {selUser.name_locked ? "🔒" : "🔓"}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: C.greyDk }}>
                  {(selUser.email || selUser.login) && (
                    <span style={{ fontFamily: "monospace" }}>{selUser.email || selUser.login}</span>
                  )}
                  {selUser.firma && <span style={{ marginLeft: 8, opacity: .7 }}>· {selUser.firma}</span>}
                  {selUser.stanowisko && <span style={{ marginLeft: 8, opacity: .7 }}>· {selUser.stanowisko}</span>}
                </div>
                {loadingComps ? (
                  <div style={{ fontSize: 10, color: C.greyMid, marginTop: 4 }}>Ładowanie zaliczeń…</div>
                ) : (
                  <div style={{ fontSize: 10, color: "#27760A", marginTop: 4, fontWeight: 600 }}>
                    ✓ {userComps.length} {userComps.length === 1 ? "szkolenie zaliczone" : "szkoleń zaliczonych"}
                  </div>
                )}
              </div>

              <button onClick={clearUser} style={{
                background: "none", border: `1px solid ${C.grey}`,
                color: C.greyDk, padding: "5px 12px", fontSize: 11,
                fontWeight: 600, cursor: "pointer", borderRadius: 4, flexShrink: 0,
              }}>
                Zmień
              </button>
            </div>

            {/* Blokada imienia — inline pod kartą usera */}
            <div style={{ marginTop: 12 }}>
              <NameLockSection
                user={selUser}
                token={token}
                onUnlocked={() => setSelUser(u => ({ ...u, name_locked: false }))}
              />
            </div>
          </div>
        ) : (
          /* Pole wyszukiwania */
          <div style={{ position: "relative" }}>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Imię, nazwisko, e-mail lub firma…"
                autoComplete="off"
                style={{
                  flex: 1, padding: "10px 14px", border: `1.5px solid ${C.grey}`,
                  borderRadius: 6, fontSize: 13, color: C.black, outline: "none",
                  boxSizing: "border-box",
                }}
              />
              {searching && <div style={{ display: "flex", alignItems: "center" }}><Spinner size={18}/></div>}
            </div>
            {searchDone && query.trim().length >= 2 && (
              <div style={{
                position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 100,
                background: C.white, border: `1px solid ${C.grey}`, borderRadius: 6,
                boxShadow: "0 4px 16px rgba(0,0,0,.12)", maxHeight: 280, overflowY: "auto",
              }}>
                {users.length === 0 ? (
                  <div style={{ padding: "14px 16px", fontSize: 13, color: C.greyMid, textAlign: "center" }}>
                    Brak wyników dla „{query}"
                  </div>
                ) : users.map(u => (
                  <button key={u.id} onClick={() => selectUser(u)}
                    style={{
                      width: "100%", background: "none", border: "none", padding: "10px 14px",
                      textAlign: "left", cursor: "pointer", borderBottom: `1px solid ${C.grey}`,
                      display: "flex", flexDirection: "column", gap: 2,
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = C.greyBg}
                    onMouseLeave={e => e.currentTarget.style.background = "none"}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: C.black }}>
                        {u.name || u.login || u.email || "—"}
                      </span>
                      {u.trainer_id && <span style={{ fontSize: 10, color: C.green, fontWeight: 700 }}>TRENER T{u.trainer_id}</span>}
                      <span style={{ fontSize: 13 }} title={u.name_locked ? "Imię zablokowane" : "Imię odblokowane"}>
                        {u.name_locked ? "🔒" : "🔓"}
                      </span>
                    </div>
                    <span style={{ fontSize: 11, color: C.greyMid }}>
                      {(u.email || u.login) && <span style={{ fontFamily: "monospace" }}>{u.email || u.login}</span>}
                      {u.firma && <span style={{ marginLeft: 8 }}>· {u.firma}</span>}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Formularz nowego zaliczenia ── */}
      {selUser && !loadingComps && (
        <div style={{ background: C.white, borderRadius: 8, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,.08)" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.greyMid, letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>
            Dodaj zaliczenie szkolenia
          </div>

          {/* Rodzaj */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.greyDk, marginBottom: 6, letterSpacing: .5 }}>RODZAJ</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {GROUPS.map(g => (
                <button key={g.id}
                  onClick={() => { setTrainingMode("normal"); setSelGroup(g.id); }}
                  style={{
                    padding: "7px 14px", fontSize: 11, fontWeight: 700, cursor: "pointer", borderRadius: 20,
                    border: `1.5px solid ${g.color}`,
                    background: trainingMode === "normal" && selGroup === g.id ? g.color : "transparent",
                    color: trainingMode === "normal" && selGroup === g.id ? C.white : g.color,
                  }}>
                  {g.label}
                </button>
              ))}
              <button onClick={() => setTrainingMode("ST")} style={{
                padding: "7px 14px", fontSize: 11, fontWeight: 700, cursor: "pointer", borderRadius: 20,
                border: "1.5px solid #8E44AD",
                background: trainingMode === "ST" ? "#8E44AD" : "transparent",
                color: trainingMode === "ST" ? C.white : "#8E44AD",
              }}>
                ⭐ Specjalne (ST)
              </button>
            </div>
          </div>

          {trainingMode === "normal" && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.greyDk, marginBottom: 6, letterSpacing: .5 }}>SZKOLENIE</div>
              <select value={selTraining} onChange={e => setSelTraining(e.target.value)}
                style={{ width: "100%", padding: "10px 12px", border: `1.5px solid ${C.grey}`, borderRadius: 6, fontSize: 13, color: C.black, background: C.white, boxSizing: "border-box" }}>
                {groupTrainings.map(t => {
                  const done = userComps.some(c => c.training_id === t.id);
                  return <option key={t.id} value={t.id}>{done ? "✓ " : ""}{t.short} — {t.title} ({t.duration}){done ? " [już zaliczone]" : ""}</option>;
                })}
              </select>
            </div>
          )}

          {trainingMode === "ST" && (
            <div style={{ marginBottom: 12, background: "#F9F0FF", border: "1px solid rgba(142,68,173,.25)", borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#8E44AD", marginBottom: 10 }}>⭐ SZKOLENIE SPECJALNE</div>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.greyDk, marginBottom: 6 }}>NAZWA SZKOLENIA *</div>
                <input value={stName} onChange={e => setStName(e.target.value)}
                  placeholder="np. Szkolenie aplikacyjne — Hot Runner"
                  style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #8E44AD", borderRadius: 6, fontSize: 13, color: C.black, background: C.white, boxSizing: "border-box" }}
                />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.greyDk, marginBottom: 6 }}>CZAS TRWANIA</div>
                <div style={{ display: "flex", gap: 6 }}>
                  {[1,2,3,4,5].map(d => (
                    <button key={d} onClick={() => setStDays(d)} style={{
                      flex: 1, padding: "8px 0", fontSize: 14, fontWeight: 700, cursor: "pointer", borderRadius: 6,
                      border: `1.5px solid ${stDays === d ? "#8E44AD" : C.grey}`,
                      background: stDays === d ? "#8E44AD" : C.white,
                      color: stDays === d ? C.white : C.greyDk,
                    }}>{d}</button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
            <div style={{ flex: 1, minWidth: 140 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.greyDk, marginBottom: 6, letterSpacing: .5 }}>DATA SZKOLENIA</div>
              <input type="date" value={selDate} onChange={e => setSelDate(e.target.value)}
                style={{ width: "100%", padding: "10px 12px", border: `1.5px solid ${C.grey}`, borderRadius: 6, fontSize: 13, color: C.black, background: C.white, boxSizing: "border-box" }}
              />
            </div>
            <div style={{ flex: 2, minWidth: 180 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.greyDk, marginBottom: 6, letterSpacing: .5 }}>TRENER</div>
              <select value={selTrainer} onChange={e => setSelTrainer(Number(e.target.value))}
                style={{ width: "100%", padding: "10px 12px", border: `1.5px solid ${C.grey}`, borderRadius: 6, fontSize: 13, color: C.black, background: C.white, boxSizing: "border-box" }}>
                {Object.entries(TRAINERS).map(([num, name]) => (
                  <option key={num} value={num}>T{num} — {name}</option>
                ))}
              </select>
            </div>
          </div>

          {(trainingMode === "normal" ? selTraining : stName.trim()) && selDate && (
            <div style={{ background: C.greyBg, borderRadius: 6, padding: "8px 12px", marginBottom: 14, fontSize: 11, color: C.greyDk }}>
              <span style={{ fontWeight: 700, color: C.black }}>Klucz certyfikatu: </span>
              <code style={{ background: C.white, padding: "2px 6px", borderRadius: 4, fontFamily: "monospace", fontSize: 12, color: "#27760A" }}>
                {trainingMode === "ST" ? syntheticKey("ST", selDate, selTrainer) : syntheticKey(selTraining, selDate, selTrainer)}
              </code>
            </div>
          )}

          <button onClick={addToQueue} style={{
            width: "100%", background: C.black, color: C.white, border: "none",
            padding: "12px 0", fontSize: 13, fontWeight: 700, borderRadius: 6, cursor: "pointer",
          }}>
            + Dodaj do listy do zaliczenia
          </button>
        </div>
      )}

      {/* ── Kolejka ── */}
      {queue.length > 0 && (
        <div style={{ background: C.white, borderRadius: 8, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,.08)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.greyMid, letterSpacing: 1, textTransform: "uppercase" }}>
              Do zaliczenia ({queue.length})
            </div>
            {pendingCount > 0 && (
              <button onClick={saveAll} disabled={saving} style={{
                background: saving ? C.greyDk : "#27760A", color: C.white, border: "none",
                padding: "8px 20px", fontSize: 12, fontWeight: 700, borderRadius: 5,
                cursor: saving ? "not-allowed" : "pointer",
              }}>
                {saving ? "Zapisuję…" : `✓ Zapisz wszystkie (${pendingCount})`}
              </button>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {queue.map(item => {
              const grp = GROUPS.find(g => g.id === item.training.group);
              return (
                <div key={item.id} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                  background: item.status === "ok" ? "#F0FBF0" : item.status === "error" ? "#FDF0F0" : C.greyBg,
                  borderRadius: 6, borderLeft: `4px solid ${grp?.color || C.green}`,
                  flexWrap: "wrap",
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.black, marginBottom: 2 }}>
                      {item.training.short} — {item.training.title}
                    </div>
                    <div style={{ fontSize: 11, color: C.greyMid, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <span>👤 {item.userName}</span>
                      <span>📅 {fmtDate(item.date)}</span>
                      <span>🎓 {item.trainerName}</span>
                    </div>
                    {item.status === "error" && <div style={{ fontSize: 10, color: C.red, marginTop: 2 }}>Błąd: {item.err}</div>}
                  </div>
                  <StatusBadge status={item.status}/>
                  {item.status !== "ok" && item.status !== "pending" && (
                    <button onClick={() => setQueue(prev => prev.filter(q => q.id !== item.id))}
                      style={{ background: "none", border: "none", color: C.greyMid, cursor: "pointer", fontSize: 16, padding: "0 4px" }}>
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {queue.every(q => q.status === "ok" || q.status === "already") && (
            <div style={{ marginTop: 14, padding: "12px 14px", background: C.greenBg, borderRadius: 6, border: `1px solid ${C.green}`, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#27760A" }}>
                ✅ Wszystko zapisane! Uczestnicy mają dostęp do certyfikatów.
              </span>
              <button onClick={() => setQueue([])} style={{
                background: C.black, color: C.white, border: "none",
                padding: "6px 14px", fontSize: 11, fontWeight: 700, borderRadius: 4, cursor: "pointer",
              }}>
                Nowa seria
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Lista zaliczeń z kasowaniem ── */}
      {selUser && !loadingComps && (
        <CompletionsSection
          selUser={selUser}
          userComps={userComps}
          token={token}
          onDeleted={(tid) => setUserComps(prev => prev.filter(c => c.training_id !== tid))}
        />
      )}

      {/* ── Strefa niebezpieczna — kasowanie konta ── */}
      {selUser && deleteStatus === null && (
        <div style={{ background: C.white, borderRadius: 8, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,.08)", border: "1px solid #FDDEDE" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#C0392B", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>
            ⚠ Strefa niebezpieczna
          </div>
          <div style={{ fontSize: 12, color: C.greyDk, marginBottom: 12, lineHeight: 1.5 }}>
            Trwałe usunięcie konta <strong>{selUser.name || selUser.login}</strong> wraz ze wszystkimi danymi.
          </div>
          <button onClick={startDelete} style={{
            background: "none", border: "1.5px solid #E74C3C", color: "#C0392B",
            padding: "9px 18px", fontSize: 12, fontWeight: 700, borderRadius: 6, cursor: "pointer",
          }}>
            🗑 Usuń konto tego użytkownika
          </button>
        </div>
      )}

      {selUser && deleteStatus === "confirm" && (
        <div style={{ background: "#FDF3F3", borderRadius: 8, padding: 20, border: "1.5px solid #E74C3C" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#C0392B", marginBottom: 12 }}>🗑 Potwierdzenie usunięcia konta</div>
          <div style={{ fontSize: 12, color: C.greyDk, lineHeight: 1.6, marginBottom: 16 }}>
            Konto: <strong style={{ fontFamily: "monospace" }}>{selUser.name || selUser.login}</strong><br/>
            <strong style={{ color: "#C0392B" }}>Tej operacji nie można cofnąć.</strong>
          </div>
          <div style={{ background: C.white, border: "1px solid #F5B7B1", borderRadius: 8, padding: "14px 16px", marginBottom: 16, textAlign: "center" }}>
            <div style={{ fontSize: 11, color: C.greyMid, marginBottom: 6 }}>Przepisz ten kod aby potwierdzić:</div>
            <div style={{ fontSize: 28, fontWeight: 900, fontFamily: "monospace", letterSpacing: 6, color: "#C0392B" }}>{deletePin}</div>
          </div>
          <input type="text" value={deletePinInput}
            onChange={e => setDeletePinInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="Wpisz kod…" maxLength={6}
            style={{
              width: "100%", boxSizing: "border-box", padding: "11px 14px",
              fontSize: 20, fontFamily: "monospace", letterSpacing: 4, textAlign: "center", fontWeight: 700,
              border: `2px solid ${deletePinInput === deletePin ? "#27AE60" : deletePinInput.length === 6 ? "#E74C3C" : C.grey}`,
              borderRadius: 6, outline: "none", marginBottom: 14, background: C.white, color: C.black,
            }}
          />
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={cancelDelete} style={{ flex: 1, background: "none", border: `1px solid ${C.grey}`, color: C.greyDk, padding: "10px 0", fontSize: 12, fontWeight: 700, borderRadius: 6, cursor: "pointer" }}>
              Anuluj
            </button>
            <button onClick={confirmDelete} disabled={deletePinInput !== deletePin} style={{
              flex: 2, padding: "10px 0", fontSize: 12, fontWeight: 700, borderRadius: 6, border: "none",
              cursor: deletePinInput === deletePin ? "pointer" : "not-allowed",
              background: deletePinInput === deletePin ? "#C0392B" : "#FADBD8",
              color: deletePinInput === deletePin ? C.white : "#E74C3C",
            }}>
              ✓ Potwierdź i usuń konto
            </button>
          </div>
        </div>
      )}

      {deleteStatus === "deleting" && (
        <div style={{ background: "#FDF3F3", borderRadius: 8, padding: 20, textAlign: "center", border: "1px solid #F5B7B1" }}>
          <Spinner size={24}/>
          <div style={{ fontSize: 13, color: C.greyDk, marginTop: 10 }}>Usuwam konto i dane…</div>
        </div>
      )}

      {deleteStatus === "done" && deleteResult && (
        <div style={{ background: "#EAFAF1", borderRadius: 8, padding: 20, border: "1px solid #27AE60" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1D8348", marginBottom: 12 }}>✅ Konto usunięte</div>
          <div style={{ fontSize: 12, color: C.greyDk, marginBottom: 10 }}>
            <strong>Email:</strong> <code style={{ fontFamily: "monospace" }}>{deleteResult.deleted_email}</code>
          </div>
          <button onClick={() => setDeleteStatus(null)} style={{ background: "none", border: `1px solid ${C.grey}`, color: C.greyDk, padding: "7px 16px", fontSize: 11, fontWeight: 700, borderRadius: 5, cursor: "pointer" }}>OK</button>
        </div>
      )}

      {deleteStatus === "error" && (
        <div style={{ background: "#FDF3F3", borderRadius: 8, padding: 16, border: "1px solid #E74C3C" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#C0392B", marginBottom: 8 }}>✕ Błąd usuwania</div>
          <div style={{ fontSize: 12, color: C.greyDk, marginBottom: 12 }}>{deleteError}</div>
          <button onClick={cancelDelete} style={{ background: "none", border: `1px solid ${C.grey}`, color: C.greyDk, padding: "7px 16px", fontSize: 11, fontWeight: 700, borderRadius: 5, cursor: "pointer" }}>Zamknij</button>
        </div>
      )}

    </div>
  );
}
