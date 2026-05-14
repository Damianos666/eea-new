import { useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { C, TRAINERS } from "../lib/constants";
import { generateDelegationPdf } from "../lib/delegationPdfGenerator";
import { db, session } from "../lib/supabase";

// ─── Maska czasu 24h HH:MM (identyczna jak w ServiceReportForm) ───────────────
function TimeInput({ value, onChange, style }) {
  const [raw, setRaw] = useState(value || "");
  useEffect(() => { setRaw(value || ""); }, [value]);
  function handleChange(e) {
    let v = e.target.value.replace(/[^0-9:]/g, "");
    if (v.length === 2 && !v.includes(":") && raw.length < 2) v = v + ":";
    if (v.length > 5) v = v.slice(0, 5);
    setRaw(v);
    if (/^\d{2}:\d{2}$/.test(v)) {
      const [hh, mm] = v.split(":").map(Number);
      if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) onChange(v);
    }
    if (v === "") onChange("");
  }
  function handleBlur() {
    if (!/^\d{2}:\d{2}$/.test(raw)) { setRaw(""); onChange(""); }
  }
  return (
    <input type="text" inputMode="numeric" value={raw} onChange={handleChange}
      onBlur={handleBlur} placeholder="HH:MM" maxLength={5} style={style} />
  );
}

// ─── Stała czcionki (spójna z resztą apki) ───────────────────────────────────
const FONT = "'Helvetica Neue',Helvetica,Arial,sans-serif";

/* ─── Stałe przeliczeniowe (rozporządzenie MPiPS) ───────────────────── */
const S = {
  dietaFull:  45,
  dietaHalf:  22.5,
  ryczNocleg: 67.5,
  maxNocleg:  900,
  mealCuts:   [11.25, 22.5, 11.25], // śniadanie, obiad, kolacja
};

function fmt(n) {
  return n.toFixed(2).replace(".", ",") + " zł";
}

function calcDuration(depDate, depTime, retDate, retTime) {
  if (!depDate || !retDate) return { doby: 0, dieta: 0, label: "Uzupełnij daty", totalH: 0 };
  const dep = new Date(`${depDate}T${depTime || "00:00"}`);
  const ret = new Date(`${retDate}T${retTime || "00:00"}`);
  if (ret <= dep) return { doby: 0, dieta: 0, label: "Data powrotu musi być późniejsza", totalH: 0 };
  const totalH   = (ret - dep) / 3_600_000;
  const fullDoby = Math.floor(totalH / 24);
  const remH     = totalH - fullDoby * 24;
  let dieta = fullDoby * S.dietaFull;
  let label = fullDoby > 0 ? `${fullDoby} dob${fullDoby === 1 ? "a" : fullDoby < 5 ? "y" : ""}` : "";
  if (remH >= 12)      { dieta += S.dietaFull;  label += (label ? " + " : "") + `${Math.floor(remH)}h (pełna dieta)`; }
  else if (remH >= 8)  { dieta += S.dietaHalf;  label += (label ? " + " : "") + `${Math.floor(remH)}h (½ diety)`; }
  else if (remH > 0)   {                         label += (label ? " + " : "") + `${Math.floor(remH)}h (brak diety)`; }
  if (dieta === 0 && totalH < 8) label = "Podróż < 8h — brak diety";
  return { doby: fullDoby, dieta, label, totalH };
}

/* ─── Główny komponent ───────────────────────────────────────────────── */

// localStorage delegacji — TTL 2 dni, po tym czasie auto-kasowanie
const DELEG_TTL = 2 * 24 * 60 * 60 * 1000;
function delegKey(entryId, trainerId) { return `engel_deleg_${trainerId}_${entryId}`; }
function saveDelegData(entryId, trainerId, data) {
  try { localStorage.setItem(delegKey(entryId, trainerId), JSON.stringify({ savedAt: Date.now(), data })); } catch {}
}
function loadDelegData(entryId, trainerId) {
  try {
    const raw = localStorage.getItem(delegKey(entryId, trainerId));
    if (!raw) return null;
    const { savedAt, data } = JSON.parse(raw);
    if (Date.now() - savedAt > DELEG_TTL) { localStorage.removeItem(delegKey(entryId, trainerId)); return null; }
    return data;
  } catch { return null; }
}

