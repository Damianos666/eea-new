import { useState, useEffect, useRef, useCallback } from "react";
import { C, GROUPS, TRAINERS } from "../../lib/constants";
import { TRAININGS } from "../../data/trainings";
import { db, rpc, SB_URL, authHeaders, edge } from "../../lib/supabase";
import { Spinner } from "../SharedUI";
import { useToast } from "../../lib/ToastContext";

/* ─── helpers ─────────────────────────────────────────────────────────────── */
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function fmtDate(raw) {
  if (!raw) return "";
  // Już sformatowana DD.MM.YYYY
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(raw)) return raw;
  // ISO z timestampem: 2026-03-11T00:00:00... → bierzemy tylko datę
  const dateOnly = raw.split("T")[0];
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) {
    const [y,m,d] = dateOnly.split("-");
    return `${d}.${m}.${y}`;
  }
  // fallback — zwróć jak jest
  return raw;
}

/* Generuje klucz zaliczenia analogiczny do systemu kodów — XXXDDDMMYYYYTN */
function syntheticKey(trainingId, date, trainerNum) {
  const short = trainingId === "ST"
    ? "ST"
    : (TRAININGS.find(t => t.id === trainingId)?.short || trainingId).toUpperCase();
  const [y,m,d] = (date || today()).split("-");
  return `${short}${d}${m}${y}T${trainerNum || 1}`;
}

/* Generuje unikalny training_id dla ST żeby user mógł mieć wiele różnych ST */
function stTrainingId(name) {
  return "ST_" + name.trim().toLowerCase()
    .replace(/ą/g,"a").replace(/ć/g,"c").replace(/ę/g,"e").replace(/ł/g,"l")
    .replace(/ń/g,"n").replace(/ó/g,"o").replace(/ś/g,"s").replace(/[źż]/g,"z")
    .replace(/[^a-z0-9]/g,"_").replace(/_+/g,"_").slice(0, 40);
}

/* ─── StatusBadge ──────────────────────────────────────────────────────────── */
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

