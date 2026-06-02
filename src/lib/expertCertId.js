// ─────────────────────────────────────────────────────────────────────────────
// EXPERT CERT ID — numery certyfikatów tytułów eksperckich
//
// Format: EX{T}{Y}{XXXXXXX}  — 12 znaków
//
//   EX      — stały prefiks (Expert)
//   T       — typ: T=tech, U=ur, O=obsługa, M=master
//   Y       — rok jako litera (A=2020, B=2021…)  — identycznie jak certId.js
//   XXXXXXX — 7 losowych znaków z ALPHABET
//
// Przykłady:
//   EXTH2K9X7MZP  — Process Expert, 2026
//   EXUM2ABCDEFG  — Maintenance Expert, 2026
//   EXOM2XYZQRST  — Operation Expert, 2026
//   EXMM2PLMNKJH  — Master, 2026
// ─────────────────────────────────────────────────────────────────────────────

const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

const TYPE_CODE = {
  tech:    "T",
  ur:      "U",
  maszyny: "O",
  master:  "M",
};

function yearCode(year) {
  return ALPHABET[(year - 2020 + 8) % ALPHABET.length];
}

function randomSuffix(len = 7) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => ALPHABET[b % ALPHABET.length]).join("");
}

/**
 * Generuje 12-znakowy numer certyfikatu eksperckiego.
 *
 * @param {object} params
 * @param {"tech"|"ur"|"maszyny"|"master"} params.type
 * @param {number} [params.year]  — domyślnie bieżący rok
 * @returns {string}  np. "EXTH2K9X7MZPL"
 */
export function generateExpertCertId({ type, year = new Date().getFullYear() }) {
  const t = TYPE_CODE[type] || "X";
  const y = yearCode(year);
  const s = randomSuffix(7);
  return `EX${t}${y}${s}`;
}

/** Zwraca true jeśli ID wygląda jak certyfikat ekspercki (prefix EX) */
export function isExpertCertId(certId) {
  return typeof certId === "string" && certId.startsWith("EX") && certId.length === 12;
}
