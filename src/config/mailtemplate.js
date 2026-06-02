// ─────────────────────────────────────────────────────────────
//  mailtemplate.js
//  Szablon maila z zapytaniem o szkolenie wysyłanego do uczestnika.
//  Dane kontaktowe pobierane ze zmiennych środowiskowych Vite:
//    VITE_CONTACT_EMAIL  — adres e-mail (już używany w MessagesTab)
//    VITE_CONTACT_PHONE  — telefon      (już używany w MessagesTab)
//    VITE_CONTACT_PERSON — imię i nazwisko osoby kontaktowej
//
//  Zmień treść MAIL_SUBJECT / MAIL_BODY tutaj.
// ─────────────────────────────────────────────────────────────

const CONTACT_EMAIL  = import.meta.env.VITE_CONTACT_EMAIL  || "";
const CONTACT_PHONE  = import.meta.env.VITE_CONTACT_PHONE  || "";
const CONTACT_PERSON = import.meta.env.VITE_CONTACT_PERSON || "";

// Temat maila — {trainingTitle} zostanie zastąpione nazwą szkolenia
export const MAIL_SUBJECT = "Zapytanie o szkolenie: {trainingTitle}";

// Treść maila — dostępne zmienne:
//   {name}          — imię i nazwisko uczestnika
//   {trainingTitle} — nazwa szkolenia
//   {trainingDate}  — data szkolenia
//   {contactPerson} — VITE_CONTACT_PERSON
//   {contactEmail}  — VITE_CONTACT_EMAIL
//   {contactPhone}  — VITE_CONTACT_PHONE
export const MAIL_BODY = `Dzień dobry {name},

dziękujemy za zainteresowanie szkoleniem organizowanym przez ENGEL Polska.

Zgodnie ze zgłoszeniem chcielibyśmy potwierdzić zainteresowanie udziałem w szkoleniu:

  Szkolenie: {trainingTitle}
  Termin:    {trainingDate}

Prosimy o potwierdzenie chęci uczestnictwa lub kontakt w przypadku pytań dotyczących programu, warunków uczestnictwa lub ewentualnych zmian terminu.

W razie pytań pozostajemy do dyspozycji:

  {contactPerson}
  {contactEmail}
  {contactPhone}

Z poważaniem,
{contactPerson}
Zespół Szkoleniowy ENGEL Polska`;

// Funkcja budująca gotowy link mailto
export function buildMailtoLink({ name, email, trainingTitle, trainingDate }) {
  const replace = (str) =>
    str
      .replace(/{name}/g,           name          || "")
      .replace(/{trainingTitle}/g,   trainingTitle || "")
      .replace(/{trainingDate}/g,    trainingDate  || "")
      .replace(/{contactPerson}/g,   CONTACT_PERSON)
      .replace(/{contactEmail}/g,    CONTACT_EMAIL)
      .replace(/{contactPhone}/g,    CONTACT_PHONE);

  const subject = encodeURIComponent(replace(MAIL_SUBJECT));
  const body    = encodeURIComponent(replace(MAIL_BODY));

  return `mailto:${email}?subject=${subject}&body=${body}`;
}
