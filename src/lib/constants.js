export const C = {
  black:"#1A1A1A", darkHdr:"#2C2C2C", green:"#8AB73E", greenDk:"#6E9430",
  greenBg:"#F0F7E0", grey:"#E8E8E8", greyMid:"#A0A0A0", greyDk:"#686868",
  greyBg:"#EFEFEF", greyBanner:"#E2E5E8", white:"#FFFFFF",
  red:"#C0392B", amber:"#E67E22", blue:"#2980B9",
  doneBg:"#E8EDE0", doneBorder:"rgba(138,183,62,.4)",
};

export const GROUPS = [
  { id:"tech",    label:"Tech.",    color:C.green },
  { id:"ur",      label:"UR",       color:C.amber },
  { id:"maszyny", label:"Obsługa",  color:C.red   },
];

export const LVL_COLOR = ["", C.green, C.amber, C.red];
export const LVL_LABEL = ["", "Podstawowy", "Średni", "Zaawansowany"];

export const MSG_TYPES = {
  info:    { color:C.blue,    bg:"#EBF5FB", icon:"ℹ️" },
  warning: { color:C.amber,   bg:"#FEF3E2", icon:"⚠️" },
  success: { color:C.greenDk, bg:C.greenBg, icon:"✅" },
  alert:   { color:C.red,     bg:"#FDEDEC", icon:"🔔" },
};

// BEZPIECZEŃSTWO: Panel Dewelopera widoczny tylko gdy VITE_DEV_PANEL=true w .env.local

export const DEV_PANEL_ENABLED = import.meta.env.VITE_DEV_PANEL === "true";
//export const DEV_PANEL_ENABLED = true;

export const TRAINERS = {
  1: "Sylwester Klimek",
  2: "Adam Laskowski",
  3: "Michał Michałowski",
  4: "Damian Świderski",
  5: "Marcin Bednarczyk",
};

// Nadpisanie automatycznie generowanych inicjałów (pierwsza litera imienia + nazwiska).
// Dodaj wpis jeśli auto-inicjały są nieprawidłowe lub niezgodne z konwencją.
export const TRAINER_INITIALS = {
  5: "AT",
};

// Zwraca inicjały trenera — z nadpisania lub auto (pierwsze litery imię + nazwisko).
export function trainerInitials(id) {
  if (TRAINER_INITIALS[id]) return TRAINER_INITIALS[id];
  return (TRAINERS[id] || "").split(" ").map(w => w[0]).join("") || `T${id}`;
}
