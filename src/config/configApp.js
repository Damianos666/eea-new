// ─────────────────────────────────────────────────────────────
//  timelineConfig.js
//  Centralna konfiguracja komponentów terminarza (Admin + Trener)
//  Zmień wartości tutaj — efekt zobaczysz w obu widokach.
// ─────────────────────────────────────────────────────────────

// ── Trenerzy ────────────────────────────────────────────────
// Lista numerów trenerów wyświetlanych w osi timeline.
// Dodaj lub usuń liczby żeby zmienić liczbę wierszy.
export const TIMELINE_TRAINERS = [1, 2, 3, 4, 5];

// ── Widok dni ───────────────────────────────────────────────
// Ile dni ma być widocznych na ekranie jednocześnie.
// Mniejsza liczba = szersze kolumny, łatwiej klikać.
// Większa liczba = więcej dni w widoku, bardziej panoramicznie.
export const TIMELINE_VISIBLE_DAYS = 8;

// ── Szerokość kolumny z numerem trenera (lewa szpalta) ──────
// Wartość w pikselach. Zmień jeśli etykieta T1/T2... nie mieści się.
export const TIMELINE_LABEL_COL_WIDTH = 46;

// ── Domyślna szerokość komórki (zanim ResizeObserver ustawi właściwą) ──
// Wartość zastępcza — użytkownik jej nie zobaczy, tylko zapobiega
// chwilowemu layoutowi zerowej szerokości przy pierwszym renderze.
export const TIMELINE_CELL_W_FALLBACK = 28;

// ── Wysokości wierszy ────────────────────────────────────────
// Wysokość nagłówka z datami (górny pasek z numerami dni).
export const TIMELINE_HEADER_ROW_H = 22;
// Wysokość wiersza trenera (gdzie leżą paski szkoleń).
export const TIMELINE_TRAINER_ROW_H = 30;
// Wysokość komórek nagłówka dni i tygodni (dopasowana do czcionki).
// Zmniejsz aby nagłówek był bardziej kompaktowy.
export const TIMELINE_DAY_HEADER_H = 14;

// ── Paski szkoleń (bary) ─────────────────────────────────────
// Czcionka tytułu szkolenia na pasku.
export const BAR_FONT_SIZE = 10;
// Czcionka ikonek 🔒 / ✈️ na pasku.
export const BAR_ICON_FONT_SIZE = 8;
// Rozmiar kółka z liczbą uczestników (px).
export const BAR_BADGE_SIZE = 14;
// Czcionka cyfry w kółku z uczestnikami.
export const BAR_BADGE_FONT_SIZE = 8;

// ── Zakres miesięcy ──────────────────────────────────────────
// O ile miesięcy wstecz i w przód ładować dane przy starcie.
// Wartości ujemne = wstecz, dodatnie = w przód.
export const TIMELINE_MONTHS_BACK   = -1;
export const TIMELINE_MONTHS_AHEAD  =  1;

// ── localStorage ────────────────────────────────────────────
// Klucz pod którym trener zapisuje swoje preferencje widoku.
export const LS_ACTIVE_TRAINERS_KEY = "eea_active_trainers";
