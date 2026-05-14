/* ─── ENGEL Virtual Expert Academy — System Grywalizacji ─────────────────── */

export const PROG_LEVELS = [
  { level: 1,  pts: 50,    label: "Nowicjusz",         badge: "🌱" },
  { level: 2,  pts: 150,   label: "Uczeń",             badge: "📖" },
  { level: 3,  pts: 320,   label: "Praktykant",        badge: "🔧" },
  { level: 4,  pts: 600,   label: "Operator",          badge: "⚙️" },
  { level: 5,  pts: 1000,  label: "Specjalista",       badge: "🎯" },
  { level: 6,  pts: 1550,  label: "Technik",           badge: "🔬" },
  { level: 7,  pts: 2300,  label: "Ekspert",           badge: "💡" },
  { level: 8,  pts: 3300,  label: "Mistrz",            badge: "🏅" },
  { level: 9,  pts: 4600,  label: "Wirtualny Ekspert", badge: "⭐" },
  { level: 10, pts: 6200,  label: "Lider",             badge: "🚀" },
  { level: 11, pts: 8000,  label: "Mentor",            badge: "🎓" },
  { level: 12, pts: 10000, label: "Trener",            badge: "🏆" },
];

export const TIP_POINTS    = 10;
export const QUIZ_DURATION = 180; // 3 minuty w sekundach
export const QUIZ_TIME_BONUS_MAX = 30; // max punktów bonusowych za czas

/**
 * Punkty za quiz tygodniowy:
 *   - 10 pkt za każdą poprawną odpowiedź (max 60)
 *   - bonus czasowy: max 30 pkt * (timeLeft / 180), zaokrąglone w dół
 *   Przykład: 6/6 poprawnych w 30s → 60 + floor(30 * 150/180) = 60 + 25 = 85 pkt
 */
export function calcQuizPoints(correctCount, totalCount, timeLeft = 0) {
  if (!totalCount) return { pct: 0, points: 0, basePoints: 0, timeBonus: 0 };
  const pct        = Math.round((correctCount / totalCount) * 100);
  const basePoints = correctCount * 10;
  const timeBonus  = Math.floor(QUIZ_TIME_BONUS_MAX * (Math.max(0, timeLeft) / QUIZ_DURATION));
  const points     = basePoints + timeBonus;
  return { pct, points, basePoints, timeBonus };
}

/** Zwraca info o aktualnym i następnym poziomie + procent postępu */
export function getLevelInfo(points) {
  let current = PROG_LEVELS[0];
  let nextLvl  = PROG_LEVELS[1] || null;
  for (let i = PROG_LEVELS.length - 1; i >= 0; i--) {
    if (points >= PROG_LEVELS[i].pts) {
      current = PROG_LEVELS[i];
      nextLvl  = PROG_LEVELS[i + 1] || null;
      break;
    }
  }
  const ptsInLevel = points - current.pts;
  const ptsNeeded  = nextLvl ? nextLvl.pts - current.pts : 1;
  const pct        = nextLvl ? Math.min(100, Math.round((ptsInLevel / ptsNeeded) * 100)) : 100;
  return { current, next: nextLvl, ptsInLevel, ptsNeeded, pct };
}

/** Wszystkie odznaki (poziomy) które użytkownik już osiągnął */
export function getEarnedBadges(points) {
  return PROG_LEVELS.filter(l => points >= l.pts);
}

