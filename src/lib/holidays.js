// ─── holidays.js ─────────────────────────────────────────────────────────────
// POPRAWKA: Wcześniej fetchHolidaysForYear była zduplikowana w 3 plikach:
//   ScheduleTab.jsx, TrainerScheduleTab.jsx, AdminSchedule.jsx
// Teraz jedno miejsce — jeśli API się zmieni, poprawiamy tu i wszędzie działa.
//
// Pobiera polskie święta publiczne z date.nager.at (bezpłatne, bez klucza).
// Cache w localStorage — święta się nie zmieniają, więc fetch tylko raz na rok.

export async function fetchHolidaysForYear(year) {
  const key = `eea_holidays_PL_${year}`;
  try {
    const cached = localStorage.getItem(key);
    if (cached) return JSON.parse(cached);
    const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/PL`);
    if (!res.ok) return {};
    const data = await res.json();
    const map = {};
    data.forEach(h => { map[h.date] = h.localName; });
    localStorage.setItem(key, JSON.stringify(map));
    return map;
  } catch { return {}; }
}