export function DelegationForm({ entry, onClose }) {
  // Dane z terminarza
  const trainerName = TRAINERS[entry.trainer] || `Trener ${entry.trainer}`;
  const trainingTitle = entry.title || "Szkolenie";

  // ── Stan: raport serwisowy z Supabase ────────────────────────────────────────
  const [reportLoading, setReportLoading] = useState(true);
  const [reportStatus,  setReportStatus]  = useState(null); // null | "submitted" | "other" | "none"
  const [reportData,    setReportData]    = useState(null);

  // Pomocnik: wyciągnij datę/godzinę wyjazdu/powrotu z wierszy raportu
  function displayToIso(str) {
    if (!str) return "";
    const parts = str.split(".");
    if (parts.length !== 3) return "";
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }

  // ── Cache localStorage (TTL 2 dni) ─────────────────────────────────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const delegCache = (() => loadDelegData(entry?.id, entry.trainer))();

  // Sekcja: Podróż
  const [origin, setOrigin]           = useState(delegCache?.origin || "");
  const [destination, setDestination] = useState(delegCache?.destination || "");
  const [depDate, setDepDate]         = useState(delegCache?.depDate || entry.date || "");
  const [depTime, setDepTime]         = useState(delegCache?.depTime || "08:00");
  const [retDate, setRetDate]         = useState(delegCache?.retDate || entry.endDate || entry.date || "");
  const [retTime, setRetTime]         = useState(delegCache?.retTime || "18:00");

  // Sekcja: Transport
  const [transport, setTransport] = useState(delegCache?.transport || "car");
  const [km, setKm]               = useState(delegCache?.km || "");
  const [plate, setPlate] = useState(() => {
    try { return localStorage.getItem("engel_plate") || ""; } catch { return ""; }
  });
  const plateSaveTimer = useRef(null);

  // Zaciągnij nr rejestracyjny z Supabase (trainer_settings) przy otwarciu
  useEffect(() => {
    async function fetchPlate() {
      try {
        const tok = session.getToken();
        if (!tok || !navigator.onLine) return;
        const data = await db.get(tok, "trainer_settings",
          `trainer_id=eq.${entry.trainer}&select=plate`
        );
        if (Array.isArray(data) && data.length && data[0].plate) {
          setPlate(data[0].plate);
          try { localStorage.setItem("engel_plate", data[0].plate); } catch {}
        }
      } catch (e) {
        console.warn("[DelegationForm] fetchPlate:", e.message);
      }
    }
    fetchPlate();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Zapisz nr rejestracyjny do Supabase (debounce 1.5s)
  function handlePlateChange(val) {
    setPlate(val);
    try { localStorage.setItem("engel_plate", val); } catch {}
    if (plateSaveTimer.current) clearTimeout(plateSaveTimer.current);
    plateSaveTimer.current = setTimeout(async () => {
      try {
        const tok = session.getToken();
        if (!tok || !navigator.onLine) return;
        await db.upsert(tok, "trainer_settings",
          { trainer_id: String(entry.trainer), plate: val },
          "trainer_id"
        );
      } catch (e) {
        console.warn("[DelegationForm] savePlate:", e.message);
      }
    }, 1500);
  }
  const [ticketCost, setTicketCost]   = useState(delegCache?.ticketCost || "");
  const [ticketRoute, setTicketRoute] = useState(delegCache?.ticketRoute || "");
  const [otherCost, setOtherCost]     = useState(delegCache?.otherCost || "");
  const [otherDesc, setOtherDesc]     = useState(delegCache?.otherDesc || "");

  // Sekcja: Noclegi
  const [nights, setNights] = useState(delegCache?.nights || []);

  // ── Zaciągnij raport serwisowy z Supabase ──────────────────────────────────
  useEffect(() => {
    async function fetchReport() {
      setReportLoading(true);
      try {
        const tok = session.getToken();
        if (!tok || !navigator.onLine) { setReportStatus("none"); setReportLoading(false); return; }
        const entryId = entry?.id ? String(entry.id) : null;
        const params = entryId
          ? `entry_id=eq.${entryId}&trainer_id=eq.${entry.trainer}&order=created_at.desc&limit=1`
          : `trainer_id=eq.${entry.trainer}&report_date=eq.${entry.date}&order=created_at.desc&limit=1`;
        const data = await db.get(tok, "service_reports", params);
        if (!Array.isArray(data) || !data.length) { setReportStatus("none"); setReportLoading(false); return; }
        const rep = data[0];
        const d   = rep.report_data || {};
        setReportStatus(rep.status === "submitted" ? "submitted" : "other");
        setReportData(d);
        // Wypełnij pola danymi z raportu
        const rows    = d.rows || [];
        const first   = rows[0];
        const last    = rows[rows.length - 1] || first;
        const totalKm = rows.reduce((acc, r) => acc + (parseInt(r.km, 10) || 0) + (parseInt(r.retKm, 10) || 0), 0);
        // Trasa: skąd = depFrom pierwszego dnia (fallback: dom trenera / brak)
        //         dokąd = retTo ostatniego dnia → retFrom → clientCity (miasto klienta)
        const originVal      = first?.depFrom || "";
        // Cel podróży = miasto docelowe (dokąd jedzie trener), nie miejsce powrotu
        const destinationVal = first?.depTo || last?.retFrom || d.clientCity || "";
        if (originVal)      setOrigin(originVal);
        if (destinationVal) setDestination(destinationVal);
        if (first?.date)     setDepDate(displayToIso(first.date));
        if (first?.depTime)  setDepTime(first.depTime);
        if (last?.date)      setRetDate(displayToIso(last.date));
        if (last?.retArrTime) setRetTime(last.retArrTime);
        if (totalKm > 0)     setKm(String(totalKm));
      } catch (e) {
        console.warn("[DelegationForm] fetchReport:", e.message);
        setReportStatus("none");
      } finally { setReportLoading(false); }
    }
    fetchReport();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sekcja: Posiłki
  const [meals, setMeals] = useState(delegCache?.meals || [0, 0, 0]);

  // Sekcja: Inne koszty
  const [extraCosts, setExtraCosts] = useState(delegCache?.extraCosts || []);

  // Sekcja: Płatności
  const [payCard,            setPayCard]            = useState(delegCache?.payCard || "");
  const [cardManuallyEdited, setCardManuallyEdited] = useState(!!delegCache?.payCard);
  const [payCash,            setPayCash]            = useState(delegCache?.payCash || "");
  const [payAdvance,         setPayAdvance]         = useState(delegCache?.payAdvance || "");

  // Wysyłanie
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [saveErr, setSaveErr] = useState("");

  // ── Auto-save do localStorage (przy każdej zmianie) ────────────────────────
  useEffect(() => {
    saveDelegData(entry?.id, entry.trainer, {
      origin, destination, depDate, depTime, retDate, retTime,
      transport, km, ticketCost, ticketRoute, otherCost, otherDesc,
      nights, meals, extraCosts, payCard, payCash, payAdvance,
    });
  }, [origin, destination, depDate, depTime, retDate, retTime,
      transport, km, ticketCost, ticketRoute, otherCost, otherDesc,
      nights, meals, extraCosts, payCard, payCash, payAdvance]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Obliczenia ─────────────────────────────────────────────────────── */
  const dur       = calcDuration(depDate, depTime, retDate, retTime);
  const dietaBase = dur.dieta;

  const mealCut  = Math.min(
    meals.reduce((acc, cnt, i) => acc + cnt * S.mealCuts[i], 0),
    dietaBase,
  );

  const nightsTotal = nights.reduce((acc, n) =>
    acc + (n.type === "ryczalt" ? S.ryczNocleg : Math.min(n.amount || 0, S.maxNocleg)), 0);

  const transportCost =
    transport === "train" ? (parseFloat(ticketCost) || 0)
    : transport === "other" ? (parseFloat(otherCost) || 0)
    : 0;

  const extraTotal = extraCosts.reduce((s, x) => s + (parseFloat(x.amount) || 0), 0);
  const gross = (dietaBase - mealCut) + nightsTotal + transportCost + extraTotal;

  // Auto-wypełnienie karty firmowej: noclegi + transport + inne koszty
  // (zakładamy że te pozycje były płacone kartą firmową)
  const autoCardValue = nightsTotal + transportCost + extraTotal;
  const card  = parseFloat(payCard)    || 0;
  const cash  = parseFloat(payCash)    || 0;
  const adv   = parseFloat(payAdvance) || 0;
  const net   = gross + cash - card - adv;

  // Auto-karta: aktualizuj gdy nie edytowano ręcznie
  useEffect(() => {
    if (!cardManuallyEdited) {
      setPayCard(autoCardValue > 0 ? autoCardValue.toFixed(2) : "");
    }
  }, [autoCardValue, cardManuallyEdited]);
  /* eslint-enable react-hooks/exhaustive-deps */

  /* ── Noclegi helpers ────────────────────────────────────────────────── */
  const addNight    = () => setNights(n => [...n, { type: "receipt", amount: 0 }]);
  const removeNight = (i) => setNights(n => n.filter((_, idx) => idx !== i));
  const setNightType   = (i, type) => setNights(n => n.map((x, idx) => idx === i ? { ...x, type, amount: type === "ryczalt" ? 0 : x.amount } : x));
  const setNightAmount = (i, val) => setNights(n => n.map((x, idx) => idx === i ? { ...x, amount: parseFloat(val) || 0 } : x));

  const addExtra    = () => setExtraCosts(e => [...e, { desc: "", amount: "" }]);
  const removeExtra = (i) => setExtraCosts(e => e.filter((_, idx) => idx !== i));
  const setExtraDesc   = (i, v) => setExtraCosts(e => e.map((x, idx) => idx === i ? { ...x, desc: v } : x));
  const setExtraAmount = (i, v) => setExtraCosts(e => e.map((x, idx) => idx === i ? { ...x, amount: v } : x));

  const stepMeal = (idx, delta) =>
    setMeals(m => m.map((v, i) => i === idx ? Math.max(0, v + delta) : v));

  /* ── Generuj PDF ───────────────────────────────────────────────────────── */
  const handleGenerate = useCallback(async () => {
    setSaving(true); setSaveErr("");
    try {
      await generateDelegationPdf({
        trainerName,
        trainingTitle,
        date:    entry.date,
        endDate: entry.endDate,
        origin, destination,
        depDate, depTime, retDate, retTime,
        transport, km, plate, ticketCost, ticketRoute, otherCost, otherDesc,
        nights, meals, extraCosts, extraTotal,
        payCard:    parseFloat(payCard)    || 0,
        payCash:    parseFloat(payCash)    || 0,
        payAdvance: parseFloat(payAdvance) || 0,
        dur, dietaBase, mealCut, nightsTotal, transportCost, extraTotal, gross, net,
      });
      setSaved(true);
    } catch (e) {
      setSaveErr(e.message || "Błąd generowania PDF. Spróbuj ponownie.");
    } finally {
      setSaving(false);
    }
  }, [trainerName, trainingTitle, entry, origin, destination, depDate, depTime, retDate, retTime, transport, km, plate, ticketCost, ticketRoute, otherCost, otherDesc, nights, meals, extraCosts, extraTotal, payCard, payCash, payAdvance, dur, dietaBase, mealCut, nightsTotal, transportCost, gross, net]);

  /* ── Style inline (spójne z resztą apki) ──────────────────────────── */
  const inp  = { width:"100%", padding:"8px 10px", border:`1.5px solid ${C.grey}`, borderRadius:6, fontSize:13, color:C.black, background:C.white, fontFamily:FONT, outline:"none", WebkitAppearance:"none", appearance:"none" };
  const inpRo = { ...inp, background:C.greyBg, color:C.greyDk };
  const lbl  = { fontSize:10, fontWeight:700, color:C.greyMid, letterSpacing:".4px", textTransform:"uppercase", marginBottom:4, display:"block" };
  const secHdr = { padding:"9px 14px", display:"flex", alignItems:"center", gap:7, background:C.white, borderBottom:`1px solid ${C.grey}`, fontSize:10, fontWeight:800, color:C.greyMid, letterSpacing:1, textTransform:"uppercase" };
  const secBody = { padding:"12px 14px", display:"flex", flexDirection:"column", gap:10 };
  const row2   = { display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 };
  const card_  = { background:C.white, borderRadius:8, boxShadow:"0 1px 3px rgba(0,0,0,.07)", margin:"10px 12px 0", overflow:"hidden" };

  if (saved) {
    return createPortal(
      <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.55)", zIndex:1200, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
        <div style={{ background:C.white, borderRadius:12, padding:28, width:"100%", maxWidth:360, textAlign:"center" }}>
          <div style={{ fontSize:48, marginBottom:12 }}>✅</div>
          <div style={{ fontSize:16, fontWeight:800, color:C.black, marginBottom:8 }}>Zapisano rozliczenie!</div>
          <div style={{ fontSize:12, color:C.greyMid, marginBottom:20 }}>Rozliczenie zostało przesłane do systemu.</div>
          <button onClick={onClose} style={{ width:"100%", padding:12, background:C.black, color:C.white, border:"none", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer" }}>Zamknij</button>
        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.55)", zIndex:1200, display:"flex", flexDirection:"column", fontFamily:FONT }}>
      <div style={{ flex:1, overflowY:"auto", WebkitOverflowScrolling:"touch" }}>
      <div style={{ display:"flex", flexDirection:"column", maxWidth:520, margin:"0 auto", minHeight:"100%", background:C.greyBg }}>

        {/* ── Nagłówek ── */}
        <div style={{ background:C.black, padding:"14px 16px", display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:10 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <button onClick={onClose} style={{ background:"none", border:"none", color:"#fff", fontSize:20, cursor:"pointer", padding:"0 6px 0 0" }}>←</button>
            <div>
              <div style={{ color:"#fff", fontSize:15, fontWeight:700 }}>Rozliczenie delegacji</div>
              <div style={{ color:C.greyMid, fontSize:11, marginTop:1 }}>Szkolenie wyjazdowe</div>
            </div>
          </div>
          <div style={{ background:"rgba(255,255,255,.1)", borderRadius:4, padding:"4px 8px", fontSize:9, color:"rgba(255,255,255,.4)", fontWeight:800, letterSpacing:1.5 }}>ENGEL</div>
        </div>

        {/* ── Baner ── */}
        <div style={{ background:"#EBF5FB", borderBottom:`2px solid ${C.blue}`, padding:"9px 16px", display:"flex", alignItems:"center", gap:8 }}>
          <span style={{ background:C.blue, color:"#fff", fontSize:10, fontWeight:800, padding:"3px 9px", borderRadius:20 }}>✈️ Wyjazdowe</span>
          <span style={{ fontSize:12, color:C.blue, fontWeight:600 }}>Podróż służbowa krajowa</span>
        </div>

        {/* ── Baner: status raportu serwisowego ── */}
        {reportLoading && (
          <div style={{ background:"#EBF5FB", borderBottom:"1px solid #AED6F1", padding:"8px 16px", fontSize:11, color:"#1A5276", display:"flex", alignItems:"center", gap:8 }}>
            <span>🔄</span><span>Sprawdzam raport serwisowy…</span>
          </div>
        )}
        {!reportLoading && reportStatus === "submitted" && reportData && (
          <div style={{ background:"#F0F7E0", borderBottom:"2px solid #8AB73E", padding:"8px 16px", display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:14 }}>📋</span>
            <div>
              <div style={{ fontSize:11, fontWeight:800, color:"#6E9430" }}>Dane zaciągnięte z raportu serwisowego</div>
              <div style={{ fontSize:10, color:"#6E9430", opacity:0.8 }}>
                {(() => {
                  const rows = reportData.rows || [];
                  const from = rows[0]?.depFrom || "";
                  const to   = rows[rows.length - 1]?.retTo || rows[rows.length - 1]?.depTo || "";
                  const route = from && to && from !== to
                    ? `${from} → ${to}`
                    : (from || to || reportData.clientCity || reportData.clientName || "");
                  const days = rows.length;
                  return `${route} · ${days} ${days === 1 ? "dzień" : "dni"}`;
                })()}
              </div>
            </div>
          </div>
        )}
        {!reportLoading && reportStatus === "other" && (
          <div style={{ background:"#FEF9E7", borderBottom:"2px solid #F9CA24", padding:"8px 16px", display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:14 }}>⚠️</span>
            <div>
              <div style={{ fontSize:11, fontWeight:800, color:"#856404" }}>Raport serwisowy nie jest jeszcze finalny</div>
              <div style={{ fontSize:10, color:"#856404", opacity:0.8 }}>Dane zostały wstępnie zaciągnięte. Upewnij się że raport jest podpisany i zapisany.</div>
            </div>
          </div>
        )}
        {!reportLoading && reportStatus === "none" && (
          <div style={{ background:"#FDEDEC", borderBottom:"2px solid #E74C3C", padding:"8px 16px", display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:14 }}>ℹ️</span>
            <div>
              <div style={{ fontSize:11, fontWeight:800, color:"#922B21" }}>Brak raportu serwisowego w systemie</div>
              <div style={{ fontSize:10, color:"#922B21", opacity:0.8 }}>Możesz wypełnić delegację ręcznie lub wrócić po zapisaniu raportu.</div>
            </div>
          </div>
        )}

        {/* ── Dane z terminarza ── */}
        <div style={card_}>
          <div style={{ ...secHdr, background:C.darkHdr }}>
            <span style={{ fontSize:14 }}>📋</span>
            <span style={{ fontSize:10, fontWeight:700, color:"rgba(255,255,255,.5)", letterSpacing:1, textTransform:"uppercase" }}>Dane z terminarza</span>
          </div>
          <div style={secBody}>
            {[
              ["Trener", trainerName],
              ["Szkolenie", trainingTitle],
            ].map(([k, v]) => (
              <div key={k} style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline" }}>
                <span style={{ fontSize:10, fontWeight:700, color:C.greyMid, textTransform:"uppercase", letterSpacing:".4px" }}>{k}</span>
                <span style={{ fontSize:12, fontWeight:700, color:C.black }}>{v}</span>
              </div>
            ))}
            <hr style={{ border:"none", borderTop:`1px solid ${C.grey}`, margin:"2px 0" }} />
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline" }}>
              <span style={{ fontSize:10, fontWeight:700, color:C.greyMid, textTransform:"uppercase", letterSpacing:".4px" }}>Termin</span>
              <span style={{ fontSize:12, fontWeight:700, color:C.blue }}>
                {entry.date}{entry.endDate && entry.endDate !== entry.date ? ` → ${entry.endDate}` : ""}
              </span>
            </div>
          </div>
        </div>

        {/* ── Szczegóły podróży ── */}
        <div style={card_}>
          <div style={secHdr}>🚗 Szczegóły podróży</div>
          <div style={secBody}>
            <div style={row2}>
              <div>
                <label style={lbl}>Miejscowość wyjazdu</label>
                <input style={inp} type="text" placeholder="np. Kraków" value={origin} onChange={e => setOrigin(e.target.value)} />
              </div>
              <div>
                <label style={lbl}>Miejscowość docelowa</label>
                <input style={inp} type="text" placeholder="np. Bydgoszcz" value={destination} onChange={e => setDestination(e.target.value)} />
              </div>
            </div>
            <div style={row2}>
              <div>
                <label style={lbl}>Data wyjazdu</label>
                <input style={inp} type="date" value={depDate} onChange={e => setDepDate(e.target.value)} />
              </div>
              <div>
                <label style={lbl}>Godz. wyjazdu</label>
                <TimeInput value={depTime} onChange={setDepTime} style={inp} />
              </div>
            </div>
            <div style={row2}>
              <div>
                <label style={lbl}>Data powrotu</label>
                <input style={inp} type="date" value={retDate} onChange={e => setRetDate(e.target.value)} />
              </div>
              <div>
                <label style={lbl}>Godz. powrotu</label>
                <TimeInput value={retTime} onChange={setRetTime} style={inp} />
              </div>
            </div>
            <div>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:4 }}>
                <label style={{ ...lbl, marginBottom:0 }}>Czas trwania & dieta</label>
                <span style={{ fontSize:9, fontWeight:700, background:"#F0F7E0", color:C.greenDk, borderRadius:3, padding:"1px 5px" }}>AUTO</span>
              </div>
              <input style={inpRo} type="text" readOnly value={
                dur.totalH > 0
                  ? `${dur.label} → dieta bazowa: ${fmt(dietaBase)}`
                  : (dur.label || "Uzupełnij daty i godziny")
              } />
              <div style={{ fontSize:10, color:C.greyMid, lineHeight:1.4, marginTop:4 }}>
                Obliczane automatycznie · 45 zł/dobę, 22,50 zł za niepełną (8–24h)
              </div>
            </div>
          </div>
        </div>

        {/* ── Transport ── */}
        <div style={card_}>
          <div style={secHdr}>🚌 Transport</div>
          <div style={secBody}>
            <div>
              <label style={lbl}>Środek transportu</label>
              <div style={{ display:"flex", border:`1.5px solid ${C.grey}`, borderRadius:6, overflow:"hidden" }}>
                {[["car","🚗 Służbowy"],["train","🚆 Pociąg/Bus"],["other","✈️ Inne"]].map(([mode, label_]) => (
                  <button key={mode} onClick={() => setTransport(mode)} style={{ flex:1, padding:"8px 4px", fontSize:11, fontWeight:700, border:"none", borderRight:`1.5px solid ${C.grey}`, background: transport === mode ? C.blue : C.white, color: transport === mode ? "#fff" : C.greyDk, cursor:"pointer", fontFamily:FONT, transition:"background .12s" }}>
                    {label_}
                  </button>
                ))}
              </div>
            </div>

            {transport === "car" && (
              <>
                <div style={row2}>
                  <div>
                    <label style={lbl}>Kilometry (tam+powrót)</label>
                    <input style={inp} type="number" placeholder="np. 420" value={km} onChange={e => setKm(e.target.value)} />
                  </div>
                  <div>
                    <label style={lbl}>Rejestracja pojazdu</label>
                    <input style={inp} type="text" placeholder="KR 12345" value={plate} onChange={e => handlePlateChange(e.target.value)} />
                  </div>
                </div>
                <div style={{ display:"inline-flex", alignItems:"center", gap:5, background:"#EBF5FB", border:"1px solid rgba(41,128,185,.2)", borderRadius:20, padding:"5px 10px", fontSize:10, fontWeight:700, color:C.blue }}>
                  ℹ️ Pojazd służbowy — kilometrówka nie przysługuje. Km do ewidencji.
                </div>
              </>
            )}

            {transport === "train" && (
              <div style={row2}>
                <div>
                  <label style={lbl}>Koszt biletów (zł)</label>
                  <input style={inp} type="number" placeholder="0,00" value={ticketCost} onChange={e => setTicketCost(e.target.value)} />
                </div>
                <div>
                  <label style={lbl}>Trasa</label>
                  <input style={inp} type="text" placeholder="np. KRK–GDA" value={ticketRoute} onChange={e => setTicketRoute(e.target.value)} />
                </div>
              </div>
            )}

            {transport === "other" && (
              <div style={row2}>
                <div>
                  <label style={lbl}>Koszt przejazdu (zł)</label>
                  <input style={inp} type="number" placeholder="0,00" value={otherCost} onChange={e => setOtherCost(e.target.value)} />
                </div>
                <div>
                  <label style={lbl}>Opis</label>
                  <input style={inp} type="text" placeholder="taksówka, samolot…" value={otherDesc} onChange={e => setOtherDesc(e.target.value)} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Noclegi ── */}
        <div style={card_}>
          <div style={secHdr}>🏨 Noclegi</div>
          <div style={secBody}>
            {nights.length === 0 && (
              <div style={{ fontSize:11, color:C.greyMid }}>Dodaj noclegi jeśli były poniesione koszty</div>
            )}
            {nights.map((n, i) => (
              <div key={i} style={{ border:`1.5px solid ${C.grey}`, borderRadius:6, overflow:"hidden" }}>
                <div style={{ background:C.greyBg, padding:"7px 10px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <span style={{ fontSize:11, fontWeight:800, color:C.black }}>🌙 Nocleg {i + 1}</span>
                  <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <div style={{ display:"flex", gap:4 }}>
                      {["receipt","ryczalt"].map(t => (
                        <button key={t} onClick={() => setNightType(i, t)} style={{ padding:"3px 9px", fontSize:10, fontWeight:700, border:`1.5px solid ${n.type === t ? C.green : C.grey}`, borderRadius:4, background: n.type === t ? "#F0F7E0" : C.white, color: n.type === t ? C.greenDk : C.greyDk, cursor:"pointer", fontFamily:FONT }}>
                          {t === "receipt" ? "Rachunek" : "Ryczałt"}
                        </button>
                      ))}
                    </div>
                    <button onClick={() => removeNight(i)} style={{ background:"none", border:"none", fontSize:16, color:C.greyMid, cursor:"pointer", padding:"0 2px" }}>×</button>
                  </div>
                </div>
                <div style={{ padding:"8px 10px", display:"flex", alignItems:"center", gap:8 }}>
                  <input type="number" placeholder={n.type === "receipt" ? "kwota z rachunku (zł)" : "—"} value={n.amount > 0 ? n.amount : ""} disabled={n.type === "ryczalt"} onChange={e => setNightAmount(i, e.target.value)}
                    style={{ flex:1, padding:"7px 10px", border:`1.5px solid ${C.grey}`, borderRadius:6, fontSize:13, fontFamily:FONT, outline:"none", background: n.type === "ryczalt" ? C.greyBg : C.white }} />
                  <div style={{ fontSize:12, fontWeight:800, color: n.type === "ryczalt" ? C.greenDk : C.greyDk, background: n.type === "ryczalt" ? "#F0F7E0" : C.greyBg, padding:"6px 10px", borderRadius:5, whiteSpace:"nowrap" }}>
                    {n.type === "ryczalt" ? fmt(S.ryczNocleg) : (n.amount > 0 ? fmt(Math.min(n.amount, S.maxNocleg)) : "— zł")}
                  </div>
                </div>
              </div>
            ))}
            <button onClick={addNight} style={{ width:"100%", padding:9, background:"none", border:`1.5px dashed ${C.grey}`, borderRadius:6, color:C.greyMid, fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:FONT }}>
              + Dodaj nocleg
            </button>
          </div>
        </div>

        {/* ── Posiłki ── */}
        <div style={card_}>
          <div style={secHdr}>
            🍽️ Zapewnione posiłki
            <span style={{ fontSize:9, fontWeight:400, color:C.greyMid, marginLeft:4 }}>(pomniejszają dietę)</span>
          </div>
          <div style={secBody}>
            {[["🍳 Śniadania", 0, 11.25], ["🥗 Obiady", 1, 22.50], ["🍲 Kolacje", 2, 11.25]].map(([name, idx, cut]) => (
              <div key={idx} style={{ display:"grid", gridTemplateColumns:"1fr auto", alignItems:"center", gap:12, padding:"8px 10px", border:`1.5px solid ${meals[idx] > 0 ? C.amber : C.grey}`, borderRadius:6, background: meals[idx] > 0 ? "#FEF9F0" : C.white }}>
                <div>
                  <div style={{ fontSize:12, fontWeight:700, color:C.black }}>{name}</div>
                  <div style={{ fontSize:10, color:C.amber, fontWeight:600, marginTop:1 }}>−{cut.toFixed(2).replace(".", ",")} zł / szt.</div>
                  <div style={{ fontSize:10, color:C.greyMid, marginTop:1 }}>odliczenie: {fmt(meals[idx] * cut)}</div>
                </div>
                <div style={{ display:"flex", alignItems:"center", border:`1.5px solid ${C.grey}`, borderRadius:6, overflow:"hidden" }}>
                  <button onClick={() => stepMeal(idx, -1)} style={{ width:40, height:40, background:C.greyBg, border:"none", fontSize:18, fontWeight:700, color:C.greyDk, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:FONT }}>−</button>
                  <div style={{ flex:1, textAlign:"center", fontSize:16, fontWeight:800, color:C.black, borderLeft:`1.5px solid ${C.grey}`, borderRight:`1.5px solid ${C.grey}`, padding:"8px 12px", lineHeight:1 }}>
                    {meals[idx]}
                    <span style={{ display:"block", fontSize:9, fontWeight:600, color:C.greyMid, marginTop:2, letterSpacing:".3px" }}>szt.</span>
                  </div>
                  <button onClick={() => stepMeal(idx, 1)} style={{ width:40, height:40, background:C.greyBg, border:"none", fontSize:18, fontWeight:700, color:C.greyDk, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:FONT }}>+</button>
                </div>
              </div>
            ))}
            <div style={{ fontSize:10, color:C.greyMid, lineHeight:1.4 }}>Maks. odliczenie nie może przekroczyć kwoty diety za dobę.</div>
          </div>
        </div>

        {/* ── Inne koszty ── */}
        <div style={card_}>
          <div style={secHdr}>📎 Inne koszty</div>
          <div style={secBody}>
            {extraCosts.length === 0 && (
              <div style={{ fontSize:11, color:C.greyMid }}>Dodaj dodatkowe koszty (parking, opłaty, materiały…)</div>
            )}
            {extraCosts.map((x, i) => (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:8 }}>
                <input style={{ ...inp, flex:1 }} type="text" placeholder="Opis kosztu" value={x.desc} onChange={e => setExtraDesc(i, e.target.value)} />
                <input style={{ ...inp, width:100, textAlign:"right" }} type="number" placeholder="0,00" value={x.amount} onChange={e => setExtraAmount(i, e.target.value)} />
                <button onClick={() => removeExtra(i)} style={{ background:"none", border:"none", fontSize:18, color:C.greyMid, cursor:"pointer", padding:"0 2px", flexShrink:0 }}>×</button>
              </div>
            ))}
            <button onClick={addExtra} style={{ width:"100%", padding:9, background:"none", border:`1.5px dashed ${C.grey}`, borderRadius:6, color:C.greyMid, fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:FONT }}>
              + Dodaj koszt
            </button>
            {extraTotal > 0 && (
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, fontWeight:700, color:C.black, paddingTop:6, borderTop:`1px solid ${C.grey}` }}>
                <span>Razem inne koszty</span>
                <span>{fmt(extraTotal)}</span>
              </div>
            )}
          </div>
        </div>

                {/* ── Rozliczenie płatności ── */}
        <div style={card_}>
          <div style={secHdr}>💳 Rozliczenie płatności</div>
          <div style={secBody}>
            {[
              { icon:"💳", bg:"#EBF5FB", color:C.blue, label:"Karta firmowa", sub:"zapłacono bezpośrednio", val:payCard, set:setPayCard, id:"card", auto:!cardManuallyEdited && autoCardValue > 0 },
              { icon:"💵", bg:"#FEF9F0", color:C.amber, label:"Gotówka (trener)", sub:"dodatkowe wydatki z własnej kieszeni (poza listą kosztów)", val:payCash, set:setPayCash, id:"cash" },
              { icon:"💸", bg:"#F0F7E0", color:C.greenDk, label:"Zaliczka pobrana", sub:"przed wyjazdem", val:payAdvance, set:setPayAdvance, id:"adv" },
            ].map(row => (
              <div key={row.id} style={{ display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ width:34, height:34, borderRadius:8, background:row.bg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, flexShrink:0 }}>{row.icon}</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:C.black, display:"flex", alignItems:"center", gap:5 }}>
                    {row.label}
                    {row.auto && <span style={{ fontSize:9, fontWeight:700, background:"#F0F7E0", color:C.greenDk, borderRadius:3, padding:"1px 5px" }}>AUTO</span>}
                  </div>
                  <div style={{ fontSize:10, color:C.greyMid, marginTop:1 }}>{row.sub}</div>
                </div>
                <input
                  type="number" placeholder="0,00" value={row.val}
                  onChange={e => {
                    if (row.id === "card") { setCardManuallyEdited(true); }
                    row.set(e.target.value);
                  }}
                  onBlur={e => {
                    // Jeśli trener skasował pole — wróć do AUTO
                    if (row.id === "card" && e.target.value === "") setCardManuallyEdited(false);
                  }}
                  style={{ width:100, padding:"8px 10px", border:`1.5px solid ${row.auto ? C.green : C.grey}`, borderRadius:6, fontSize:13, color:C.black, fontFamily:FONT, outline:"none", textAlign:"right" }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* ── Podsumowanie ── */}
        <div style={{ ...card_, border:`2px solid #F0F7E0`, marginBottom:0 }}>
          <div style={{ background:C.darkHdr, padding:"10px 14px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <span style={{ fontSize:11, fontWeight:800, color:"rgba(255,255,255,.6)", letterSpacing:1, textTransform:"uppercase" }}>📊 Podsumowanie</span>
            <span style={{ fontSize:20, fontWeight:800, color:C.green }}>{fmt(gross)}</span>
          </div>
          <div style={{ padding:"10px 14px" }}>
            {[
              { k: dur.label ? `Dieta (${dur.label})` : `Dieta (${dur.doby} dób)`, v:`+ ${fmt(dietaBase)}`, red:false },
              { k:"Pomniejszenia za posiłki", v: mealCut > 0 ? `− ${fmt(mealCut)}` : "0,00 zł", red: mealCut > 0 },
              { k:"Noclegi", v: nightsTotal > 0 ? `+ ${fmt(nightsTotal)}` : "0,00 zł", red:false },
              { k:"Transport", v: transportCost > 0 ? `+ ${fmt(transportCost)}` : "0,00 zł", red:false },
              { k:"Inne koszty", v: extraTotal > 0 ? `+ ${fmt(extraTotal)}` : "0,00 zł", red:false },
            ].map(row => (
              <div key={row.k} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 0", borderBottom:`1px solid ${C.grey}`, fontSize:12 }}>
                <span style={{ color:C.greyDk }}>{row.k}</span>
                <span style={{ fontWeight:700, color: row.red ? C.red : C.black }}>{row.v}</span>
              </div>
            ))}
            {/* Suma należności */}
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0 6px", borderTop:`1.5px solid ${C.grey}`, marginTop:2 }}>
              <span style={{ fontSize:13, fontWeight:700, color:C.black }}>Suma należności</span>
              <span style={{ fontSize:14, fontWeight:700, color:C.black }}>{fmt(gross)}</span>
            </div>
            {[
              { k:"💳 Karta firmowa", v: card > 0 ? `− ${fmt(card)}` : "− 0,00 zł", col:C.blue, red:true },
              { k:"💵 Gotówka trenera", v: cash > 0 ? `+ ${fmt(cash)}` : "+ 0,00 zł", col:C.amber, red:false },
              { k:"💸 Zaliczka", v: adv > 0 ? `− ${fmt(adv)}` : "− 0,00 zł", col:C.greenDk, red:true },
            ].map(row => (
              <div key={row.k} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 0", borderBottom:`1px solid ${C.grey}`, fontSize:12 }}>
                <span style={{ color:row.col }}>{row.k}</span>
                <span style={{ fontWeight:700, color: row.red ? C.red : C.greenDk }}>{row.v}</span>
              </div>
            ))}
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0 0", borderTop:`2px solid ${C.grey}`, marginTop:4 }}>
              <span style={{ fontSize:13, fontWeight:800, color:C.black }}>DO WYPŁATY / ZWROTU</span>
              <span style={{ fontSize:16, fontWeight:800, color: net < 0 ? C.red : C.greenDk }}>{fmt(net)}</span>
            </div>
            {transport === "car" && km && (
              <div style={{ fontSize:10, color:C.greyMid, lineHeight:1.5, paddingTop:8, marginTop:4, borderTop:`1px solid ${C.grey}` }}>
                📍 Przebieg pojazdu: <strong>{km}</strong> km — ewidencja pojazdu
              </div>
            )}
            <div style={{ fontSize:10, background:"#FFFBEA", border:`1px solid #F9CA24`, borderRadius:6, padding:"8px 10px", marginTop:8, lineHeight:1.6, color:"#7D6200" }}>
            </div>
          </div>
        </div>

        {/* ── Akcje ── */}
        {saveErr && (
          <div style={{ margin:"8px 12px 0", padding:"10px 14px", background:"#FDEDEC", borderRadius:8, fontSize:12, color:C.red, fontWeight:600 }}>
            ⚠️ {saveErr}
          </div>
        )}
        <div style={{ padding:"10px 12px 32px", display:"flex", flexDirection:"column", gap:8 }}>
          <button onClick={handleGenerate} disabled={saving} style={{ width:"100%", padding:14, background: saving ? C.greyMid : C.black, color:"#fff", border:"none", borderRadius:8, fontSize:14, fontWeight:800, cursor: saving ? "default" : "pointer", fontFamily:FONT, display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
            {saving ? "⏳ Zapisuję…" : "📄 Generuj PDF rozliczenia"}
          </button>
          <button onClick={onClose} style={{ width:"100%", padding:10, background:C.white, color:C.greyDk, border:`1.5px solid ${C.grey}`, borderRadius:8, fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:FONT }}>
            Anuluj
          </button>
        </div>

      </div>
      </div>
    </div>,
    document.body
  );
}
