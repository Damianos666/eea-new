/**
 * RegistrationForm — publiczny formularz zgłoszeniowy
 * Dostępny bez logowania pod ścieżką /rejestracja
 *
 * Zmiany v2:
 *  1. Dane (oprócz uczestników) zapisywane w localStorage → prefill przy powrocie
 *  2. Usunięte pole adres/lokalizacja
 *  3. Logo: logo-header.png na ciemnym tle
 *  4. Szerszy kontener na desktopie (max-width 1400px)
 *  5. Pełne scrollowanie strony
 */

import { useState, useEffect } from "react";
import { SB_URL } from "../lib/supabase";

const SB_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

const C = {
  green:   "#8AB73E",
  greyDk:  "#686868",
  greyMid: "#A0A0A0",
  grey:    "#E8E8E8",
  greyBg:  "#EFEFEF",
  white:   "#FFFFFF",
  black:   "#1A1A1A",
  red:     "#C0392B",
};

/* localStorage helpers */
const LS_KEY = "eea_reg_prefill";
function loadPrefill() {
  try { const r = localStorage.getItem(LS_KEY); return r ? JSON.parse(r) : {}; }
  catch { return {}; }
}
function savePrefill(d) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(d)); } catch {}
}

/* Supabase public insert */
async function insertRegistration(payload) {
  const r = await fetch(`${SB_URL}/rest/v1/training_registrations`, {
    method: "POST",
    headers: {
      "apikey":        SB_ANON,
      "Authorization": `Bearer ${SB_ANON}`,
      "Content-Type":  "application/json",
      "Prefer":        "return=minimal",
    },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(await r.text());
}

/* ─── Tiny UI helpers ───────────────────────────────────────────────────── */
function Field({ label, required, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
      <label style={{ fontSize: 12, color: C.greyDk, fontWeight: 600 }}>
        {label}{required && <span style={{ color: C.green, marginLeft: 2 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

function Input({ style, ...props }) {
  const [focused, setFocused] = useState(false);
  return (
    <input
      {...props}
      style={{
        display: "block",
        WebkitAppearance: "none", appearance: "none",
        width: "100%", maxWidth: "100%", minWidth: 0, margin: 0, padding: "10px 12px",
        border: `1px solid ${focused ? C.green : "#C8C8C8"}`,
        borderRadius: 8, fontSize: 13, color: C.black,
        background: C.white, outline: "none",
        boxSizing: "border-box", fontFamily: "inherit",
        boxShadow: focused ? "0 0 0 3px rgba(138,183,62,.20)" : "none",
        transition: "border-color .15s, box-shadow .15s",
        ...style,
      }}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    />
  );
}

function Section({ title, hint, children }) {
  return (
    <div style={{ border: `1px solid ${C.grey}`, borderRadius: 10, padding: "14px 16px", background: C.white }}>
      <div style={{
        display: "flex", alignItems: "baseline", justifyContent: "space-between",
        gap: 12, paddingBottom: 10, marginBottom: 12, borderBottom: `1px solid ${C.grey}`,
      }}>
        <h2 style={{ margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: .3, textTransform: "uppercase", color: C.greyDk }}>
          {title}
        </h2>
        {hint && <span style={{ fontSize: 11, color: C.greyMid }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function ConsentRow({ checked, onChange, id, label, hint }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
      <input id={id} type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
        style={{ width: 18, height: 18, marginTop: 2, flexShrink: 0, accentColor: C.green }} />
      <div>
        <label htmlFor={id} style={{ fontSize: 13, color: C.black, lineHeight: 1.4, display: "block" }}>{label}</label>
        {hint && <div style={{ fontSize: 11, color: C.greyMid, marginTop: 4 }}>{hint}</div>}
      </div>
    </div>
  );
}

function ParticipantRow({ idx, data, onChange, onRemove, canRemove }) {
  return (
    <div style={{ border: `1px solid ${C.grey}`, borderRadius: 10, padding: "12px 14px", background: "#FAFAFA" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: C.greyDk, border: `1px solid ${C.grey}`, borderRadius: 999, padding: "3px 10px", background: C.white }}>
          Uczestnik #{idx + 1}
        </span>
        {canRemove && (
          <button type="button" onClick={onRemove}
            style={{ border: "1px solid rgba(192,57,43,.35)", borderRadius: 6, background: C.white, color: "#7a1a12", padding: "5px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
            Usuń
          </button>
        )}
      </div>
      <div className="reg-grid-2">
        <Field label="Imię i nazwisko" required>
          <Input value={data.name} onChange={e => onChange("name", e.target.value)} placeholder="Jan Kowalski" />
        </Field>
        <Field label="Stanowisko">
          <Input value={data.position} onChange={e => onChange("position", e.target.value)} placeholder="Inżynier UR" />
        </Field>
      </div>
    </div>
  );
}

/* ─── Main ──────────────────────────────────────────────────────────────── */
export function RegistrationForm() {
  const prefill = loadPrefill();

  const [course,       setCourse]       = useState(prefill.course       || "");
  const [term,         setTerm]         = useState(prefill.term         || "");
  const [company,      setCompany]      = useState(prefill.company      || "");
  const [nip,          setNip]          = useState(prefill.nip          || "");
  const [contactName,  setContactName]  = useState(prefill.contactName  || "");
  const [contactPos,   setContactPos]   = useState(prefill.contactPos   || "");
  const [contactPhone, setContactPhone] = useState(prefill.contactPhone || "");
  const [contactEmail, setContactEmail] = useState(prefill.contactEmail || "");
  const [invoiceNote,  setInvoiceNote]  = useState(prefill.invoiceNote  || "");
  const [participants, setParticipants] = useState([{ name: "", position: "" }]);
  const [terms,        setTerms]        = useState(false);
  const [rodo,         setRodo]         = useState(false);
  const [status,       setStatus]       = useState(null);
  const [errMsg,       setErrMsg]       = useState("");
  const [submitting,   setSubmitting]   = useState(false);

  /* Autosave danych (bez uczestników) do localStorage */
  useEffect(() => {
    savePrefill({ course, term, company, nip, invoiceNote, contactName, contactPos, contactPhone, contactEmail });
  }, [course, term, company, nip, invoiceNote, contactName, contactPos, contactPhone, contactEmail]);

  function addParticipant() { setParticipants(p => [...p, { name: "", position: "" }]); }
  function removeParticipant(idx) { setParticipants(p => p.filter((_, i) => i !== idx)); }
  function updateParticipant(idx, field, val) { setParticipants(p => p.map((r, i) => i === idx ? { ...r, [field]: val } : r)); }

  async function handleSubmit(e) {
    e.preventDefault();
    for (let i = 0; i < participants.length; i++) {
      if (!participants[i].name.trim()) {
        setStatus("err"); setErrMsg(`Uczestnik #${i + 1}: brak imienia i nazwiska.`); return;
      }
    }
    if (!terms || !rodo) { setStatus("err"); setErrMsg("Zaznacz obowiązkowe zgody."); return; }

    setSubmitting(true); setStatus(null);

    const participantsNote = participants
      .map((p, i) => `${i + 1}. ${p.name.trim()}${p.position ? ` (${p.position})` : ""}`)
      .join("\n");

    try {
      await insertRegistration({
        course:            course.trim(),
        term:              term || null,
        company_name:      company.trim(),
        nip:               nip.trim(),
        contact_name:      contactName.trim(),
        contact_position:  contactPos.trim(),
        contact_phone:     contactPhone.trim(),
        contact_email:     contactEmail.trim(),
        invoice_note:      invoiceNote.trim() || null,
        participants:      participants.map(p => ({ name: p.name.trim(), position: p.position.trim() })),
        participants_note: participantsNote,
        consent_terms:     terms,
        consent_rodo:      rodo,
      });
      setStatus("ok");
      setParticipants([{ name: "", position: "" }]);
      setTerms(false); setRodo(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setStatus("err");
      setErrMsg("Błąd zapisu. Spróbuj ponownie lub skontaktuj się z nami bezpośrednio.\n" + err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      width: "100%",
      background: C.greyBg,
      fontFamily: "'Helvetica Neue', Helvetica, Arial, 'Noto Sans', sans-serif",
      display: "flex",
      justifyContent: "center",
      alignItems: "flex-start",
    }}>
      <div className="public-page-wrap" style={{ width: "100%", maxWidth: 1000, margin: "0 auto", boxSizing: "border-box" }}>

        {status === "ok" && (
          <div style={{
            marginBottom: 20, padding: "16px 20px", borderRadius: 10,
            background: "rgba(6,118,71,.06)", border: "1px solid rgba(6,118,71,.35)",
            fontSize: 14, color: "#067647", fontWeight: 600, lineHeight: 1.5,
          }}>
            ✅ Zgłoszenie zostało przyjęte! Skontaktujemy się z Tobą wkrótce.
          </div>
        )}

        <div style={{ background: C.white, border: `1px solid ${C.grey}`, borderRadius: 10, boxShadow: "0 10px 30px rgba(16,24,40,.08)", overflow: "hidden", width: "100%" }}>

          {/* Nagłówek */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            gap: 16, padding: "20px 24px", borderBottom: `4px solid ${C.green}`,
            background: "#2C2C2C", flexWrap: "wrap",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              <img src="/logo-header.png" alt="ENGEL" style={{ height: 28, width: "auto", display: "block" }} />
              <div>
                <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: .3, textTransform: "uppercase", color: C.white }}>
                  Formularz zgłoszeniowy — szkolenie
                </div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 3 }}>
                  Wypełnij dane firmy, osoby kontaktowej oraz dodaj uczestników.
                </div>
              </div>
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
              <span style={{ color: C.green, fontWeight: 900 }}>*</span> pola obowiązkowe
            </div>
          </div>

          {/* Formularz */}
          <form onSubmit={handleSubmit} noValidate style={{ padding: "18px 24px", display: "flex", flexDirection: "column", gap: 14 }}>

            {/* Dane szkolenia — bez pola adres (pkt 2) */}
            <Section title="Dane szkolenia" hint="Nazwa kursu i termin">
              <div className="reg-grid-2-1">
                <Field label="Nazwa kursu" required>
                  <Input value={course} onChange={e => setCourse(e.target.value)} placeholder="np. ENGEL e-mac" required />
                </Field>
                <Field label="Termin">
                  <Input type="date" value={term} onChange={e => setTerm(e.target.value)} style={{ minHeight: "37px" }} />
                </Field>
              </div>
            </Section>

            {/* Dane firmy */}
            <Section title="Dane firmy (do faktury)" hint="Nazwa firmy, NIP, dodatkowe info">
              <div className="reg-grid-2">
                <Field label="Nazwa firmy" required>
                  <Input value={company} onChange={e => setCompany(e.target.value)} placeholder="Acme Sp. z o.o." required />
                </Field>
                <Field label="NIP" required>
                  <Input value={nip} onChange={e => setNip(e.target.value)} placeholder="000-000-00-00" required />
                </Field>
                <div style={{ gridColumn: "1 / -1" }}>
                  <Field label="Dodatkowe informacje do faktury">
                    <Input value={invoiceNote} onChange={e => setInvoiceNote(e.target.value)} placeholder="np. KSeF lub dodatkowe numery zamówienia" />
                  </Field>
                </div>
              </div>
            </Section>

            {/* Osoba kontaktowa — 4 pola w jednym rzędzie na desktopie */}
            <Section title="Osoba kontaktowa" hint="Telefon + e-mail do potwierdzeń">
              <div className="reg-grid-auto-200">
                <Field label="Imię i nazwisko" required>
                  <Input value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Anna Nowak" required />
                </Field>
                <Field label="Stanowisko">
                  <Input value={contactPos} onChange={e => setContactPos(e.target.value)} placeholder="Kierownik szkoleń" />
                </Field>
                <Field label="Telefon">
                  <Input type="tel" value={contactPhone} onChange={e => setContactPhone(e.target.value)} placeholder="+48 600 000 000" />
                </Field>
                <Field label="Email" required>
                  <Input type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="anna@firma.pl" required />
                </Field>
              </div>
            </Section>

            {/* Uczestnicy — 2 kolumny na szerokim ekranie */}
            <Section title="Uczestnicy" hint="Min. 1 uczestnik">
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div className="reg-grid-participants">
                  {participants.map((p, i) => (
                    <ParticipantRow
                      key={i} idx={i} data={p}
                      onChange={(f, v) => updateParticipant(i, f, v)}
                      onRemove={() => removeParticipant(i)}
                      canRemove={participants.length > 1}
                    />
                  ))}
                </div>
                <button type="button" onClick={addParticipant}
                  style={{ alignSelf: "flex-start", border: "1px solid #C8C8C8", borderRadius: 8, background: C.white, color: C.greyDk, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  + Dodaj uczestnika
                </button>
                <div style={{ fontSize: 11, color: C.greyMid }}>
                  Uczestnik: imię i nazwisko (wymagane) + stanowisko (opcjonalne).
                </div>
              </div>
            </Section>

            {/* Zgody */}
            <Section title="Zgody" hint="Akceptacja OWU i RODO">
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <ConsentRow checked={terms} onChange={setTerms} id="terms"
                  label={<>Tak, akceptuję Ogólne Warunki Świadczenia Usług Szkoleniowych <span style={{ color: C.green, fontWeight: 900 }}>*</span></>}
                  hint={<a href="/regulamin" target="_blank" rel="noopener" style={{ color: C.greyDk, textDecoration: "underline" }}>Otwórz regulamin</a>}
                />
                <ConsentRow checked={rodo} onChange={setRodo} id="rodo"
                  label={<>Wyrażam zgodę na przetwarzanie podanych danych osobowych <span style={{ color: C.green, fontWeight: 900 }}>*</span></>}
                  hint={<>Informacje: <a href="https://www.engelglobal.com/dataprotection" target="_blank" rel="noopener" style={{ color: C.greyDk, textDecoration: "underline" }}>engelglobal.com/dataprotection</a></>}
                />

                {status === "err" && (
                  <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(180,35,24,.06)", border: "1px solid rgba(180,35,24,.35)", fontSize: 13, color: C.red, whiteSpace: "pre-line" }}>
                    {errMsg || "Uzupełnij wymagane pola i zaznacz obowiązkowe zgody."}
                  </div>
                )}

                <div style={{ marginTop: 4 }}>
                  <button type="submit" disabled={submitting}
                    style={{
                      background: submitting ? "#aac672" : C.green, border: "none",
                      borderRadius: 8, color: "#0b0c0d", padding: "11px 28px",
                      fontSize: 14, fontWeight: 700,
                      cursor: submitting ? "not-allowed" : "pointer", transition: "background .2s",
                    }}>
                    {submitting ? "Wysyłanie…" : "Wyślij zgłoszenie"}
                  </button>
                </div>
              </div>
            </Section>

          </form>
        </div>

        <div style={{ marginTop: 20, textAlign: "center", fontSize: 11, color: C.greyMid }}>
          ENGEL Expert Academy · Formularz zgłoszeniowy
        </div>
      </div>
    </div>
  );
}
