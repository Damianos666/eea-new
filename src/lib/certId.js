// ─────────────────────────────────────────────────────────────────────────────
// CERT ID — generowanie numeru certyfikatu
//
// Format:  CCYDDDXXXXXX  (12 znaków)
//
//   CC     — 2-cyfrowy numer szkolenia (01–25, zero-padded)
//   Y      — rok jako litera (A = 2020, B = 2021, …)
//   DDD    — dzień roku (001–366), zero-padded
//   XXXXXX — 6 losowych znaków z ALPHABET (crypto.getRandomValues)
//
// Weryfikacja = wyłącznie lookup w bazie (cert_id = eq.XXX).
// Brak sekretu — losowość 31^6 ≈ 887 mln kombinacji na dany dzień/szkolenie.
// ─────────────────────────────────────────────────────────────────────────────

import { TRAININGS } from "../data/trainings";

// Alfabet — 31 znaków (bez 0/O/1/I/L — łatwe do pomylenia)
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Rok → 1 litera (A = 2020, B = 2021, …) */
function yearCode(year) {
  return ALPHABET[(year - 2020 + 8) % ALPHABET.length];
}

/** Data → numer dnia w roku, zero-padded do 3 cyfr */
function dayOfYear(date) {
  const start = new Date(date.getFullYear(), 0, 0);
  const day   = Math.floor((date - start) / 86400000);
  return String(day).padStart(3, "0");
}

/** training.id → 2-cyfrowy numer szkolenia */
function courseCode(trainingId) {
  const idx = TRAININGS.findIndex(t => t.id === trainingId);
  return String(idx >= 0 ? idx + 1 : 0).padStart(2, "0");
}

/** Parsuje datę z formatu DD.MM.YYYY */
function parseDatePL(str) {
  const [dd, mm, yyyy] = str.split(".");
  return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
}

/** 6 losowych znaków z ALPHABET */
function randomSuffix() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => ALPHABET[b % ALPHABET.length]).join("");
}

// ─── GŁÓWNA FUNKCJA ───────────────────────────────────────────────────────────

/**
 * Generuje 12-znakowy numer certyfikatu.
 * Funkcja jest synchroniczna — nie wymaga async/await.
 *
 * @param {object} params
 * @param {string} params.trainingId  — training.id
 * @param {string} params.date        — DD.MM.YYYY
 * @returns {string}  np. "01G064K9X7MZ"
 */
export function generateCertId({ trainingId, date }) {
  const dateObj = parseDatePL(date);
  const cc      = courseCode(trainingId);
  const y       = yearCode(dateObj.getFullYear());
  const ddd     = dayOfYear(dateObj);
  const suffix  = randomSuffix();
  return `${cc}${y}${ddd}${suffix}`;
}

/** Sprawdza czy błąd to kolizja unique constraint na cert_id (Postgres 23505) */
export function isDuplicateCertId(error) {
  return error?.message?.includes("23505");
}