/** Numer tygodnia ISO + rok. Przyjmuje opcjonalny dateStr dla trybu symulacji. */
export function getWeekKey(dateStr = null) {
  const base = dateStr ? new Date(dateStr + "T00:00:00") : new Date();
  const d    = new Date(Date.UTC(base.getFullYear(), base.getMonth(), base.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week      = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  // W trybie symulacji używamy ujemnego roku jako znacznika — wyniki testowe
  // trafiają do week_year=-1 i nie mieszają się z prawdziwymi danymi.
  return dateStr
    ? { week, year: -1, isDevMode: true }
    : { week, year: d.getUTCFullYear() };
}

/** Daty poniedziałku i niedzieli bieżącego tygodnia jako ISO strings */
export function getWeekDateRange() {
  const now       = new Date();
  const dayOfWeek = now.getDay() || 7; // 1=Pon, 7=Nd
  const monday    = new Date(now);
  monday.setDate(now.getDate() - dayOfWeek + 1);
  monday.setHours(0, 0, 0, 0);
  const toISO = d => d.toISOString().slice(0, 10);
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(toISO(d));
  }
  return dates; // [pn, wt, śr, cz, pt, sb, nd]
}

/**
 * Deterministyczny wybór pytania na dany dzień.
 * Ten sam dzień → to samo pytanie dla wszystkich użytkowników.
 * Nie wymaga żadnego backendu ani cron job-a.
 */
export function getDailyTipQuestion(questions, dateStr) {
  if (!questions || !questions.length) return null;
  // Seed = suma kodów ASCII znaków daty (np. "2026-03-16" → stabilna liczba)
  const seed = dateStr.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return questions[seed % questions.length];
}

/**
 * Info o dniu programu liczone od program_start_date.
 * referenceDateStr — opcjonalna data testowa (dla panelu dev trenera).
 */
export function getProgramInfo(programStartDate, referenceDateStr = null) {
  if (!programStartDate) return { dayInProgram: 0, cycleNumber: 0, dayInCycle: 0 };
  const start = new Date(programStartDate + "T00:00:00");
  const ref   = referenceDateStr
    ? new Date(referenceDateStr + "T00:00:00")
    : (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; })();
  const daysPassed  = Math.floor((ref - start) / 86400000);
  const cycleNumber = Math.floor(daysPassed / 7);  // 0, 1, 2, ...
  const dayInCycle  = daysPassed % 7;              // 0–5 = tip, 6 = quiz
  return { dayInProgram: daysPassed + 1, cycleNumber, dayInCycle };
}

/**
 * Zwraca tablicę 6 pytań dla bieżącego cyklu 7-dniowego.
 *
 * Logika nieskończonej rotacji:
 *   - Pytania posortowane wg created_at (stała kolejność, niezależna od długości puli)
 *   - Globalny indeks startowy = cycleNumber * 6 (rośnie bez końca)
 *   - Zawijamy modulo n, ale NIGDY w obrębie jednego cyklu (brak nakładek)
 *   - Dodanie pytań do bazy przedłuża unikalny okres bez retroaktywnych zmian
 *   - Dzień 7 quizuje DOKŁADNIE te same 6 pytań co dni 1–6 tego cyklu
 *
 * Przykład z 12 pytaniami: cykl 1→[0–5], cykl 2→[6–11], cykl 3→[0–5] (repeat po 2 cyklach)
 * Po dodaniu 6 pytań (18 total): cykl 3→[12–17], cykl 4→[0–5] — unikalny okres rośnie
 */
export function getWeekQuestions(questions, programStartDate = null, referenceDateStr = null) {
  if (!questions || !questions.length) return [];
  const { cycleNumber } = getProgramInfo(programStartDate, referenceDateStr);
  const n           = questions.length;
  const globalStart = cycleNumber * 6;
  const result      = [];
  for (let i = 0; i < 6; i++) {
    result.push(questions[(globalStart + i) % n]);
  }
  return result;
}

/**
 * Pytanie tipu dla dnia programu — spójne z getWeekQuestions[dayInCycle].
 */
export function getDailyTipFromCycle(questions, programStartDate, referenceDateStr = null) {
  const { dayInCycle } = getProgramInfo(programStartDate, referenceDateStr);
  if (dayInCycle >= 6) return null;
  const weekQs = getWeekQuestions(questions, programStartDate, referenceDateStr);
  return weekQs[dayInCycle] || null;
}

/** Czy bieżący dzień to dzień 7 cyklu (dzień quizu) */
export function isQuizDay(programStartDate, referenceDateStr = null) {
  if (!programStartDate) return false;
  const { dayInCycle } = getProgramInfo(programStartDate, referenceDateStr);
  return dayInCycle === 6;
}
export function calcNewStreak(currentStreak, lastDate, todayStr) {
  if (!lastDate) return 1;
  if (lastDate === todayStr) return currentStreak || 1; // już policzone dziś

  // Południe UTC eliminuje ryzyko błędów stref czasowych i czasu letniego.
  // Różnica 1 doby = dokładnie 86 400 000 ms niezależnie od lokalizacji.
  const last  = new Date(lastDate + "T12:00:00Z");
  const today = new Date(todayStr + "T12:00:00Z");
  const diffDays = Math.round((today - last) / 86400000);

  if (diffDays === 1) return (currentStreak || 0) + 1; // wczoraj → kontynuacja
  return 1; // 2+ dni przerwy → reset
}
