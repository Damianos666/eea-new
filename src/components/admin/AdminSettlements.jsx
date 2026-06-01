// ─────────────────────────────────────────────────────────────────────────────
// ADMIN SETTLEMENTS — Zakładka T.adm_set_title
// Lista raportów serwisowych z filtrami + generowanie PDF na żądanie
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback, useRef } from "react";
import { C, TRAINERS } from "../../lib/constants";
import { useLang } from "../../lib/LangContext";
import { db } from "../../lib/supabase";
import { generateServiceReportPdf } from "../../lib/serviceReportPdfGenerator";
import { Spinner } from "../SharedUI";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(isoOrDate) {
  if (!isoOrDate) return "—";
  const d = new Date(isoOrDate);
  if (isNaN(d)) return isoOrDate;
  return `${String(d.getDate()).padStart(2,"0")}.${String(d.getMonth()+1).padStart(2,"0")}.${d.getFullYear()}`;
}

function fmtDatetime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return `${String(d.getDate()).padStart(2,"0")}.${String(d.getMonth()+1).padStart(2,"0")}.${d.getFullYear()} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

const TRAINER_OPTIONS = [
  { value: "", label: T.adm_set_all_trainers },
  ...Object.entries(TRAINERS).map(([id, name]) => ({ value: id, label: name })),
];

const STATUS_OPTIONS = [
  { value: "",         label: T.adm_set_all_status },
  { value: "signed",   label: T.adm_set_signed },
  { value: "archived", label: "Zarchiwizowany" },
];

const STATUS_LABEL = {
  signed:   { text: T.adm_set_signed,      bg: "#EBF5FB", color: C.blue },
  archived: { text: "Zarchiwizowany", bg: C.greyBg,  color: C.greyDk },
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const inp = (ex = {}) => ({
  padding: "7px 10px", border: `1.5px solid ${C.grey}`, borderRadius: 7,
  fontSize: 13, fontFamily: "inherit", color: C.black,
  background: C.white, outline: "none", ...ex,
});

const btn = (ex = {}) => ({
  padding: "7px 14px", border: "none", borderRadius: 7, fontSize: 12,
  fontWeight: 700, cursor: "pointer", fontFamily: "inherit", ...ex,
});

// ─── Główny komponent ─────────────────────────────────────────────────────────
export function AdminSettlements({ token }) {
  const { T } = useLang();
  const [reports,       setReports]       = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [err,           setErr]           = useState("");
  const [filterTrainer, setFilterTrainer] = useState("");
  const [filterStatus,  setFilterStatus]  = useState("");
  const [filterFrom,    setFilterFrom]    = useState("");
  const [filterTo,      setFilterTo]      = useState("");
  const [generating,    setGenerating]    = useState(null);   // id raportu który generuje PDF
  const [deleting,      setDeleting]      = useState(null);   // id raportu który jest kasowany
  const [confirmDel,    setConfirmDel]    = useState(null);   // id raportu do potwierdzenia usunięcia
  const [toast,         setToast]         = useState(null);   // { msg, ok }
  const abortRef = useRef(null);

  // ─── Pobieranie danych ───────────────────────────────────────────────────
  const fetchReports = useCallback(async () => {
    setLoading(true); setErr("");
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      // Buduj query params
      const params = ["status=eq.submitted", "order=report_date.desc,created_at.desc", "limit=200"];
      if (filterTrainer) params.push(`trainer_id=eq.${filterTrainer}`);
      if (filterStatus)  params.push(`status=eq.${filterStatus}`);
      if (filterFrom)    params.push(`report_date=gte.${filterFrom}`);
      if (filterTo)      params.push(`report_date=lte.${filterTo}`);

      const data = await db.get(token, "service_reports", params.join("&"), { signal: ctrl.signal });
      setReports(data);
    } catch (e) {
      if (e.name !== "AbortError") setErr(e.message || T.adm_set_err_load);
    } finally {
      setLoading(false);
    }
  }, [token, filterTrainer, filterStatus, filterFrom, filterTo]);

  useEffect(() => { fetchReports(); }, [fetchReports]);
  useEffect(() => () => { abortRef.current?.abort(); }, []);

  // ─── Generowanie PDF ─────────────────────────────────────────────────────
  async function handleDownloadPdf(report) {
    setGenerating(report.id);
    try {
      const d = report.report_data;
      await generateServiceReportPdf({
        clientName:     d.clientName     || report.client_name,
        clientAddress:  d.clientAddress  || "",
        clientCity:     d.clientCity     || "",
        signerName:     d.signerName     || "",
        signatureDate:  d.signatureDate  || fmtDate(report.report_date),
        technicianName: d.technicianName || report.trainer_name,
        rows:           d.rows           || [],
        workDescription:d.workDescription|| "",
        clientNotes:    d.clientNotes    || "",
        clientSig:      d.clientSig      || null,
        technicianSig:  d.technicianSig  || null,
      });
      showToast("PDF wygenerowany i pobrany ✓", true);
    } catch (e) {
      showToast("Błąd generowania PDF: " + (e.message || "nieznany"), false);
    } finally {
      setGenerating(null);
    }
  }

  // ─── Usuwanie ────────────────────────────────────────────────────────────
  async function handleDelete(id) {
    setDeleting(id); setConfirmDel(null);
    try {
      await db.remove(token, "service_reports", `id=eq.${id}`);
      setReports(prev => prev.filter(r => r.id !== id));
      showToast(T.adm_set_deleted, true);
    } catch (e) {
      showToast("Błąd usuwania: " + (e.message || "nieznany"), false);
    } finally {
      setDeleting(null);
    }
  }

  // ─── Toast ───────────────────────────────────────────────────────────────
  function showToast(msg, ok) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: "16px 20px", maxWidth: 1100, margin: "0 auto", fontFamily: "inherit" }}>

      {/* Nagłówek */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: C.black }}>
          Rozliczenia — Raporty serwisowe
        </h2>
        <p style={{ margin: "4px 0 0", fontSize: 12, color: C.greyMid }}>
          Raporty przechowywane przez 30 dni · PDF generowany na żądanie
        </p>
      </div>

      {/* Filtry */}
      <div style={{
        display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16,
        padding: "12px 14px", background: C.greyBg, borderRadius: 10,
      }}>
        <select
          value={filterTrainer}
          onChange={e => setFilterTrainer(e.target.value)}
          style={inp({ minWidth: 170 })}
        >
          {TRAINER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          style={inp({ minWidth: 150 })}
        >
          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12, color: C.greyDk, whiteSpace: "nowrap" }}>Od:</span>
          <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} style={inp()} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12, color: C.greyDk, whiteSpace: "nowrap" }}>Do:</span>
          <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} style={inp()} />
        </div>

        <button
          onClick={() => { setFilterTrainer(""); setFilterStatus(""); setFilterFrom(""); setFilterTo(""); }}
          style={btn({ background: C.white, color: C.greyDk, border: `1.5px solid ${C.grey}` })}
        >
          Wyczyść
        </button>

        <button
          onClick={fetchReports}
          style={btn({ background: C.green, color: C.white, marginLeft: "auto" })}
        >
          🔄 Odśwież
        </button>
      </div>

      {/* Licznik */}
      {!loading && !err && (
        <p style={{ fontSize: 12, color: C.greyMid, marginBottom: 10 }}>
          Znaleziono: <strong>{reports.length}</strong> {reports.length === 1 ? "raport" : reports.length < 5 ? "raporty" : "raportów"}
        </p>
      )}

      {/* Stany */}
      {loading && <div style={{ padding: 40, textAlign: "center" }}><Spinner /></div>}
      {err && (
        <div style={{ padding: 16, background: "#FDEDEC", borderRadius: 8, color: C.red, fontSize: 13 }}>
          ⚠️ {err}
        </div>
      )}

      {/* Tabela / lista */}
      {!loading && !err && reports.length === 0 && (
        <div style={{ padding: 40, textAlign: "center", color: C.greyMid, fontSize: 14 }}>
          Brak raportów spełniających kryteria.
        </div>
      )}

      {!loading && !err && reports.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: C.greyBg, borderBottom: `2px solid ${C.grey}` }}>
                {[T.adm_set_date, T.adm_set_client, "Technik", T.adm_set_added, T.adm_set_status, T.adm_set_actions].map(h => (
                  <th key={h} style={{
                    padding: "10px 12px", textAlign: "left", fontWeight: 700,
                    color: C.greyDk, fontSize: 11, letterSpacing: 0.5,
                    textTransform: "uppercase", whiteSpace: "nowrap",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reports.map((r, idx) => {
                const st = STATUS_LABEL[r.status] || STATUS_LABEL.signed;
                const isGen = generating === r.id;
                const isDel = deleting   === r.id;
                const isConfirm = confirmDel === r.id;
                return (
                  <tr key={r.id} style={{
                    borderBottom: `1px solid ${C.grey}`,
                    background: idx % 2 === 0 ? C.white : "#FAFAFA",
                    transition: "background 0.1s",
                  }}>
                    {/* Data */}
                    <td style={{ padding: "10px 12px", whiteSpace: "nowrap", fontWeight: 600 }}>
                      {fmtDate(r.report_date)}
                    </td>

                    {/* Klient */}
                    <td style={{ padding: "10px 12px", maxWidth: 220 }}>
                      <div style={{ fontWeight: 600, color: C.black }}>{r.client_name || "—"}</div>
                      {r.report_data?.clientCity && (
                        <div style={{ fontSize: 11, color: C.greyMid }}>{r.report_data.clientCity}</div>
                      )}
                    </td>

                    {/* Technik */}
                    <td style={{ padding: "10px 12px", whiteSpace: "nowrap", color: C.greyDk }}>
                      {r.trainer_name || "—"}
                    </td>

                    {/* Dodano */}
                    <td style={{ padding: "10px 12px", whiteSpace: "nowrap", color: C.greyMid, fontSize: 12 }}>
                      {fmtDatetime(r.created_at)}
                    </td>

                    {/* Status */}
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{
                        padding: "3px 9px", borderRadius: 20, fontSize: 11,
                        fontWeight: 700, background: st.bg, color: st.color,
                        whiteSpace: "nowrap",
                      }}>
                        {st.text}
                      </span>
                    </td>

                    {/* Akcje */}
                    <td style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        {/* Pobierz PDF */}
                        <button
                          onClick={() => handleDownloadPdf(r)}
                          disabled={isGen || isDel}
                          style={btn({
                            background: isGen ? C.greyBg : "#EBF5FB",
                            color:      isGen ? C.greyMid : C.blue,
                            border:     `1.5px solid ${isGen ? C.grey : C.blue}`,
                            opacity:    isDel ? 0.5 : 1,
                            minWidth:   90,
                          })}
                          title={T.adm_set_download}
                        >
                          {isGen ? "⏳ PDF…" : "📥 PDF"}
                        </button>

                        {/* Usuń */}
                        {isConfirm ? (
                          <>
                            <button
                              onClick={() => handleDelete(r.id)}
                              disabled={isDel}
                              style={btn({ background: C.red, color: C.white, fontSize: 11 })}
                            >
                              {isDel ? "⏳" : "Confirm"}
                            </button>
                            <button
                              onClick={() => setConfirmDel(null)}
                              style={btn({ background: C.greyBg, color: C.greyDk, fontSize: 11 })}
                            >
                              Anuluj
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => setConfirmDel(r.id)}
                            disabled={isGen || isDel}
                            style={btn({
                              background: "transparent", color: C.greyMid,
                              border: `1.5px solid ${C.grey}`,
                              opacity: (isGen || isDel) ? 0.4 : 1,
                            })}
                            title="Usuń raport"
                          >
                            🗑
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          background: toast.ok ? C.greenDk : C.red, color: C.white,
          padding: "10px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600,
          boxShadow: "0 4px 16px rgba(0,0,0,0.2)", zIndex: 9999,
          whiteSpace: "nowrap",
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
