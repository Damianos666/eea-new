// ─── Hasła motywujące po quizie tygodniowym ──────────────────────────────────
// Edytuj swobodnie — wyświetlane zależnie od wyniku procentowego.
// Każda kategoria: tablica stringów → losowany jeden przy każdym wyniku.

export const QUIZ_MESSAGES = {
  // wynik >= 90%
  excellent: [
    "Doskonały wynik! Jesteś ekspertem 🌟",
    "Perfekcja! Wiedza przemawia przez Ciebie 🚀",
    "Najlepszy wynik tygodnia — tak trzymaj! 🏆",
    "Mistrzowski poziom! To już liga ekspertów 🎯",
    "Wow! Ten wynik robi wrażenie 🔥",
    "Pełna kontrola nad materiałem 💡",
    "Jesteś w top 1%! Gratulacje 👑",
    "Widać ogrom pracy — efekty są świetne 💪",
    "Ten poziom to inspiracja dla innych 🚀",
    "Perfekcyjnie opanowane — brawo!"
  ],

  // wynik >= 70%
  good: [
    "Świetna robota! Następnym razem może 90%?",
    "Bardzo dobrze! Widać że czytasz tipy uważnie 📖",
    "Solidny wynik — jesteś na dobrej drodze 💪",
    "Coraz bliżej mistrzostwa 🔝",
    "Dobra forma! Jeszcze trochę i będzie top 🚀",
    "Stabilny progres — tak trzymaj 📈",
    "Twoja wiedza rośnie z tygodnia na tydzień 🌱",
    "To już poziom zaawansowany 👌",
    "Mały krok do wielkiego wyniku 🏆",
    "Widać systematyczność — działa!"
  ],

  // wynik >= 50%
  ok: [
    "Dobry start! Czytaj tipy jeszcze uważniej 📖",
    "Nieźle! Powtórz materiał i następnym razem będzie lepiej",
    "50% to dobra baza — w górę od teraz! ⬆️",
    "Jesteś na półmetku — teraz przyspiesz 💪",
    "Potencjał jest — czas go wykorzystać 🔧",
    "Jeszcze trochę pracy i wskoczysz wyżej 🚀",
    "Każdy quiz przybliża Cię do celu 🎯",
    "Zrób mały upgrade wiedzy i wróć silniejszy 🔄",
    "Fundament już jest — buduj dalej 🧱",
    "To dopiero początek — działaj dalej!"
  ],

  // wynik < 50%
  low: [
    "Powtórz tipy i spróbuj za tydzień 💪",
    "Każdy błąd to lekcja — wróć silniejszy za 7 dni!",
    "Nie poddawaj się — następny quiz będzie Twój! 🎯",
    "To dopiero rozgrzewka — działaj dalej 🔥",
    "Każdy ekspert kiedyś zaczynał 📚",
    "Zrób reset i wróć z nową energią ⚡",
    "Spróbuj jeszcze raz — progres przyjdzie 💡",
    "Małe kroki też prowadzą do celu 🚶",
    "Nie wynik, a kierunek ma znaczenie 🧭",
    "Następny tydzień to Twoja szansa!"
  ],
};

// Pomocnicza funkcja — losuje jedno hasło z odpowiedniej kategorii
export function getQuizMessage(pct) {
  let msgs;
  if (pct >= 90)      msgs = QUIZ_MESSAGES.excellent;
  else if (pct >= 70) msgs = QUIZ_MESSAGES.good;
  else if (pct >= 50) msgs = QUIZ_MESSAGES.ok;
  else                msgs = QUIZ_MESSAGES.low;
  return msgs[Math.floor(Math.random() * msgs.length)];
}

// ─── Hasła motywujące po potwierdzeniu Tipa dnia ─────────────────────────────
// Edytuj swobodnie — losowane przy każdym potwierdzeniu.

export const TIP_MESSAGES = [
  "Wiedza rośnie krok po kroku. Dobra robota! 💡",
  "Kolejny tip zaliczony — streak się kręci! 🔥",
  "Codzienność buduje ekspertów. Tak trzymaj! 💪",
  "Mały krok każdego dnia = wielki postęp! 🚀",
  "Brawo! Jutro kolejna dawka wiedzy czeka 📖",
  "Systematyczność to klucz do mistrzostwa 🏆",
  "Każdy tip to cegiełka w budowaniu wiedzy 🧱",
  "Konsekwencja procentuje — świetna robota! 📈",
  "Ekspert w akcji! Tak trzymaj 🎯",
  "Kolejny dzień, kolejny krok do przodu ⬆️",
];

// Losuje jedno hasło motywujące po tipie
export function getTipMessage() {
  return TIP_MESSAGES[Math.floor(Math.random() * TIP_MESSAGES.length)];
}
