// ─────────────────────────────────────────────────────────────────────────────
//  mailconfirmation.js
//  Szablon maila POTWIERDZAJĄCEGO rejestrację na szkolenie.
//  Wysyłany do osoby kontaktowej firmy z panelu admina → zakładka Rejestracje.
//
//  Dane kontaktowe nadawcy (ENGEL Polska) — ze zmiennych środowiskowych Vite:
//    VITE_CONTACT_EMAIL  — adres e-mail Zespołu Szkoleniowego
//    VITE_CONTACT_PHONE  — telefon Zespołu Szkoleniowego
//    VITE_CONTACT_PERSON — imię i nazwisko osoby kontaktowej po stronie ENGEL
//
//  Zmienne dostępne w szablonie:
//    {contactName}    — imię i nazwisko osoby kontaktowej z firmy klienta
//    {companyName}    — nazwa firmy klienta
//    {course}         — nazwa kursu/szkolenia
//    {term}           — termin szkolenia (sformatowana data lub "—")
//    {participantsList} — automatycznie generowana lista uczestników (numerowana)
//    {engelPerson}    — VITE_CONTACT_PERSON
//    {engelEmail}     — VITE_CONTACT_EMAIL
//    {engelPhone}     — VITE_CONTACT_PHONE
// ─────────────────────────────────────────────────────────────────────────────

const CONTACT_EMAIL  = import.meta.env.VITE_CONTACT_EMAIL  || "";
const CONTACT_PHONE  = import.meta.env.VITE_CONTACT_PHONE  || "";
const CONTACT_PERSON = import.meta.env.VITE_CONTACT_PERSON || "";

// ── Temat maila ──────────────────────────────────────────────────────────────
// Zmień treść poniżej — {course} zostanie zastąpione nazwą szkolenia.
export const CONFIRM_SUBJECT = "Potwierdzenie zgłoszenia: {course}";

// ── Treść maila ──────────────────────────────────────────────────────────────
// Edytuj dowolnie. Zmienne w {nawiasach} są zastępowane automatycznie.
export const CONFIRM_BODY = `Dzień dobry {contactName},

dziękujemy za przesłanie zgłoszenia na szkolenie organizowane przez ENGEL Polska.

Potwierdzamy rejestrację następujących osób:

  Firma:    {companyName}
  Kurs:     {course}
  Termin:   {term}

Lista zgłoszonych uczestników:
{participantsList}


Ponizej przesyłam wskazówki organizacyjne na temat szkolenia:

Godziny szkolenia: codziennie 8:30 – 16:00
Miejsce szkolenia: ENGEL POLSKA Sp. z o.o. ul. Ostródzka 50B, Warszawa (03-289)
Mapa:  https://goo.gl/maps/f4KQtmbnfY82
 
Hotele w najbliższej okolicy: 
https://warszawa-polnoc.campanile.com/pl/?sr=SEO_BING      Na hasło ENGEL 5% ZNIŻKI
http://www.partnerhotel.pl/
https://hotelmistral.pl/
http://stalowa52.pl/ 
 
Komunikacja miejska:
https://jakdojade.pl/warszawa/trasa/
Przystanek: OSTRÓDZKA
----------------
Rezygnacja
Anulowanie zgłoszenia w terminie do 2 tygodni przed rozpoczęciem kursu jest bezpłatne. Zrezygnowanie na tydzień przed rozpoczęciem kursu spowoduje obciążenie Klienta 50% kosztami szkolenia. Zamiana uczestników kursu jest zawsze możliwa. Zastrzegamy sobie prawo do przesunięcia, odwołania lub wyznaczenia nowego terminu dla określonego kursu. Informacje na ten temat zostaną przekazane Klientom z odpowiednim wyprzedzeniem.
----------------


W razie pytań dotyczących szkolenia, warunków uczestnictwa lub konieczności wprowadzenia zmian prosimy o kontakt:

  {engelPerson}
  {engelEmail}
  {engelPhone}

Z poważaniem,
Zespół Szkoleniowy ENGEL Polska`;

// ─────────────────────────────────────────────────────────────────────────────
//  buildConfirmMailtoLink — buduje gotowy link mailto: do użycia w <a href>
//
//  Parametry:
//    contactName   — imię i nazwisko osoby kontaktowej (z formularza)
//    contactEmail  — email osoby kontaktowej (z formularza)
//    companyName   — nazwa firmy (z formularza)
//    course        — nazwa szkolenia (z formularza)
//    term          — termin (sformatowany string lub "—")
//    participants  — tablica [{name, position}, ...]
// ─────────────────────────────────────────────────────────────────────────────
export function buildConfirmMailtoLink({
  contactName  = "",
  contactEmail = "",
  companyName  = "",
  course       = "",
  term         = "—",
  participants = [],
}) {
  // Buduj numerowaną listę uczestników
  const participantsList = participants.length > 0
    ? participants
        .map((p, i) => {
          const pos = p.position ? ` (${p.position})` : "";
          return `  ${i + 1}. ${p.name}${pos}`;
        })
        .join("\n")
    : "  (brak danych uczestników)";

  const replace = (str) =>
    str
      .replace(/{contactName}/g,     contactName)
      .replace(/{companyName}/g,     companyName)
      .replace(/{course}/g,          course)
      .replace(/{term}/g,            term)
      .replace(/{participantsList}/g, participantsList)
      .replace(/{engelPerson}/g,     CONTACT_PERSON)
      .replace(/{engelEmail}/g,      CONTACT_EMAIL)
      .replace(/{engelPhone}/g,      CONTACT_PHONE);

  const subject = encodeURIComponent(replace(CONFIRM_SUBJECT));
  const body    = encodeURIComponent(replace(CONFIRM_BODY));

  return `mailto:${contactEmail}?subject=${subject}&body=${body}`;
}
