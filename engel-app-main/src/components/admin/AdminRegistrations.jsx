/**
 * AdminRegistrations — zakładka panelu admina: Rejestracje
 *
 * Funkcje v2:
 *  - Przycisk "✉ Potwierdź email" używa szablonu z mailconfirmation.js
 *  - Przycisk "📄 PDF" generuje formularz zgłoszeniowy jako PDF (bez zewnętrznych zależności)
 */

import { useState, useEffect, useCallback } from "react";
import { C } from "../../lib/constants";
import { db } from "../../lib/supabase";
import { buildConfirmMailtoLink } from "../../config/mailconfirmation";

const TABLE = "training_registrations";

function fmt(dateStr) {
  if (!dateStr) return "—";
  try { return new Date(dateStr + "T00:00:00").toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" }); }
  catch { return dateStr; }
}
function fmtDateTime(dateStr) {
  if (!dateStr) return "—";
  try { return new Date(dateStr).toLocaleString("pl-PL", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return dateStr; }
}

/* ─── PDF generator — window.print() z ukrytym iframe ─────────────────── */
function generateRegistrationPDF(item) {
  const participants = Array.isArray(item.participants) ? item.participants : [];
  const term = fmt(item.term);
  const created = fmtDateTime(item.created_at);

  const participantsRows = participants.map((p, i) => `
    <tr>
      <td style="padding:6px 10px;border-bottom:1px solid #E8E8E8;color:#686868;">${i + 1}.</td>
      <td style="padding:6px 10px;border-bottom:1px solid #E8E8E8;font-weight:600;">${p.name || "—"}</td>
      <td style="padding:6px 10px;border-bottom:1px solid #E8E8E8;color:#686868;">${p.position || "—"}</td>
    </tr>`).join("");

  const html = `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="utf-8"/>
  <title>Zgłoszenie — ${item.company_name || "—"}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0; padding: 32px 40px;
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      font-size: 12px; color: #1A1A1A;
      background: #fff;
    }
    .header {
      display: flex; align-items: center; justify-content: space-between;
      padding-bottom: 14px; border-bottom: 4px solid #8AB73E; margin-bottom: 24px;
    }
    .logo-wrap {
      background: #2C2C2C; border-radius: 8px;
      padding: 8px 14px; display: inline-flex; align-items: center;
    }
    .logo-wrap img { height: 24px; }
    .title { font-size: 16px; font-weight: 700; text-transform: uppercase; letter-spacing: .3px; color: #686868; }
    .subtitle { font-size: 11px; color: #A0A0A0; margin-top: 3px; }
    .meta { font-size: 11px; color: #A0A0A0; text-align: right; }

    .section { margin-bottom: 18px; }
    .section-title {
      font-size: 10px; font-weight: 700; letter-spacing: 1px;
      text-transform: uppercase; color: #686868;
      border-bottom: 1px solid #E8E8E8; padding-bottom: 6px; margin-bottom: 10px;
    }
    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .field label { font-size: 10px; color: #A0A0A0; display: block; margin-bottom: 3px; }
    .field .val { font-size: 13px; font-weight: 600; }

    table { width: 100%; border-collapse: collapse; }
    thead th {
      text-align: left; padding: 7px 10px;
      background: #F5F5F5; font-size: 10px; font-weight: 700;
      text-transform: uppercase; letter-spacing: .5px; color: #686868;
    }
    .badge {
      display: inline-block; background: #8AB73E; color: #fff;
      font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 4px;
    }
    .footer {
      margin-top: 32px; padding-top: 12px; border-top: 1px solid #E8E8E8;
      font-size: 10px; color: #A0A0A0; text-align: center;
    }
    @media print {
      body { padding: 20px 28px; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div style="display:flex;align-items:center;gap:14px;">
      <div class="logo-wrap">
        <img src="/logo-header.png" alt="ENGEL"/>
      </div>
      <div>
        <div class="title">Formularz zgłoszeniowy — szkolenie</div>
        <div class="subtitle">ENGEL Expert Academy</div>
      </div>
    </div>
    <div class="meta">
      Zgłoszono: ${created}<br/>
      <span class="badge">${item.is_handled ? "Obsłużone" : "Oczekuje"}</span>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Dane szkolenia</div>
    <div class="grid2">
      <div class="field"><label>Nazwa kursu</label><div class="val">${item.course || "—"}</div></div>
      <div class="field"><label>Termin</label><div class="val">${term}</div></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Dane firmy (do faktury)</div>
    <div class="grid2">
      <div class="field"><label>Nazwa firmy</label><div class="val">${item.company_name || "—"}</div></div>
      <div class="field"><label>NIP</label><div class="val">${item.nip || "—"}</div></div>
      ${item.invoice_note ? `<div class="field" style="grid-column: 1 / -1;"><label>Dodatkowe informacje do faktury</label><div class="val" style="color:#C0392B;">${item.invoice_note}</div></div>` : ""}
    </div>
  </div>

  <div class="section">
    <div class="section-title">Osoba kontaktowa</div>
    <div class="grid2">
      <div class="field"><label>Imię i nazwisko</label><div class="val">${item.contact_name || "—"}</div></div>
      <div class="field"><label>Stanowisko</label><div class="val">${item.contact_position || "—"}</div></div>
      <div class="field"><label>Telefon</label><div class="val">${item.contact_phone || "—"}</div></div>
      <div class="field"><label>Email</label><div class="val">${item.contact_email || "—"}</div></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Zgłoszeni uczestnicy (${participants.length})</div>
    <table>
      <thead>
        <tr>
          <th style="width:40px;">#</th>
          <th>Imię i nazwisko</th>
          <th>Stanowisko</th>
        </tr>
      </thead>
      <tbody>
        ${participantsRows || '<tr><td colspan="3" style="padding:10px;color:#A0A0A0;text-align:center;">Brak uczestników</td></tr>'}
      </tbody>
    </table>
  </div>

  ${item.admin_notes ? `
  <div class="section">
    <div class="section-title">Notatki</div>
    <div style="padding:10px;background:#F8FFF0;border:1px solid #D4EDBC;border-radius:6px;font-size:12px;line-height:1.6;white-space:pre-wrap;">${item.admin_notes}</div>
  </div>` : ""}

  <div class="section">
    <div class="section-title">Zgody</div>
    <div style="display:flex;gap:24px;">
      <div>${item.consent_terms ? "✅" : "☐"} Akceptacja OWU</div>
      <div>${item.consent_rodo  ? "✅" : "☐"} Zgoda RODO</div>
    </div>
  </div>

  <div class="footer">
    ENGEL Expert Academy · Formularz zgłoszeniowy · Wydrukowano ${new Date().toLocaleDateString("pl-PL")}
  </div>

  <script>window.onload = function(){ window.print(); }<\/script>
</body>
</html>`;

  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) { alert("Zezwól na otwieranie okien pop-up w tej przeglądarce."); return; }
  win.document.write(html);
  win.document.close();
}

/* ─── Single registration card ─────────────────────────────────────────── */
function RegCard({ item, token, onUpdate, onDelete }) {
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesVal,     setNotesVal]     = useState(item.admin_notes || "");
  const [saving,       setSaving]       = useState(false);
  const [toggling,     setToggling]     = useState(false);
  const [deleting,     setDeleting]     = useState(false);
  const [copied,       setCopied]       = useState(false);

  function copyContactData() {
    const lines = [
      item.contact_name  || "",
      item.company_name  || "",
      item.contact_email || "",
      item.contact_phone || "",
    ].filter(Boolean).join("\n");
    navigator.clipboard.writeText(lines).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  const [copiedParticipants, setCopiedParticipants] = useState(false);

  function copyParticipants() {
    const parts = Array.isArray(item.participants) ? item.participants : [];
    const lines = parts.map((p, i) =>
      `${i + 1}. ${p.name}${p.position ? ` (${p.position})` : ""}`
    ).join("\n");
    navigator.clipboard.writeText(lines).then(() => {
      setCopiedParticipants(true);
      setTimeout(() => setCopiedParticipants(false), 2000);
    }).catch(() => {});
  }

  const participants = Array.isArray(item.participants) ? item.participants : [];

  async function saveNotes() {
    setSaving(true);
    try {
      await db.update(token, TABLE, `id=eq.${item.id}`, { admin_notes: notesVal.trim() });
      onUpdate(item.id, { admin_notes: notesVal.trim() });
      setEditingNotes(false);
    } catch (e) { alert("Błąd zapisu: " + e.message); }
    finally { setSaving(false); }
  }

  async function toggleHandled() {
    if (toggling) return;
    setToggling(true);
    const newVal = !item.is_handled;
    try {
      await db.update(token, TABLE, `id=eq.${item.id}`, { is_handled: newVal, handled_at: newVal ? new Date().toISOString() : null });
      onUpdate(item.id, { is_handled: newVal, handled_at: newVal ? new Date().toISOString() : null });
    } catch (e) { alert("Błąd: " + e.message); }
    finally { setToggling(false); }
  }

  async function handleDelete() {
    if (!window.confirm(`Usunąć zgłoszenie od firmy ${item.company_name || "—"}?`)) return;
    setDeleting(true);
    try {
      await db.remove(token, TABLE, `id=eq.${item.id}`);
      onDelete(item.id);
    } catch (e) { alert("Błąd usuwania: " + e.message); }
    finally { setDeleting(false); }
  }

  const isHandled = !!item.is_handled;
  const term = fmt(item.term);

  // Mailto link z szablonem potwierdzającym
  const confirmMailto = item.contact_email
    ? buildConfirmMailtoLink({
        contactName:  item.contact_name  || "",
        contactEmail: item.contact_email || "",
        companyName:  item.company_name  || "",
        course:       item.course        || "",
        term,
        participants,
      })
    : null;

  return (
    <div style={{
      background: C.white, borderRadius: 10,
      boxShadow: "0 1px 4px rgba(0,0,0,.07)", overflow: "hidden",
      border: `1px solid ${isHandled ? C.green : C.grey}`,
      transition: "border-color .2s",
    }}>

      {/* ── Nagłówek karty ──────────────────────────────────────────────── */}
      <div style={{
        padding: "12px 16px", borderBottom: `1px solid ${C.grey}`,
        display: "flex", alignItems: "flex-start", gap: 12,
        background: isHandled ? "#FAFFF5" : C.white,
      }}>
        {/* Avatar firmy — kliknięcie kopiuje dane kontaktowe */}
        <div
          onClick={copyContactData}
          title="Kliknij, aby skopiować dane kontaktowe"
          style={{
            width: 42, height: 42, borderRadius: "50%", flexShrink: 0,
            background: copied ? C.greenBg : (isHandled ? C.greenBg : C.greyBg),
            border: `1.5px solid ${copied ? C.green : (isHandled ? C.green : C.grey)}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: copied ? 18 : 14, fontWeight: 700,
            color: copied ? C.green : (isHandled ? C.greenDk : C.greyDk),
            cursor: "pointer", transition: "all .2s", userSelect: "none",
          }}>
          {copied ? "✓" : (item.company_name || "?").slice(0, 2).toUpperCase()}
        </div>

        {/* Dane główne */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 2 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: C.black }}>{item.company_name || "—"}</span>
            {item.nip && <span style={{ fontSize: 11, color: C.greyMid }}>NIP: {item.nip}</span>}
          </div>
          {item.invoice_note && (
            <div style={{ fontSize: 11, fontWeight: 700, color: C.red, marginBottom: 4, background: "#FDEDEC", padding: "2px 8px", borderRadius: 4, display: "inline-block" }}>
              Faktura: {item.invoice_note}
            </div>
          )}
          <div style={{ fontSize: 12, color: C.greyDk, marginBottom: 2 }}>
            👤 <strong>{item.contact_name || "—"}</strong>
            {item.contact_position && <span style={{ color: C.greyMid }}> · {item.contact_position}</span>}
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            {item.contact_email && (
              <span style={{ fontSize: 11, color: C.greyMid }}>✉ {item.contact_email}</span>
            )}
            {item.contact_phone && (
              <span style={{ fontSize: 11, color: C.greyMid }}>📞 {item.contact_phone}</span>
            )}
          </div>
        </div>

        {/* Prawy: kurs + termin + data zgłoszenia */}
        <div style={{ textAlign: "right", flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          {item.course && (
            <span style={{ fontSize: 11, fontWeight: 700, color: C.green, background: "#F0F7E0", padding: "3px 8px", borderRadius: 5, border: "1px solid rgba(138,183,62,.3)" }}>
              {item.course}
            </span>
          )}
          {item.term && <span style={{ fontSize: 11, color: C.greyMid }}>📅 {term}</span>}
          <span style={{ fontSize: 10, color: C.greyMid }}>zgłoszono: {fmtDateTime(item.created_at)}</span>
        </div>
      </div>

      {/* ── Uczestnicy ──────────────────────────────────────────────────── */}
      {participants.length > 0 && (
        <div
          onClick={copyParticipants}
          title="Kliknij, aby skopiować uczestników"
          style={{ padding: "10px 16px", borderBottom: `1px solid ${C.grey}`, background: copiedParticipants ? "#F0FFF4" : "#FDFDFD", cursor: "pointer", transition: "background .2s", userSelect: "none" }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: copiedParticipants ? C.green : C.greyMid, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
            👥 Uczestnicy ({participants.length})
            {copiedParticipants && <span style={{ fontSize: 9, color: C.green }}>✓ skopiowano</span>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {participants.map((p, i) => (
              <div key={i} style={{ fontSize: 12, color: C.black }}>
                <span style={{ color: C.greyMid, marginRight: 6 }}>{i + 1}.</span>
                <strong>{p.name}</strong>
                {p.position && <span style={{ color: C.greyMid }}> · {p.position}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Notatki ─────────────────────────────────────────────────────── */}
      <div>
        <div
          onClick={() => { setNotesVal(item.admin_notes || ""); setEditingNotes(v => !v); }}
          style={{
            padding: "8px 16px", display: "flex", alignItems: "center", justifyContent: "space-between",
            cursor: "pointer", background: editingNotes ? "#F8FFF0" : "#FAFAFA",
            borderBottom: editingNotes ? `1px solid ${C.grey}` : "none", userSelect: "none",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.greyDk }}>📝 Notatki admina</span>
            {item.admin_notes && !editingNotes && (
              <span style={{ fontSize: 11, color: C.greyMid, fontStyle: "italic" }}>
                {item.admin_notes.slice(0, 80)}{item.admin_notes.length > 80 ? "…" : ""}
              </span>
            )}
            {!item.admin_notes && !editingNotes && (
              <span style={{ fontSize: 11, color: C.greyMid }}>Kliknij, aby dodać notatki…</span>
            )}
          </div>
          <span style={{ fontSize: 11, color: C.greyMid }}>{editingNotes ? "▲" : "✏️"}</span>
        </div>

        {editingNotes && (
          <div style={{ padding: "12px 16px", background: "#F8FFF0", display: "flex", flexDirection: "column", gap: 10 }}>
            <textarea
              value={notesVal} onChange={e => setNotesVal(e.target.value)}
              rows={4} placeholder="Notatki wewnętrzne (widoczne tylko dla admina)…"
              style={{ width: "100%", padding: "10px 12px", border: `1.5px solid ${C.grey}`, borderRadius: 6, fontSize: 12, color: C.black, background: C.white, boxSizing: "border-box", resize: "vertical", fontFamily: "inherit", lineHeight: 1.55, outline: "none" }}
            />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setEditingNotes(false)}
                style={{ padding: "7px 14px", fontSize: 12, fontWeight: 700, border: `1px solid ${C.grey}`, borderRadius: 6, background: C.white, color: C.greyDk, cursor: "pointer" }}>
                Anuluj
              </button>
              <button onClick={saveNotes} disabled={saving}
                style={{ padding: "7px 14px", fontSize: 12, fontWeight: 700, border: "none", borderRadius: 6, background: C.green, color: C.white, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1 }}>
                {saving ? "Zapisuję…" : "Zapisz"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Akcje ───────────────────────────────────────────────────────── */}
      <div style={{ padding: "10px 16px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", borderTop: `1px solid ${C.grey}`, background: C.white }}>

        {/* ✉ Mail potwierdzający — z szablonem mailconfirmation.js */}
        {confirmMailto && (
          <a href={confirmMailto}
            title={`Wyślij potwierdzenie do ${item.contact_email}`}
            style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "7px 12px", fontSize: 11, fontWeight: 700,
              border: "1.5px solid #2980B9", borderRadius: 6,
              background: "none", color: "#2980B9", textDecoration: "none",
            }}>
            ✉ Potwierdź e-mailem
          </a>
        )}

        {/* 📄 PDF */}
        <button
          onClick={() => generateRegistrationPDF(item)}
          title="Generuj PDF zgłoszenia"
          style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            padding: "7px 12px", fontSize: 11, fontWeight: 700,
            border: `1.5px solid ${C.greyMid}`, borderRadius: 6,
            background: "none", color: C.greyDk, cursor: "pointer",
          }}>
          📄 PDF
        </button>

        {/* Obsłużone */}
        <button onClick={toggleHandled} disabled={toggling}
          style={{
            padding: "7px 14px", fontSize: 11, fontWeight: 700,
            border: `1.5px solid ${isHandled ? C.green : C.grey}`,
            borderRadius: 6, background: isHandled ? C.green : C.white,
            color: isHandled ? C.white : C.greyMid,
            cursor: toggling ? "not-allowed" : "pointer", opacity: toggling ? 0.5 : 1, transition: "all .15s",
          }}>
          {toggling ? "…" : isHandled ? "✓ Obsłużone" : "Oznacz jako obsłużone"}
        </button>

        <div style={{ flex: 1 }} />

        {/* Usuń */}
        <button onClick={handleDelete} disabled={deleting}
          style={{ padding: "5px 10px", fontSize: 10, fontWeight: 700, border: `1px solid ${C.red}`, borderRadius: 5, background: "none", color: C.red, cursor: deleting ? "not-allowed" : "pointer", opacity: deleting ? 0.5 : 1 }}>
          {deleting ? "…" : "🗑 Usuń"}
        </button>
      </div>
    </div>
  );
}

/* ─── Main panel ────────────────────────────────────────────────────────── */
export function AdminRegistrations({ token, refreshKey, onRegistrationsChange }) {
  const [registrations, setRegistrations] = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState("");
  const [filter,        setFilter]        = useState("all");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const data = await db.get(token, TABLE, "select=*&order=created_at.desc");
      setRegistrations(Array.isArray(data) ? data : []);
    } catch (e) {
      setError("Błąd ładowania: " + e.message);
      setRegistrations([]);
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load, refreshKey]);

  function handleUpdate(id, patch) {
    setRegistrations(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
    if (onRegistrationsChange) onRegistrationsChange();
  }
  function handleDelete(id) {
    setRegistrations(prev => prev.filter(r => r.id !== id));
    if (onRegistrationsChange) onRegistrationsChange();
  }

  const filtered = registrations.filter(r => {
    if (filter === "pending" && r.is_handled)  return false;
    if (filter === "handled" && !r.is_handled) return false;
    return true;
  });

  const totalCount   = registrations.length;
  const pendingCount = registrations.filter(r => !r.is_handled).length;
  const handledCount = registrations.filter(r =>  r.is_handled).length;

  return (
    <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch", background: C.greyBg, display: "flex", flexDirection: "column" }}>

      {/* Nagłówek */}
      <div style={{ background: C.white, borderBottom: `1px solid ${C.grey}`, padding: "14px 16px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, color: C.greyMid, textTransform: "uppercase", marginBottom: 3 }}>
            Rejestracje ze strony /rejestracja
          </div>
          <div style={{ fontSize: 12, color: C.greyDk }}>
            {totalCount === 0 ? "Brak zgłoszeń" : `${totalCount} łącznie`}
            {pendingCount > 0 && <span style={{ marginLeft: 8, color: C.amber, fontWeight: 700 }}>· {pendingCount} oczekujących</span>}
            {handledCount > 0 && <span style={{ marginLeft: 8, color: C.greenDk, fontWeight: 700 }}>· {handledCount} obsłużonych</span>}
          </div>
        </div>

        <div style={{ display: "flex", gap: 4 }}>
          {[["all", "Wszystkie"], ["pending", "Oczekujące"], ["handled", "Obsłużone"]].map(([val, label]) => (
            <button key={val} onClick={() => setFilter(val)}
              style={{ padding: "7px 12px", fontSize: 11, fontWeight: 700, border: `1px solid ${filter === val ? C.green : C.grey}`, borderRadius: 6, background: filter === val ? C.green : C.white, color: filter === val ? C.white : C.greyDk, cursor: "pointer", transition: "all .15s" }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading && <div style={{ textAlign: "center", padding: 40, color: C.greyMid, fontSize: 13 }}>Ładowanie…</div>}
      {!loading && error && <div style={{ margin: 16, padding: "12px 16px", background: "#FDEDEC", border: `1px solid ${C.red}`, borderRadius: 6, fontSize: 13, color: C.red }}>{error}</div>}
      {!loading && !error && filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: 60, color: C.greyMid, fontSize: 13 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
          {registrations.length === 0 ? "Brak zgłoszeń z formularza rejestracyjnego." : "Brak wyników dla wybranych filtrów."}
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div style={{ padding: "12px 14px 32px", display: "flex", flexDirection: "column", gap: 14 }}>
          {filtered.map(item => (
            <RegCard key={item.id} item={item} token={token} onUpdate={handleUpdate} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