/* ─── Main component ───────────────────────────────────────────────────────── */
export function AdminBatchComplete({ token }) {
  const { addToast } = useToast();

  /* — wyszukiwarka użytkowników — */
  const [query,        setQuery]        = useState("");
  const [users,        setUsers]        = useState([]);       // wyniki wyszukiwania
  const [searching,    setSearching]    = useState(false);
  const [searchDone,   setSearchDone]   = useState(false);
  const searchTimer                     = useRef(null);

  /* — wybrany użytkownik — */
  const [selUser,      setSelUser]      = useState(null);
  const [userComps,    setUserComps]    = useState([]);       // już zaliczone szkolenia
  const [loadingComps, setLoadingComps] = useState(false);

  /* — formularz zaliczenia — */
  const [trainingMode, setTrainingMode] = useState("normal"); // "normal" | "ST"
  const [selGroup,     setSelGroup]     = useState(GROUPS[0].id);
  const [selTraining,  setSelTraining]  = useState(TRAININGS.find(t => t.group === GROUPS[0].id)?.id || "");
  const [selDate,      setSelDate]      = useState(today());
  const [selTrainer,   setSelTrainer]   = useState(1);
  const [stName,       setStName]       = useState(""); // nazwa szkolenia specjalnego
  const [stDays,       setStDays]       = useState(1);  // czas trwania ST

  /* — batch queue — */
  const [queue,        setQueue]        = useState([]);       // { id, userId, training, date, trainerNum, trainerName, status }
  const [saving,       setSaving]       = useState(false);

  /* — kasowanie konta — */
  const [deletePin,    setDeletePin]    = useState("");       // wygenerowany PIN do potwierdzenia
  const [deletePinInput, setDeletePinInput] = useState("");  // co wpisał admin
  const [deleteStatus, setDeleteStatus] = useState(null);    // null | "confirm" | "deleting" | "done" | "error"
  const [deleteResult, setDeleteResult] = useState(null);
  const [deleteError,  setDeleteError]  = useState("");

  /* ── Sync selTraining gdy zmienia się grupa ─────────────────────────────── */
  useEffect(() => {
    const first = TRAININGS.find(t => t.group === selGroup);
    if (first) setSelTraining(first.id);
  }, [selGroup]);

  /* ── Debounced search ───────────────────────────────────────────────────── */
  const runSearch = useCallback(async (q) => {
    const trimmed = q.trim();
    if (trimmed.length < 2) { setUsers([]); setSearchDone(false); return; }
    setSearching(true);
    try {
      // Próba 1: RPC search_users_for_admin (wymaga wdrożenia supabase_search_users.sql)
      // Zwraca email z auth.users — pełne wyszukiwanie po emailu
      let rpcOk = false;
      let data = [];
      try {
        const r = await fetch(`${SB_URL}/rest/v1/rpc/search_users_for_admin`, {
          method: "POST",
          headers: { ...authHeaders(token), "Content-Type": "application/json" },
          body: JSON.stringify({ search_query: trimmed }),
        });
        if (r.ok) {
          data = await r.json();
          rpcOk = true;
        } else {
          const errText = await r.text();
          console.warn("[search_users_for_admin] RPC error", r.status, errText);
        }
      } catch { /* RPC niedostępne */ }

      if (!rpcOk) {
        // Próba 2: szukaj w profiles po name, login, firma
        // Jeśli wpisano pełny email (jan@firma.pl) — rozbij na część przed @ i domenę
        const queries = new Set();
        queries.add(trimmed); // całość

        if (trimmed.includes("@")) {
          const [localPart, domain] = trimmed.split("@");
          if (localPart) queries.add(localPart);   // jan
          if (domain)    queries.add(domain);       // firma.pl
          // też próbuj "jan.kowalski" → "jan kowalski"
          const spacedName = localPart.replace(/[._-]/g, " ");
          if (spacedName !== localPart) queries.add(spacedName);
        }

        const results = new Map(); // id → user, deduplikacja
        for (const term of queries) {
          const enc = encodeURIComponent(`%${term}%`);
          try {
            const rows = await db.get(token, "profiles",
              `or=(name.ilike.${enc},login.ilike.${enc},firma.ilike.${enc})` +
              `&select=id,name,login,firma,stanowisko,role,trainer_id&limit=30&order=name.asc`
            );
            if (Array.isArray(rows)) rows.forEach(r => results.set(r.id, r));
          } catch { /* ignoruj błędy pojedynczego termu */ }
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

  /* ── Załaduj zaliczenia wybranego użytkownika ────────────────────────────── */
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
  }

  function clearUser() {
    setSelUser(null);
    setUserComps([]);
    setQuery("");
    setSearchDone(false);
  }

  /* ── Dodaj do kolejki ────────────────────────────────────────────────────── */
  function addToQueue() {
    if (!selUser) return;

    let training;
    if (trainingMode === "ST") {
      if (!stName.trim()) { addToast("⚠ Wpisz nazwę szkolenia specjalnego"); return; }
      const tid = stTrainingId(stName);
      training = {
        id:       tid,
        short:    "ST",
        title:    stName.trim(),
        group:    "tech",
        category: "specjalne",
        duration: stDays === 1 ? "1 dzień" : `${stDays} dni`,
        level:    1,
        isSpecial: true,
      };
    } else {
      training = TRAININGS.find(t => t.id === selTraining);
      if (!training) return;
    }

    // Duplikat w kolejce?
    if (queue.some(q => q.userId === selUser.id && q.training.id === training.id)) {
      addToast("⚠ To szkolenie jest już w kolejce dla tego uczestnika");
      return;
    }

    const alreadyDone = userComps.some(c => c.training_id === training.id);

    setQueue(prev => [...prev, {
      id:          `${selUser.id}_${training.id}_${Date.now()}`,
      userId:      selUser.id,
      userName:    selUser.name || selUser.login || selUser.id,
      training,
      date:        selDate,
      trainerNum:  selTrainer,
      trainerName: TRAINERS[selTrainer] || `T${selTrainer}`,
      status:      alreadyDone ? "already" : null,
    }]);

    // Wyczyść nazwę ST po dodaniu
    if (trainingMode === "ST") setStName("");
  }

  function removeFromQueue(id) {
    setQueue(prev => prev.filter(q => q.id !== id));
  }

  /* ── Zapisz wszystkie z kolejki ─────────────────────────────────────────── */
  async function saveAll() {
    const toSave = queue.filter(q => q.status !== "already" && q.status !== "ok");
    if (!toSave.length) return;
    setSaving(true);

    for (const item of toSave) {
      // Oznacz jako pending
      setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: "pending" } : q));

      try {
        const codeKey = syntheticKey(item.training.id, item.date, item.trainerNum);
        const { generateCertId, isDuplicateCertId } = await import("../../lib/certId");
        const MAX_ATTEMPTS = 5;

        // Sprawdź czy rekord już istnieje (raz, przed pętlą)
        const existing = await db.get(token, "completions",
          `user_id=eq.${item.userId}&training_id=eq.${item.training.id}&select=id,cert_id`
        );

        let saved = false;
        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
          // Jeśli UPDATE i rekord już ma cert_id — zachowaj istniejący
          const certId = (existing?.[0]?.cert_id) || generateCertId({ trainingId: item.training.id, date: item.date });
          const payload = {
            user_id:            item.userId,
            training_id:        item.training.id,
            training_data:      item.training,
            date:               item.date,
            code_key:           codeKey,
            trainer:            item.trainerName,
            cert_id:            certId,
          };

          try {
            if (existing && existing.length > 0) {
              await db.update(token, "completions",
                `user_id=eq.${item.userId}&training_id=eq.${item.training.id}`,
                { training_data: payload.training_data, date: payload.date, code_key: codeKey, trainer: payload.trainer, cert_id: certId }
              );
            } else {
              await db.insert(token, "completions", payload);
            }
            saved = true;
            break;
          } catch(insertErr) {
            if (isDuplicateCertId(insertErr) && attempt < MAX_ATTEMPTS - 1) continue;
            throw insertErr;
          }
        }
        if (!saved) throw new Error("Nie udało się wygenerować unikalnego cert_id po 5 próbach");

        setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: "ok", codeKey } : q));
      } catch(e) {
        setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: "error", err: e.message } : q));
      }
    }

    setSaving(false);
    addToast("✓ Zakończono zapis do bazy");
  }

  /* ── Szybkie dodanie kolejnego szkolenia temu samemu userowi ─────────────── */
  function addAnother() {
    // zostajemy przy tym samym userze, tylko czyścimy status
    setQueue(prev => prev.filter(q => q.status === "ok"));
  }

  const groupTrainings = TRAININGS.filter(t => t.group === selGroup);
  const pendingCount = queue.filter(q => q.status !== "already" && q.status !== "ok").length;

  /* ── Kasowanie konta ─────────────────────────────────────────────────────── */
  function startDelete() {
    // Generuj 6-cyfrowy PIN — admin musi go przepisać żeby potwierdzić
    const pin = String(Math.floor(100000 + Math.random() * 900000));
    setDeletePin(pin);
    setDeletePinInput("");
    setDeleteStatus("confirm");
    setDeleteResult(null);
    setDeleteError("");
  }

  function cancelDelete() {
    setDeleteStatus(null);
    setDeletePinInput("");
    setDeletePin("");
  }

  async function confirmDelete() {
    if (deletePinInput !== deletePin) return;
    setDeleteStatus("deleting");
    try {
      const result = await edge.deleteUser(token, selUser.id);
      setDeleteResult(result);
      setDeleteStatus("done");
      addToast(`✓ Konto ${result.deleted_email} zostało usunięte`);
      // Wyczyść wybranego usera — już nie istnieje
      clearUser();
    } catch (e) {
      setDeleteError(e.message || "Błąd serwera");
      setDeleteStatus("error");
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════ */
  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14, maxWidth: 800 }}>

      {/* ── Tytuł ── */}
      <div style={{ background: C.white, borderRadius: 8, padding: "14px 18px", boxShadow: "0 1px 4px rgba(0,0,0,.08)" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.black, marginBottom: 4 }}>
          👤 Zalicz szkolenie uczestnikowi
        </div>
        <div style={{ fontSize: 12, color: C.greyMid, lineHeight: 1.5 }}>
          Wyszukaj uczestnika po imieniu, nazwisku, e-mail lub firmie. Wybierz szkolenie, datę i trenera — system doda zaliczenie i odblokuje certyfikat.
        </div>
      </div>

      {/* ── Wyszukiwarka ── */}
      <div style={{ background: C.white, borderRadius: 8, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,.08)" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.greyMid, letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>
          1. Znajdź uczestnika
        </div>

        {selUser ? (
          /* Wybrany user — karta */
          <div style={{ display: "flex", alignItems: "center", gap: 12, background: C.greenBg, border: `1.5px solid ${C.green}`, borderRadius: 8, padding: "12px 14px" }}>
            <div style={{ width: 36, height: 36, borderRadius: "50%", background: C.green, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ fontSize: 18, color: C.white }}>👤</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.black }}>{selUser.name || "—"}</div>
              <div style={{ fontSize: 11, color: C.greyDk }}>
                {selUser.email
                  ? <span style={{ fontFamily: "monospace", fontSize: 12 }}>{selUser.email}</span>
                  : selUser.login && <span style={{ fontFamily: "monospace", fontSize: 12 }}>{selUser.login}</span>
                }
                {selUser.firma && <span style={{ marginLeft: 8, opacity: .7 }}>· {selUser.firma}</span>}
                {selUser.stanowisko && <span style={{ marginLeft: 8, opacity: .7 }}>· {selUser.stanowisko}</span>}
                {selUser.trainer_id && <span style={{ marginLeft: 8, color: C.green, fontWeight: 700 }}>· 🎓 Trener T{selUser.trainer_id}</span>}
              </div>
              {loadingComps ? (
                <div style={{ fontSize: 10, color: C.greyMid, marginTop: 4 }}>Ładowanie zaliczonych…</div>
              ) : (
                <div style={{ fontSize: 10, color: C.greenDk, marginTop: 4, fontWeight: 600 }}>
                  ✓ {userComps.length} {userComps.length === 1 ? "szkolenie zaliczone" : "szkoleń zaliczonych"}
                </div>
              )}
            </div>
            <button onClick={clearUser}
              style={{ background: "none", border: `1px solid ${C.greyMid}`, color: C.greyDk, padding: "5px 12px", fontSize: 11, cursor: "pointer", borderRadius: 4, flexShrink: 0 }}>
              Zmień
            </button>
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
              {searching && (
                <div style={{ display: "flex", alignItems: "center", paddingRight: 4 }}>
                  <Spinner size={18}/>
                </div>
              )}
            </div>

            {/* Dropdown wyników */}
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
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.black }}>
                      {u.name || u.login || u.email || "—"}
                      {u.trainer_id && <span style={{ fontSize: 10, color: C.green, fontWeight: 700, marginLeft: 8 }}>TRENER T{u.trainer_id}</span>}
                    </span>
                    <span style={{ fontSize: 11, color: C.greyMid }}>
                      {u.email
                        ? <span style={{ fontFamily: "monospace" }}>{u.email}</span>
                        : u.login && <span style={{ fontFamily: "monospace" }}>{u.login}</span>
                      }
                      {u.firma && <span style={{ marginLeft: 8 }}>· {u.firma}</span>}
                      {u.stanowisko && <span style={{ marginLeft: 8 }}>· {u.stanowisko}</span>}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Formularz szkolenia (tylko gdy wybrany user) ── */}
      {selUser && !loadingComps && (
        <div style={{ background: C.white, borderRadius: 8, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,.08)" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.greyMid, letterSpacing: 1, textTransform: "uppercase", marginBottom: 12 }}>
            2. Wybierz szkolenie, datę i trenera
          </div>

          {/* Tryb: normalne / specjalne */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.greyDk, marginBottom: 6, textTransform: "uppercase", letterSpacing: .5 }}>Rodzaj</div>
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
              <button
                onClick={() => setTrainingMode("ST")}
                style={{
                  padding: "7px 14px", fontSize: 11, fontWeight: 700, cursor: "pointer", borderRadius: 20,
                  border: "1.5px solid #8E44AD",
                  background: trainingMode === "ST" ? "#8E44AD" : "transparent",
                  color: trainingMode === "ST" ? C.white : "#8E44AD",
                }}>
                ⭐ Specjalne (ST)
              </button>
            </div>
          </div>

          {/* Szkolenie normalne */}
          {trainingMode === "normal" && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.greyDk, marginBottom: 6, textTransform: "uppercase", letterSpacing: .5 }}>Szkolenie</div>
              <select value={selTraining} onChange={e => setSelTraining(e.target.value)}
                style={{ width: "100%", padding: "10px 12px", border: `1.5px solid ${C.grey}`, borderRadius: 6, fontSize: 13, color: C.black, background: C.white, boxSizing: "border-box" }}>
                {groupTrainings.map(t => {
                  const done = userComps.some(c => c.training_id === t.id);
                  return (
                    <option key={t.id} value={t.id}>
                      {done ? "✓ " : ""}{t.short} — {t.title} ({t.duration}){done ? " [już zaliczone]" : ""}
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          {/* Szkolenie specjalne */}
          {trainingMode === "ST" && (
            <div style={{ marginBottom: 12, background: "#F9F0FF", border: "1px solid rgba(142,68,173,.25)", borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#8E44AD", marginBottom: 10, letterSpacing: .5 }}>⭐ SZKOLENIE SPECJALNE</div>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.greyDk, marginBottom: 6 }}>NAZWA SZKOLENIA *</div>
                <input
                  value={stName}
                  onChange={e => setStName(e.target.value)}
                  placeholder="np. Szkolenie aplikacyjne — Hot Runner"
                  style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #8E44AD", borderRadius: 6, fontSize: 13, color: C.black, background: C.white, boxSizing: "border-box" }}
                />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.greyDk, marginBottom: 6 }}>CZAS TRWANIA</div>
                <div style={{ display: "flex", gap: 6 }}>
                  {[1,2,3,4,5].map(d => (
                    <button key={d} onClick={() => setStDays(d)}
                      style={{
                        flex: 1, padding: "8px 0", fontSize: 14, fontWeight: 700, cursor: "pointer", borderRadius: 6,
                        border: `1.5px solid ${stDays === d ? "#8E44AD" : C.grey}`,
                        background: stDays === d ? "#8E44AD" : C.white,
                        color: stDays === d ? C.white : C.greyDk,
                      }}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Data + Trener w jednym rzędzie */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
            <div style={{ flex: 1, minWidth: 140 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.greyDk, marginBottom: 6, textTransform: "uppercase", letterSpacing: .5 }}>Data szkolenia</div>
              <input type="date" value={selDate} onChange={e => setSelDate(e.target.value)}
                style={{ width: "100%", padding: "10px 12px", border: `1.5px solid ${C.grey}`, borderRadius: 6, fontSize: 13, color: C.black, background: C.white, boxSizing: "border-box" }}
              />
            </div>
            <div style={{ flex: 2, minWidth: 180 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.greyDk, marginBottom: 6, textTransform: "uppercase", letterSpacing: .5 }}>Trener</div>
              <select value={selTrainer} onChange={e => setSelTrainer(Number(e.target.value))}
                style={{ width: "100%", padding: "10px 12px", border: `1.5px solid ${C.grey}`, borderRadius: 6, fontSize: 13, color: C.black, background: C.white, boxSizing: "border-box" }}>
                {Object.entries(TRAINERS).map(([num, name]) => (
                  <option key={num} value={num}>T{num} — {name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Podgląd certyfikatu */}
          {(trainingMode === "normal" ? selTraining : stName.trim()) && selDate && (
            <div style={{ background: C.greyBg, borderRadius: 6, padding: "8px 12px", marginBottom: 14, fontSize: 11, color: C.greyDk }}>
              <span style={{ fontWeight: 700, color: C.black }}>Klucz certyfikatu: </span>
              <code style={{ background: C.white, padding: "2px 6px", borderRadius: 4, fontFamily: "monospace", fontSize: 12, color: C.greenDk }}>
                {trainingMode === "ST"
                  ? syntheticKey("ST", selDate, selTrainer)
                  : syntheticKey(selTraining, selDate, selTrainer)
                }
              </code>
            </div>
          )}

          {/* Przycisk dodania do kolejki */}
          <button onClick={addToQueue}
            style={{
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
              3. Lista do zaliczenia ({queue.length})
            </div>
            {pendingCount > 0 && (
              <button onClick={saveAll} disabled={saving}
                style={{
                  background: saving ? C.greyDk : C.greenDk, color: C.white, border: "none",
                  padding: "8px 20px", fontSize: 12, fontWeight: 700, borderRadius: 5, cursor: saving ? "not-allowed" : "pointer",
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
                    {item.status === "error" && (
                      <div style={{ fontSize: 10, color: C.red, marginTop: 2 }}>Błąd: {item.err}</div>
                    )}
                  </div>
                  <StatusBadge status={item.status}/>
                  {item.status !== "ok" && item.status !== "pending" && (
                    <button onClick={() => removeFromQueue(item.id)}
                      style={{ background: "none", border: "none", color: C.greyMid, cursor: "pointer", fontSize: 16, padding: "0 4px", flexShrink: 0 }}>
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Podsumowanie po zapisie */}
          {queue.every(q => q.status === "ok" || q.status === "already") && (
            <div style={{ marginTop: 14, padding: "12px 14px", background: C.greenBg, borderRadius: 6, border: `1px solid ${C.green}`, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.greenDk }}>
                ✅ Wszystko zapisane! Uczestnicy mają dostęp do certyfikatów.
              </span>
              <button onClick={() => setQueue([])}
                style={{ background: C.black, color: C.white, border: "none", padding: "6px 14px", fontSize: 11, fontWeight: 700, borderRadius: 4, cursor: "pointer" }}>
                Nowa seria
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Panel podglądu zaliczonych szkoleń wybranego usera ── */}
      {selUser && userComps.length > 0 && (
        <div style={{ background: C.white, borderRadius: 8, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,.08)" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.greyMid, letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 }}>
            Już zaliczone — {selUser.name}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {userComps.map((c, i) => {
              const t = TRAININGS.find(x => x.id === c.training_id) || c.training_data;
              const grp = GROUPS.find(g => g.id === t?.group);
              return (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
                  background: C.greyBg, borderRadius: 5, borderLeft: `3px solid ${grp?.color || C.green}`,
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.black }}>{t?.short || c.training_id} — {t?.title || "—"}</div>
                    <div style={{ fontSize: 10, color: C.greyMid }}>
                      📅 {fmtDate(c.date)}
                      {c.trainer && <span style={{ marginLeft: 8 }}>🎓 {c.trainer}</span>}
                    </div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: C.greenDk, background: C.greenBg, padding: "2px 8px", borderRadius: 4 }}>✓</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Kasowanie konta użytkownika ── */}
      {selUser && deleteStatus === null && (
        <div style={{ background: C.white, borderRadius: 8, padding: 16, boxShadow: "0 1px 4px rgba(0,0,0,.08)", border: "1px solid #FDDEDE" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#C0392B", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>
            ⚠ Strefa niebezpieczna
          </div>
          <div style={{ fontSize: 12, color: C.greyDk, marginBottom: 12, lineHeight: 1.5 }}>
            Trwałe usunięcie konta <strong>{selUser.name || selUser.login}</strong> wraz ze wszystkimi danymi (zaliczenia, gamifikacja, historia).
          </div>
          <button onClick={startDelete} style={{
            background: "none", border: "1.5px solid #E74C3C", color: "#C0392B",
            padding: "9px 18px", fontSize: 12, fontWeight: 700, borderRadius: 6,
            cursor: "pointer",
          }}>
            🗑 Usuń konto tego użytkownika
          </button>
        </div>
      )}

      {/* ── Potwierdzenie PIN ── */}
      {selUser && deleteStatus === "confirm" && (
        <div style={{ background: "#FDF3F3", borderRadius: 8, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,.08)", border: "1.5px solid #E74C3C" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#C0392B", marginBottom: 12 }}>
            🗑 Potwierdzenie usunięcia konta
          </div>
          <div style={{ fontSize: 12, color: C.greyDk, lineHeight: 1.6, marginBottom: 16 }}>
            Konto: <strong style={{ fontFamily: "monospace" }}>{selUser.name || selUser.login}</strong><br/>
            Zostaną usunięte: zaliczenia, gamifikacja, historia quizów, odczyty wiadomości.<br/>
            <strong style={{ color: "#C0392B" }}>Tej operacji nie można cofnąć.</strong>
          </div>

          {/* PIN do przepisania */}
          <div style={{
            background: C.white, border: "1px solid #F5B7B1", borderRadius: 8,
            padding: "14px 16px", marginBottom: 16, textAlign: "center",
          }}>
            <div style={{ fontSize: 11, color: C.greyMid, marginBottom: 6 }}>Przepisz ten kod aby potwierdzić:</div>
            <div style={{ fontSize: 28, fontWeight: 900, fontFamily: "monospace", letterSpacing: 6, color: "#C0392B" }}>
              {deletePin}
            </div>
          </div>

          <input
            type="text"
            value={deletePinInput}
            onChange={e => setDeletePinInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="Wpisz kod…"
            maxLength={6}
            style={{
              width: "100%", boxSizing: "border-box",
              padding: "11px 14px", fontSize: 20, fontFamily: "monospace",
              letterSpacing: 4, textAlign: "center", fontWeight: 700,
              border: `2px solid ${deletePinInput === deletePin ? "#27AE60" : deletePinInput.length === 6 ? "#E74C3C" : C.grey}`,
              borderRadius: 6, outline: "none", marginBottom: 14,
              background: C.white, color: C.black,
            }}
          />

          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={cancelDelete} style={{
              flex: 1, background: "none", border: `1px solid ${C.grey}`,
              color: C.greyDk, padding: "10px 0", fontSize: 12, fontWeight: 700,
              borderRadius: 6, cursor: "pointer",
            }}>
              Anuluj
            </button>
            <button
              onClick={confirmDelete}
              disabled={deletePinInput !== deletePin}
              style={{
                flex: 2, padding: "10px 0", fontSize: 12, fontWeight: 700,
                borderRadius: 6, border: "none", cursor: deletePinInput === deletePin ? "pointer" : "not-allowed",
                background: deletePinInput === deletePin ? "#C0392B" : "#FADBD8",
                color: deletePinInput === deletePin ? C.white : "#E74C3C",
                transition: "all .2s",
              }}>
              ✓ Potwierdź i usuń konto
            </button>
          </div>
        </div>
      )}

      {/* ── Trwa kasowanie ── */}
      {deleteStatus === "deleting" && (
        <div style={{ background: "#FDF3F3", borderRadius: 8, padding: 20, textAlign: "center", border: "1px solid #F5B7B1" }}>
          <Spinner size={24} />
          <div style={{ fontSize: 13, color: C.greyDk, marginTop: 10 }}>Usuwam konto i dane…</div>
        </div>
      )}

      {/* ── Wynik kasowania ── */}
      {deleteStatus === "done" && deleteResult && (
        <div style={{ background: "#EAFAF1", borderRadius: 8, padding: 20, border: "1px solid #27AE60" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1D8348", marginBottom: 12 }}>
            ✅ Konto zostało trwale usunięte
          </div>
          <div style={{ fontSize: 12, color: C.greyDk, marginBottom: 10 }}>
            <strong>Email:</strong> <code style={{ fontFamily: "monospace" }}>{deleteResult.deleted_email}</code><br/>
            <strong>Usunął:</strong> {deleteResult.deleted_by}
          </div>
          <div style={{ fontSize: 11, color: C.greyMid }}>
            {Object.entries(deleteResult.rows_deleted || {}).map(([tbl, cnt]) => (
              <span key={tbl} style={{ display: "inline-block", marginRight: 12 }}>
                <code>{tbl}</code>: {cnt} {cnt === 1 ? "rekord" : "rekordów"}
              </span>
            ))}
          </div>
          <button onClick={() => setDeleteStatus(null)} style={{
            marginTop: 12, background: "none", border: `1px solid ${C.grey}`,
            color: C.greyDk, padding: "7px 16px", fontSize: 11, fontWeight: 700,
            borderRadius: 5, cursor: "pointer",
          }}>OK</button>
        </div>
      )}

      {/* ── Błąd kasowania ── */}
      {deleteStatus === "error" && (
        <div style={{ background: "#FDF3F3", borderRadius: 8, padding: 16, border: "1px solid #E74C3C" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#C0392B", marginBottom: 8 }}>✕ Błąd usuwania</div>
          <div style={{ fontSize: 12, color: C.greyDk, marginBottom: 12 }}>{deleteError}</div>
          <button onClick={cancelDelete} style={{
            background: "none", border: `1px solid ${C.grey}`, color: C.greyDk,
            padding: "7px 16px", fontSize: 11, fontWeight: 700, borderRadius: 5, cursor: "pointer",
          }}>Zamknij</button>
        </div>
      )}

    </div>
  );
}
