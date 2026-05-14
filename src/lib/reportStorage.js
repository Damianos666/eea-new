// ─────────────────────────────────────────────────────────────────────────────
// REPORT STORAGE — localStorage z TTL 30 dni
// Przechowuje dane raportu serwisowego i delegacji między sesjami
// ─────────────────────────────────────────────────────────────────────────────

const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dni
const PREFIX = "engel_report_";

function makeKey(trainerNum, entryDate, suffix) {
  return `${PREFIX}${trainerNum}_${entryDate}_${suffix}`;
}

// ─── Zapis ────────────────────────────────────────────────────────────────────
export function saveReportData(trainerNum, entryDate, data) {
  const key     = makeKey(trainerNum, entryDate, "service");
  const payload = { data, savedAt: Date.now() };
  try {
    localStorage.setItem(key, JSON.stringify(payload));
  } catch (e) {
    console.warn("reportStorage: zapis nieudany", e);
  }
}

// ─── Odczyt ───────────────────────────────────────────────────────────────────
export function loadReportData(trainerNum, entryDate) {
  const key = makeKey(trainerNum, entryDate, "service");
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { data, savedAt } = JSON.parse(raw);
    if (Date.now() - savedAt > TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

// ─── Podpisy (osobny klucz — większe dane) ───────────────────────────────────
export function saveSignatures(trainerNum, entryDate, sigs) {
  // sigs = { clientSig, technicianSig }
  const key = makeKey(trainerNum, entryDate, "sigs");
  try {
    localStorage.setItem(key, JSON.stringify({ sigs, savedAt: Date.now() }));
  } catch (e) {
    // base64 może być duże — jeśli przekroczy limit, ignoruj
    console.warn("reportStorage: zapis podpisów nieudany (za duże?)", e);
  }
}

export function loadSignatures(trainerNum, entryDate) {
  const key = makeKey(trainerNum, entryDate, "sigs");
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { sigs, savedAt } = JSON.parse(raw);
    if (Date.now() - savedAt > TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return sigs;
  } catch {
    return null;
  }
}

// ─── Flaga synced + local_uuid ───────────────────────────────────────────────
// Przechowuje czy raport trafił do Supabase oraz jego local_uuid do retry

export function markSynced(trainerNum, entryDate) {
  // Po udanym sync — usuń dane formularza i podpisy z localStorage
  try {
    localStorage.removeItem(makeKey(trainerNum, entryDate, "service"));
    localStorage.removeItem(makeKey(trainerNum, entryDate, "sigs"));
    localStorage.removeItem(makeKey(trainerNum, entryDate, "sync"));
  } catch {}
}

export function savePendingSync(trainerNum, entryDate, payload) {
  // Zapisz dane do ponownego wysłania gdy wróci internet
  // payload = { local_uuid, trainer_id, trainer_name, client_name, report_date, report_data }
  const key = makeKey(trainerNum, entryDate, "sync");
  try {
    localStorage.setItem(key, JSON.stringify({ payload, savedAt: Date.now() }));
  } catch (e) {
    console.warn("reportStorage: zapis pending sync nieudany", e);
  }
}

export function loadPendingSync(trainerNum, entryDate) {
  const key = makeKey(trainerNum, entryDate, "sync");
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { payload, savedAt } = JSON.parse(raw);
    if (Date.now() - savedAt > TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function isSynced(trainerNum, entryDate) {
  // Jeśli nie ma ani danych formularza ani pending sync → synced (czysty)
  const hasData = !!localStorage.getItem(makeKey(trainerNum, entryDate, "service"));
  const hasPending = !!localStorage.getItem(makeKey(trainerNum, entryDate, "sync"));
  return !hasData && !hasPending;
}

// ─── Czyszczenie przeterminowanych wpisów ─────────────────────────────────────
export function pruneExpired() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key?.startsWith(PREFIX)) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const { savedAt } = JSON.parse(raw);
        if (Date.now() - savedAt > TTL_MS) localStorage.removeItem(key);
      } catch {
        localStorage.removeItem(key);
      }
    }
  } catch {}
}
