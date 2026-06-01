import { TRAININGS } from "../data/trainings";
import { TRAINERS } from "./constants";

export function slugify(s) {
  return s.trim().toLowerCase()
    .replace(/ą/g,"a").replace(/ć/g,"c").replace(/ę/g,"e").replace(/ł/g,"l")
    .replace(/ń/g,"n").replace(/ó/g,"o").replace(/ś/g,"s").replace(/[źż]/g,"z")
    .replace(/[^a-z0-9\s]/g,"").replace(/\s+/g,".");
}

export function generateLogin(n) {
  const p = n.trim().split(/\s+/);
  if (p.length < 2) return slugify(n);
  return `${slugify(p[0])}.${slugify(p.slice(1).join(" "))}`;
}

export function decodeDate(enc) {
  const s = enc.split("").map(c => String((parseInt(c)+7)%10)).join("");
  return `${s.slice(0,2)}.${s.slice(2,4)}.20${s.slice(4,6)}`;
}

export function todayEncoded() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2,"0");
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const yy = String(d.getFullYear()).slice(2);
  return (dd+mm+yy).split("").map(c => String((parseInt(c)+3)%10)).join("");
}

// Sortowanie malejąco po długości skrótu — wykonane raz przy imporcie modułu,
// nie przy każdym wywołaniu parseCode.
const SORTED_TRAININGS = [...TRAININGS].sort((a, b) => b.short.length - a.short.length);

export function parseCode(input) {
  let raw = input.trim().toUpperCase();
  if (raw.length < 8) return null;

  // Prefiks D → pomijamy walidację daty
  const skipDate = raw.startsWith("D");
  if (skipDate) raw = raw.slice(1);
  if (raw.length < 8) return null;

  // Prefiks ST → szkolenie specjalne (tylko 7 cyfr po ST)
  if (raw.startsWith("ST")) {
    const rest = raw.slice(2);
    if (!/^\d{7}$/.test(rest)) return null;
    const enc = rest.slice(0, 6);
    const trainerDigit = parseInt(rest[6]);
    if (!skipDate && enc !== todayEncoded()) return null;
    if (trainerDigit < 1 || trainerDigit > 5) return null;
    return {
      isSpecial:  true,
      encoded:    enc,
      date:       decodeDate(enc),
      trainer:    TRAINERS[trainerDigit],
      trainerNum: trainerDigit,
      skipDate,
    };
  }

  // Zwykłe szkolenie — używamy wstępnie posortowanej tablicy
  for (const t of SORTED_TRAININGS) {
    if (raw.startsWith(t.short.toUpperCase())) {
      const rest = raw.slice(t.short.length);
      if (!/^\d{7}$/.test(rest)) return null;
      const enc = rest.slice(0, 6);
      const trainerDigit = parseInt(rest[6]);
      if (!skipDate && enc !== todayEncoded()) return null;
      if (trainerDigit < 1 || trainerDigit > 5) return null;
      return {
        prefix:     t.id,
        encoded:    enc,
        date:       decodeDate(enc),
        trainer:    TRAINERS[trainerDigit],
        trainerNum: trainerDigit,
        skipDate,
      };
    }
  }
  return null;
}

export function calcProgress(completed, activeGroups) {
  if (!activeGroups.length) return { pct:0, done:0, total:0, active:false };
  const rel = TRAININGS.filter(t => activeGroups.includes(t.group));
  const doneIds = new Set(completed.map(c => c.training.id));
  const done = rel.filter(t => doneIds.has(t.id)).length;
  return { pct: Math.round((done/rel.length)*100), done, total:rel.length, active:true };
}

export function formatDate(iso) {
  return new Date(iso).toLocaleDateString("pl-PL",{day:"2-digit",month:"2-digit",year:"numeric"});
}
