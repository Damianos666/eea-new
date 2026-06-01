import { useState, useEffect, useMemo, useRef } from "react";
import { C, GROUPS, TRAINERS, trainerInitials } from "../../lib/constants";
import { useLang } from "../../lib/LangContext";
import { TRAININGS } from "../../data/trainings";
import { db } from "../../lib/supabase";
import { Spinner, Toggle } from "../SharedUI";
import { useToast } from "../../lib/ToastContext";
import { fetchHolidaysForYear } from "../../lib/holidays";
import {
  TIMELINE_TRAINERS,
  TIMELINE_VISIBLE_DAYS,
  TIMELINE_LABEL_COL_WIDTH,
  TIMELINE_CELL_W_FALLBACK,
  TIMELINE_HEADER_ROW_H,
  TIMELINE_TRAINER_ROW_H,
  TIMELINE_DAY_HEADER_H,
  TIMELINE_MONTHS_BACK,
  TIMELINE_MONTHS_AHEAD,
  BAR_FONT_SIZE,
  BAR_ICON_FONT_SIZE,
  BAR_BADGE_SIZE,
  BAR_BADGE_FONT_SIZE,
} from "../../config/configApp";

/* ── Stałe i helpery terminarza ── */
const MONTHS_PL = ["Styczeń","Luty","Marzec","Kwiecień","Maj","Czerwiec",
                   "Lipiec","Sierpień","Wrzesień","Październik","Listopad","Grudzień"];

const _EPOCH = new Date("2020-01-01T12:00:00");
function _pad(n) { return String(n).padStart(2,"0"); }
function _absDay(iso) { return Math.round((new Date(iso+"T12:00:00") - _EPOCH) / 86400000); }
function _daysInMon(y, m) { return new Date(y, m+1, 0).getDate(); }
function _shiftMonth({ year, month }, delta) {
  let m = month + delta, y = year;
  while (m > 11) { m -= 12; y++; }
  while (m < 0)  { m += 12; y--; }
  return { year: y, month: m };
}
function toISO(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}
function getISOWeek(iso) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}
function parseDays(durationStr) {
  const m = String(durationStr || "1").match(/(\d+)/);
  return m ? parseInt(m[1]) : 1;
}
function addDays(isoDate, n) {
  const d = new Date(isoDate + "T12:00:00");
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function AdminSchedule({ token, refreshKey }) {
  const { T } = useLang();
  const { addToast } = useToast();
  const now = new Date();
  const [scheduled,    setScheduled]    = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [msg,          setMsg]          = useState(null);

  // formMode: null | 'new' | 'edit'
  const [formMode,     setFormMode]     = useState(null);
  const [editingId,    setEditingId]    = useState(null);

  // Pola formularza (wspólne dla nowy/edycja)
  const [selDate,      setSelDate]      = useState(toISO(now));
  const [selTrainer,   setSelTrainer]   = useState(null);
  const [trainingMode, setTrainingMode] = useState("normal");
  const [selGroup,     setSelGroup]     = useState(GROUPS[0].id);
  const [selTraining,  setSelTraining]  = useState(TRAININGS.find(t=>t.group===GROUPS[0].id)?.id || TRAININGS[0].id);
  const [stName,       setStName]       = useState("");
  const [stDays,       setStDays]       = useState(2);
  const [isHidden,     setIsHidden]     = useState(false);
  const [isOutgoing,   setIsOutgoing]   = useState(false);
  const [notes,        setNotes]        = useState("");
  const [partCount,    setPartCount]    = useState("");
  const [barColor,     setBarColor]     = useState(null); // null = auto (kolor grupy)

  // Predefiniowane kolory paska — null = automatyczny (z grupy szkoleń)
  const BAR_COLORS = [
    { value: null,      label: "Auto",             bg: "#E0E0E0" },
    { value: "#2980B9", label: T.adm_sch_illness,           bg: "#2980B9" },
    { value: "#95A5A6", label: T.adm_sch_info,        bg: "#95A5A6" },
    { value: "#F1C40F", label: "Inne (np. opon.)", bg: "#F1C40F" },
  ];

  // ── Nieskończony timeline ──
  // Zamiast jednego miesiąca, renderujemy ciągłą wstążkę wielu miesięcy.
  // Tablica months rozrasta się dynamicznie podczas scrollowania.
  const [months, setMonths] = useState(() => {
    const cur = { year: now.getFullYear(), month: now.getMonth() };
    return [_shiftMonth(cur,TIMELINE_MONTHS_BACK), cur, _shiftMonth(cur,TIMELINE_MONTHS_AHEAD)];
  });
  const [visibleLabel,   setVisibleLabel]   = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [holidays,       setHolidays]       = useState({});

  // Refs do obsługi long-press i double-tap na paskach
  const pressTimers        = useRef({});
  const tapCounts          = useRef({});
  const tapTimers          = useRef({});
  const timelineRef        = useRef(null);
  const pendingScrollAdjust = useRef(0);
  const initialScrollDone  = useRef(false);
  const isExtending        = useRef(false);
  const scrollRestoreDate  = useRef(null); // data środka widoku — przywracana po zmianie cellW
  const isOrientChanging   = useRef(false); // blokuje nadpisanie scrollRestoreDate przez scroll event podczas obrotu
  const dragScroll         = useRef({ active: false, startX: 0, startSL: 0 }); // drag-to-scroll myszą

  // Liczba dni widocznych w oknie bez scrollowania — zmień 12 na inną wartość aby dostosować szerokość komórek
  const [cellW, setCellW] = useState(28); // wartość zastępcza — ResizeObserver natychmiast ją poprawi
  const [showAll, setShowAll] = useState(false);

  // ── Tryb "podnieś i połóż" ──
  const [liftedBar, setLiftedBar] = useState(null); // entry lub null

  // Oblicza offsety pikselowe każdego miesiąca
  const { monthOffsets, totalWidth, originAbsDay: tlOrigin } = useMemo(() => {
    if (!months.length) return { monthOffsets: [], totalWidth: 0, originAbsDay: 0 };
    const origin = _absDay(`${months[0].year}-${_pad(months[0].month+1)}-01`);
    const offsets = [];
    let off = 0;
    for (const m of months) { offsets.push(off); off += _daysInMon(m.year, m.month) * cellW; }
    return { monthOffsets: offsets, totalWidth: off, originAbsDay: origin };
  }, [months, cellW]);

  useEffect(() => {
    if (!timelineRef.current) return;
    function recalc() {
      if (!timelineRef.current) return;
      const cw = timelineRef.current.clientWidth;
      if (cw < 20) return;
      setCellW(cw / TIMELINE_VISIBLE_DAYS);
    }
    const ro = new ResizeObserver(recalc);
    ro.observe(timelineRef.current);

    const vvp = window.visualViewport;
    if (vvp) vvp.addEventListener("resize", recalc);
    else window.addEventListener("resize", recalc);

    function forceRestoreScroll() {
      if (!timelineRef.current || !scrollRestoreDate.current) return;
      const cw = timelineRef.current.clientWidth;
      if (cw < 20) return;
      const newCellW = cw / TIMELINE_VISIBLE_DAYS;
      if (newCellW === 0 || tlOrigin === 0) return;
      const targetDay = Math.round((new Date(scrollRestoreDate.current + "T12:00:00") - new Date("2020-01-01T12:00:00")) / 86400000);
      const left = (targetDay - tlOrigin) * newCellW;
      timelineRef.current.scrollLeft = Math.max(0, left - cw / 2);
    }
    let timers = [];
    function onOrient() {
      // Zablokuj nadpisywanie scrollRestoreDate przez scroll eventy podczas obrotu
      isOrientChanging.current = true;
      timers.forEach(clearTimeout);
      timers = [50, 200, 500, 800, 1200].map((ms, i, arr) => setTimeout(() => {
        recalc();
        forceRestoreScroll();
        // Odblokuj po ostatnim timerze
        if (ms === arr[arr.length - 1]) isOrientChanging.current = false;
      }, ms));
    }
    window.addEventListener("orientationchange", onOrient);
    if (window.screen?.orientation)
      window.screen.orientation.addEventListener("change", onOrient);

    recalc();
    return () => {
      ro.disconnect();
      if (vvp) vvp.removeEventListener("resize", recalc);
      else window.removeEventListener("resize", recalc);
      window.removeEventListener("orientationchange", onOrient);
      window.screen?.orientation?.removeEventListener("change", onOrient);
      timers.forEach(clearTimeout);
    };
  }, []);



  // Po zmianie cellW przywróć pozycję scrollu do zapamiętanej daty
  // UWAGA: NIE zerujemy scrollRestoreDate — przeglądarka może zresetować scrollLeft
  // asynchronicznie PO naszym restore (przy zwężaniu kontenera), więc kolejne recalc
  // musi wiedzieć gdzie wrócić. Zerowanie następuje dopiero przy następnym scrollu usera.
  useEffect(() => {
    if (!timelineRef.current || cellW === 0 || tlOrigin === 0) return;
    if (!scrollRestoreDate.current) return;
    if (!initialScrollDone.current) return;
    const targetDay = Math.round((new Date(scrollRestoreDate.current + "T12:00:00") - new Date("2020-01-01T12:00:00")) / 86400000);
    const left = (targetDay - tlOrigin) * cellW;
    timelineRef.current.scrollLeft = Math.max(0, left - timelineRef.current.clientWidth / 2);
  }, [cellW, tlOrigin]);

  useEffect(() => { loadScheduled(); }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const y = now.getFullYear();
    Promise.all([fetchHolidaysForYear(y), fetchHolidaysForYear(y + 1)])
      .then(([a, b]) => setHolidays({ ...a, ...b }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Jednorazowe przewinięcie do dzisiaj
  useEffect(() => {
    if (!timelineRef.current || loading || cellW === 0 || initialScrollDone.current) return;
    initialScrollDone.current = true;
    const left = (_absDay(todayISO) - tlOrigin) * cellW;
    timelineRef.current.scrollLeft = Math.max(0, left - timelineRef.current.clientWidth / 4);
  }, [loading, cellW, tlOrigin]);

  // Korekta scrollLeft po dodaniu miesiąca z lewej strony
  useEffect(() => {
    if (pendingScrollAdjust.current !== 0 && timelineRef.current) {
      timelineRef.current.scrollLeft += pendingScrollAdjust.current;
      pendingScrollAdjust.current = 0;
    }
    isExtending.current = false;
  }, [months]);

  // Scroll handler: rozszerza wstążkę i aktualizuje etykietę
  function onTimelineScroll() {
    const el = timelineRef.current;
    if (!el || cellW === 0 || isExtending.current) return;
    const sl = el.scrollLeft, vw = el.clientWidth, maxSl = el.scrollWidth - vw;
    // Aktualizuj datę środka — ale NIE podczas obrotu (browser resetuje scrollLeft=0
    // i odpala scroll event, który by nadpisał dobrą datę złą)
    if (!isOrientChanging.current) {
      const centerDay = tlOrigin + Math.round((sl + vw / 2) / cellW);
      const d = new Date("2020-01-01T12:00:00");
      d.setDate(d.getDate() + centerDay);
      scrollRestoreDate.current = d.getFullYear() + "-" +
        String(d.getMonth()+1).padStart(2,"0") + "-" +
        String(d.getDate()).padStart(2,"0");
    }
    const centerX = sl + vw / 2;
    for (let i = monthOffsets.length - 1; i >= 0; i--) {
      if (centerX >= monthOffsets[i]) {
        const m = months[i];
        setVisibleLabel(prev => (prev.year===m.year&&prev.month===m.month)?prev:m);
        break;
      }
    }
    if (sl > maxSl - vw * 2) {
      isExtending.current = true;
      setMonths(prev => [...prev, _shiftMonth(prev[prev.length-1], 1)]);
    }
    if (sl < vw && sl > 0) {
      isExtending.current = true;
      setMonths(prev => {
        const nm = _shiftMonth(prev[0], -1);
        pendingScrollAdjust.current = _daysInMon(nm.year, nm.month) * cellW;
        return [nm, ...prev];
      });
    }
  }

  async function loadScheduled() {
    setLoading(true);
    try {
      const data = await db.get(token, "scheduled_trainings", "order=date.asc&select=*");
      setScheduled(Array.isArray(data) ? data : []);
    } catch { setScheduled([]); }
    setLoading(false);
  }

  function resetFormFields() {
    setTrainingMode("normal");
    const firstGroup = GROUPS[0].id;
    setSelGroup(firstGroup);
    setSelTraining(TRAININGS.find(t=>t.group===firstGroup)?.id || TRAININGS[0].id);
    setStName(""); setStDays(2);
    setIsHidden(false); setIsOutgoing(false); setNotes(""); setPartCount(""); setBarColor(null);
  }

  function openNewForm(date, trainerId) {
    setFormMode("new"); setEditingId(null);
    setSelDate(date); setSelTrainer(trainerId);
    resetFormFields(); setMsg(null);
    setTimeout(() => window.scrollTo?.({top:9999,behavior:"smooth"}), 60);
  }

  function openEditForm(entry) {
    const isST = entry.training_id === "ST";
    const training = isST ? null : TRAININGS.find(t=>t.id===entry.training_id);
    setFormMode("edit"); setEditingId(entry.id);
    setSelDate(entry.date || ""); setSelTrainer(entry.trainer_id !== undefined && entry.trainer_id !== null ? Number(entry.trainer_id) : null);
    setTrainingMode(isST ? "ST" : "normal");
    setSelGroup(training?.group || GROUPS[0].id);
    setSelTraining(isST ? (TRAININGS.find(t=>t.group===GROUPS[0].id)?.id || TRAININGS[0].id) : entry.training_id);
    setStName(entry.custom_name || ""); setStDays(entry.duration_days || 2);
    setIsHidden(entry.is_hidden || false);
    setIsOutgoing(entry.is_outgoing || false);
    setNotes(entry.notes || "");
    setPartCount(entry.participants_count != null ? String(entry.participants_count) : "");
    setBarColor(entry.bar_color || null);
    setMsg(null);
    setTimeout(() => window.scrollTo?.({top:9999,behavior:"smooth"}), 60);
  }

  function closeForm() { setFormMode(null); setEditingId(null); setMsg(null); setLiftedBar(null); }

  // Escape: anuluj lift lub zamknij formularz
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") { setLiftedBar(null); setFormMode(null); setEditingId(null); setMsg(null); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── Obsługa gestów paska:
  //    long-press (650ms) = usuń szkolenie (z potwierdzeniem)
  //    single-tap         = podnieś + otwórz formularz edycji jednocześnie
  //    double-tap         = toggle planned/active (bez zmian)
  function handleBarPressStart(bar, e) {
    const barId = bar.id;
    if (e.type === "touchstart") e.preventDefault();
    pressTimers.current[barId] = setTimeout(() => {
      delete pressTimers.current[barId];
      if (tapTimers.current[barId]) { clearTimeout(tapTimers.current[barId]); delete tapTimers.current[barId]; }
      tapCounts.current[barId] = 0;
      setLiftedBar(null);
      if (window.confirm("Usunąć to szkolenie z terminarza?")) deleteEntry(barId);
    }, 650);
  }

  function handleBarPressEnd(bar, e) {
    if (e.type === "touchend") e.preventDefault();
    const barId = bar.id;
    if (!pressTimers.current[barId]) return;
    clearTimeout(pressTimers.current[barId]); delete pressTimers.current[barId];
    tapCounts.current[barId] = (tapCounts.current[barId] || 0) + 1;
    if (tapCounts.current[barId] === 1) {
      tapTimers.current[barId] = setTimeout(() => {
        tapCounts.current[barId] = 0; delete tapTimers.current[barId];
        // single-tap: jeśli ten sam pasek jest już podniesiony → odłóż i zamknij
        if (liftedBar?.id === bar.id) {
          setLiftedBar(null); closeForm(); return;
        }
        // inaczej: podnieś + otwórz formularz edycji jednocześnie
        setLiftedBar(bar.entry);
        openEditForm(bar.entry);
      }, 280);
    } else {
      clearTimeout(tapTimers.current[barId]); delete tapTimers.current[barId];
      tapCounts.current[barId] = 0;
      toggleBarStatus(bar.entry);
    }
  }

  function handleBarPressCancel(barId) {
    if (pressTimers.current[barId]) { clearTimeout(pressTimers.current[barId]); delete pressTimers.current[barId]; }
  }

  async function toggleBarStatus(entry) {
    const newStatus = (entry.status || "active") === "active" ? "planned" : "active";
    // Optymistyczna aktualizacja UI
    setScheduled(s => s.map(x => x.id === entry.id ? {...x, status: newStatus} : x));
    try {
      const result = await db.update(token, "scheduled_trainings", `id=eq.${entry.id}`, {status: newStatus});
      if (Array.isArray(result) && result.length === 0) {
        throw new Error("0 wierszy zaktualizowanych — sprawdź uprawnienia lub uruchom migrację SQL");
      }
    } catch(e) {
      // Cofnij optymistyczną zmianę
      setScheduled(s => s.map(x => x.id === entry.id ? {...x, status: entry.status || "active"} : x));
      setMsg({ok:false, text:"Błąd zapisu statusu: " + e.message});
    }
  }

  const groupTrainings = TRAININGS.filter(t => t.group === selGroup);

  const previewDays = trainingMode === "ST" ? stDays : parseDays(TRAININGS.find(t=>t.id===selTraining)?.duration);
  const previewEndDate = selDate ? addDays(selDate, previewDays - 1) : "";

  async function addEntry() {
    if (!selDate || selTrainer === null) { setMsg({ok:false,text:"Wybierz trenera i datę"}); return; }
    if (trainingMode === "ST" && !stName.trim()) { setMsg({ok:false,text:"Wpisz nazwę szkolenia ST"}); return; }
    setSaving(true); setMsg(null);
    try {
      const days = trainingMode === "ST" ? stDays : parseDays(TRAININGS.find(t=>t.id===selTraining)?.duration);
      const payload = {
        date: selDate, room: "-",
        training_id: trainingMode === "ST" ? "ST" : selTraining,
        trainer_id: selTrainer,
        end_date: addDays(selDate, days - 1),
        custom_name: trainingMode === "ST" ? stName.trim() : null,
        duration_days: days,
        is_hidden: isHidden,
        is_outgoing: isOutgoing,
        notes: notes.trim(),
        participants_count: partCount !== "" ? parseInt(partCount) : null,
        bar_color: barColor || null,
      };
      await db.insert(token, "scheduled_trainings", payload);
      setMsg({ok:true,text:"✓ Dodano szkolenie do planu!"});
      closeForm(); await loadScheduled();
    } catch(e) { setMsg({ok:false,text:"Błąd zapisu: "+e.message}); }
    setSaving(false);
  }

  async function updateEntry() {
    if (!editingId || !selDate || selTrainer === null) { setMsg({ok:false,text:T.adm_sch_no_data}); return; }
    if (trainingMode === "ST" && !stName.trim()) { setMsg({ok:false,text:"Wpisz nazwę szkolenia ST"}); return; }
    setSaving(true); setMsg(null);
    try {
      const days = trainingMode === "ST" ? stDays : parseDays(TRAININGS.find(t=>t.id===selTraining)?.duration);
      const partVal = partCount !== "" ? parseInt(partCount) : null;
      const payload = {
        training_id: trainingMode === "ST" ? "ST" : selTraining,
        trainer_id: selTrainer,
        end_date: addDays(selDate, days - 1),
        custom_name: trainingMode === "ST" ? stName.trim() : null,
        duration_days: days,
        is_hidden: isHidden,
        is_outgoing: isOutgoing,
        notes: notes.trim(),
        participants_count: partVal,
        bar_color: barColor || null,
      };
      const result = await db.update(token, "scheduled_trainings", `id=eq.${editingId}`, payload);
      if (Array.isArray(result) && result.length === 0) {
        throw new Error("0 wierszy zaktualizowanych — sprawdź uprawnienia RLS lub uruchom migrację SQL");
      }
      // Aktualizuj lokalny stan od razu (bez czekania na reload)
      setScheduled(s => s.map(x => x.id === editingId ? {
        ...x, ...payload,
        participants_count: partVal,
        is_hidden: isHidden,
        is_outgoing: isOutgoing,
        bar_color: barColor || null,
      } : x));
      setSaving(false);
      closeForm();
      setMsg({ok:true,text:"✓ Zmiany zapisane!"});
      await loadScheduled();
    } catch(e) {
      setMsg({ok:false,text:"Błąd zapisu: "+e.message});
      setSaving(false);
    }
  }

  async function deleteEntry(id) {
    try {
      await db.remove(token, "scheduled_trainings", `id=eq.${id}`);
      setScheduled(s => s.filter(x => x.id !== id));
      if (editingId === id) closeForm();
    } catch(e) { addToast("Błąd usuwania: "+e.message); }
  }

  // ── Przenieś szkolenie (tryb "podnieś i połóż") ──
  async function moveEntry(entry, newDate, newTrainerId) {
    const days = entry.duration_days
      || parseDays(TRAININGS.find(t => t.id === entry.training_id)?.duration)
      || 1;
    const newEndDate = addDays(newDate, days - 1);
    // Optymistyczna aktualizacja UI
    setScheduled(s => s.map(x => x.id === entry.id
      ? { ...x, date: newDate, end_date: newEndDate, trainer_id: newTrainerId }
      : x
    ));
    try {
      const result = await db.update(token, "scheduled_trainings", `id=eq.${entry.id}`, {
        date: newDate, end_date: newEndDate, trainer_id: newTrainerId,
      });
      if (Array.isArray(result) && result.length === 0)
        throw new Error("0 wierszy zaktualizowanych — sprawdź uprawnienia RLS");
      addToast("✓ Szkolenie przeniesione");
    } catch(e) {
      // Rollback
      setScheduled(s => s.map(x => x.id === entry.id
        ? { ...x, date: entry.date, end_date: entry.end_date, trainer_id: entry.trainer_id }
        : x
      ));
      addToast("Błąd przenoszenia: " + e.message);
    }
  }

  // ── Timeline ──
  const todayISO = toISO(now);

  // ── Buduje paski z absolutnymi pozycjami pikselowymi ──
  const timelineData = useMemo(() => {
    if (!months.length) return TIMELINE_TRAINERS.map(tid => ({ trainerId: tid, bars: [] }));
    const firstISO = `${months[0].year}-${_pad(months[0].month+1)}-01`;
    const lastMon  = months[months.length-1];
    const lastISO  = `${lastMon.year}-${_pad(lastMon.month+1)}-${_pad(_daysInMon(lastMon.year, lastMon.month))}`;
    const origin   = _absDay(firstISO);

    // Dołącz podgląd nowego wpisu
    const allEntries = [...scheduled];
    if (formMode === "new" && selDate && selTrainer) {
      const isST = trainingMode === "ST";
      const training = isST ? null : TRAININGS.find(t=>t.id===selTraining);
      const grp = GROUPS.find(g=>g.id===training?.group);
      allEntries.push({
        id: "__preview__", date: selDate, end_date: previewEndDate,
        training_id: isST ? "ST" : selTraining, trainer_id: selTrainer,
        custom_name: isST ? (stName||"ST") : null,
        __preview: true, __color: barColor || (isST ? "#8E44AD" : (grp?.color || "#2980B9")),
        __title: isST ? (stName||"ST") : (training?.short||"?"), status: "active",
      });
    }
    // Live preview dla edycji — zastąp edytowany wpis wersją z bieżącymi polami
    if (formMode === "edit" && editingId && selDate && selTrainer) {
      const isST = trainingMode === "ST";
      const training = isST ? null : TRAININGS.find(t=>t.id===selTraining);
      const grp = GROUPS.find(g=>g.id===training?.group);
      const idx = allEntries.findIndex(x => x.id === editingId);
      if (idx !== -1) {
        allEntries[idx] = {
          ...allEntries[idx],
          date: selDate, end_date: previewEndDate,
          training_id: isST ? "ST" : selTraining, trainer_id: selTrainer,
          custom_name: isST ? (stName||"ST") : null,
          __color: barColor || (isST ? "#8E44AD" : (grp?.color || "#2980B9")),
          __title: isST ? (stName||"ST") : (training?.short||"?"),
        };
      }
    }

    return [...TIMELINE_TRAINERS, 0].map(trainerId => {
      const bars = allEntries
        .filter(s => Number(s.trainer_id) === trainerId)
        .map(s => {
          const startISO = s.date || "", endISO = s.end_date || s.date || "";
          if (!startISO || endISO < firstISO || startISO > lastISO) return null;
          const isST      = s.training_id === "ST";
          const training  = isST ? null : TRAININGS.find(t => t.id === s.training_id);
          const grp       = GROUPS.find(g => g.id === training?.group);
          const baseColor = s.__color || s.bar_color || (isST ? "#8E44AD" : (grp?.color || "#2980B9"));
          const isPlanned = (s.status || "active") === "planned";
          const color     = isPlanned ? "#BBBBBB" : baseColor;
          const title     = s.__title || (isST ? (s.custom_name||"ST") : (training?.short || s.training_id));
          const cs   = startISO < firstISO ? firstISO : startISO;
          const ce   = endISO   > lastISO  ? lastISO  : endISO;
          const left  = (_absDay(cs) - origin) * cellW;
          const width = Math.max(cellW - 2, (_absDay(ce) - _absDay(cs) + 1) * cellW - 2);
          return { left, width, color, title, trainerId: s.trainer_id, id: s.id,
            isPreview: !!s.__preview, isPlanned, isHidden: s.is_hidden||false,
            isOutgoing: s.is_outgoing||false, participantsCount: s.participants_count, entry: s };
        })
        .filter(Boolean);
      return { trainerId, bars };
    });
  }, [scheduled, months, cellW, formMode, editingId, selDate, selTraining, trainingMode, stName, previewEndDate, selTrainer, barColor]);

  // ── Oblicza zakresy tygodni do wyświetlenia w nagłówku ──
  const weekSpans = useMemo(() => {
    if (!months.length || cellW === 0 || !monthOffsets.length) return [];
    const spans = [];
    let curWeek = null, spanLeft = 0, spanWidth = 0;
    months.forEach((mon, mi) => {
      const days = _daysInMon(mon.year, mon.month);
      for (let d = 1; d <= days; d++) {
        const iso = `${mon.year}-${_pad(mon.month+1)}-${_pad(d)}`;
        const dayOfWeek = new Date(iso + "T12:00:00").getDay();
        const left = monthOffsets[mi] + (d - 1) * cellW;
        const isMonday = dayOfWeek === 1;
        if (curWeek === null || isMonday) {
          if (curWeek !== null) spans.push({ week: curWeek, left: spanLeft, width: spanWidth });
          curWeek = getISOWeek(iso);
          spanLeft = left;
          spanWidth = cellW;
        } else {
          spanWidth += cellW;
        }
      }
    });
    if (curWeek !== null) spans.push({ week: curWeek, left: spanLeft, width: spanWidth });
    return spans;
  }, [months, cellW, monthOffsets]);

  const upcoming = scheduled.filter(s => (s.end_date||s.date) >= todayISO);
  const LIST_LIMIT = 8;
  const listToShow = showAll ? upcoming : upcoming.slice(0, LIST_LIMIT);

  // ── Helper: pasek szkolenia z gestami ──
  function BarItem({ bar }) {
    if (bar.isPreview) {
      return (
        <div style={{position:"absolute",left:bar.left,top:4,height:TIMELINE_HEADER_ROW_H,width:bar.width,zIndex:2,
          background:bar.color+"99",borderRadius:3,display:"flex",alignItems:"center",
          padding:"0 3px",overflow:"hidden",boxSizing:"border-box",
          border:`1px dashed ${bar.color}`,cursor:"default"}}>
          <span style={{fontSize:BAR_FONT_SIZE,fontWeight:700,color:"#fff",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",flex:1,fontStyle:"italic"}}>{bar.title}</span>
        </div>
      );
    }
    const badgeVal = bar.participantsCount != null ? bar.participantsCount : null;
    const isLifted = liftedBar?.id === bar.id;
    // Touch eventy muszą być podpięte ręcznie z passive:false — React rejestruje je pasywnie
    const barDivRef = useRef(null);
    useEffect(() => {
      const el = barDivRef.current;
      if (!el) return;
      const onTS = e => handleBarPressStart(bar, e);
      const onTE = e => handleBarPressEnd(bar, e);
      const onTM = () => handleBarPressCancel(bar.id);
      el.addEventListener("touchstart", onTS, { passive: false });
      el.addEventListener("touchend",   onTE, { passive: false });
      el.addEventListener("touchmove",  onTM, { passive: true });
      return () => {
        el.removeEventListener("touchstart", onTS);
        el.removeEventListener("touchend",   onTE);
        el.removeEventListener("touchmove",  onTM);
      };
    });
    return (
      <div
        ref={barDivRef}
        data-bar="1"
        onMouseDown={e => handleBarPressStart(bar, e)}
        onMouseUp={e => handleBarPressEnd(bar, e)}
        onMouseLeave={() => handleBarPressCancel(bar.id)}
        onContextMenu={e => e.preventDefault()}
        title={`${bar.title}${bar.isPlanned?` [${T.adm_sch_planned}]`:""}${bar.isHidden?` [${T.adm_sch_hidden}]`:""}${bar.isOutgoing?` [${T.adm_sch_outgoing}]`:""}\nTap=przenieś · 2×tap=planned · przytrzymaj=edytuj`}
        style={{
          position:"absolute",left:bar.left,top: isLifted ? 2 : 4,height: isLifted ? TIMELINE_HEADER_ROW_H+4 : TIMELINE_HEADER_ROW_H,width:bar.width,
          zIndex: isLifted ? 10 : 2,
          background:bar.color,borderRadius:3,display:"flex",alignItems:"center",
          padding:"0 3px",gap:2,cursor:"pointer",overflow:"hidden",boxSizing:"border-box",
          opacity: bar.isPlanned ? 0.75 : 1,
          border: isLifted
            ? `2px solid #fff`
            : bar.isHidden ? "1px solid rgba(0,0,0,.35)" : "none",
          boxShadow: isLifted ? `0 0 0 2px ${bar.color}, 0 4px 10px rgba(0,0,0,.35)` : "none",
          transition: "box-shadow .15s, transform .15s, top .1s, height .1s",
        }}>
        {bar.isHidden && <span style={{flexShrink:0,fontSize:BAR_ICON_FONT_SIZE,color:"rgba(255,255,255,.85)",lineHeight:1}}>🔒</span>}
        {bar.isOutgoing && !bar.isHidden && <span style={{flexShrink:0,fontSize:BAR_ICON_FONT_SIZE,color:"rgba(255,255,255,.85)",lineHeight:1}}>✈️</span>}
        <span style={{fontSize:BAR_FONT_SIZE,fontWeight:700,color:"#fff",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",flex:1}}>
          {bar.title}{bar.isPlanned?" ···":""}{isLifted?" ✋":""}
        </span>
        {badgeVal !== null && (
          <span style={{flexShrink:0,background:"rgba(0,0,0,.35)",borderRadius:"50%",width:BAR_BADGE_SIZE,height:BAR_BADGE_SIZE,display:"flex",alignItems:"center",justifyContent:"center",fontSize:BAR_BADGE_FONT_SIZE,color:"#fff",lineHeight:BAR_BADGE_SIZE+"px",fontWeight:700}}>
            {badgeVal > 99 ? "99+" : badgeVal}
          </span>
        )}
      </div>
    );
  }

  return (
    <div style={{background:C.greyBg,padding:"12px",display:"flex",flexDirection:"column",gap:12}}>

      {/* ── Timeline ── */}
      <div style={{background:C.white,borderRadius:8,boxShadow:"0 1px 4px rgba(0,0,0,.1)"}}>

        {/* Etykieta widocznego miesiąca — aktualizuje się przy scrollu */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",padding:"3px 10px",borderBottom:`1px solid ${C.grey}`}}>
          <span style={{fontSize:13,fontWeight:700,color:C.black}}>{MONTHS_PL[visibleLabel.month]} {visibleLabel.year}</span>
        </div>

        {/* Stała lewa kolumna + przewijalna prawa część */}
        <div style={{display:"flex",overflow:"hidden"}}>

          {/* ── LEWA KOLUMNA (nie scrolluje) ── */}
          <div style={{width:TIMELINE_LABEL_COL_WIDTH,minWidth:TIMELINE_LABEL_COL_WIDTH,flexShrink:0,background:"#f7f7f7",borderRight:`1px solid ${C.grey}`,zIndex:4}}>
            {/* Nagłówek T */}
            <div style={{height:TIMELINE_DAY_HEADER_H,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,color:C.greyMid}}>T</div>
            {/* Nagłówek W */}
            <div style={{height:TIMELINE_DAY_HEADER_H,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:700,color:C.greyMid,borderTop:`1px solid ${C.grey}`,borderBottom:`2px solid ${C.grey}`}}>W</div>
            {/* Wiersze trenerów */}
            {TIMELINE_TRAINERS.map(tid=>(
              <div key={tid} style={{height:TIMELINE_TRAINER_ROW_H,display:"flex",alignItems:"center",justifyContent:"center",fontSize:BAR_FONT_SIZE,fontWeight:700,color:C.greyDk,borderBottom:`1px solid ${C.grey}`}}>
                {trainerInitials(tid)}
              </div>
            ))}
            {/* Wiersz tymczasowy */}
            <div style={{height:TIMELINE_TRAINER_ROW_H,display:"flex",alignItems:"center",justifyContent:"center",fontSize:BAR_FONT_SIZE,fontWeight:700,color:C.greyMid,borderBottom:`1px solid ${C.grey}`,fontStyle:"italic"}}>T</div>
          </div>

          {/* ── PRAWA CZĘŚĆ (scrolluje poziomo) ── */}
          <div
            ref={timelineRef}
            onScroll={onTimelineScroll}
            onPointerDown={e => {
              if (e.button !== 0 || e.target.closest("[data-bar]")) return;
              dragScroll.current = { pending: true, active: false, captured: false, startX: e.clientX, startSL: timelineRef.current.scrollLeft, pointerId: e.pointerId };
            }}
            onPointerMove={e => {
              const ds = dragScroll.current;
              if (!ds.pending) return;
              const delta = ds.startX - e.clientX;
              if (!ds.active && Math.abs(delta) > 4) {
                ds.active = true;
                if (!ds.captured) {
                  timelineRef.current.setPointerCapture(ds.pointerId);
                  ds.captured = true;
                }
                timelineRef.current.style.cursor = "grabbing";
              }
              if (!ds.active) return;
              timelineRef.current.scrollLeft = ds.startSL + delta;
            }}
            onPointerUp={()=>{ dragScroll.current = { pending:false, active:false, captured:false }; timelineRef.current.style.cursor = ""; }}
            onPointerCancel={()=>{ dragScroll.current = { pending:false, active:false, captured:false }; timelineRef.current.style.cursor = ""; }}
            style={{flex:1,overflowX:"auto",WebkitOverflowScrolling:"touch",cursor:"grab"}}>
            <div style={{display:"inline-block",minWidth:"100%",verticalAlign:"top"}}>

              {/* Nagłówek — rząd dni i numer tygodnia */}
              <div style={{borderBottom:`2px solid ${C.grey}`}}>
                {/* Rząd 1: numery dni */}
                <div style={{display:"flex"}}>
                  {months.map((mon,mi)=>{
                    const days=_daysInMon(mon.year,mon.month);
                    return (
                      <div key={`${mon.year}-${mon.month}`} style={{display:"flex",position:"relative",borderLeft:mi>0?`2px solid ${C.grey}`:"none"}}>
                        <div style={{position:"absolute",top:1,left:3,fontSize:7,fontWeight:700,color:C.green,letterSpacing:.3,pointerEvents:"none",lineHeight:"9px"}}>
                          {MONTHS_PL[mon.month].slice(0,3).toUpperCase()}
                        </div>
                        {Array.from({length:days},(_,i)=>i+1).map(d=>{
                          const iso=`${mon.year}-${_pad(mon.month+1)}-${_pad(d)}`;
                          const isToday=iso===todayISO;
                          const isWe=new Date(iso+"T12:00:00").getDay()%6===0;
                          const isHol=!!holidays[iso];
                          const isOff=isWe||isHol;
                          return <div key={d} title={holidays[iso]||undefined} style={{width:cellW,minWidth:cellW,flexShrink:0,height:TIMELINE_DAY_HEADER_H,display:"flex",alignItems:"flex-end",justifyContent:"center",paddingBottom:1,fontSize:9,fontWeight:isToday||isHol?700:400,color:isToday?C.greenDk:isOff?"#aaa":C.greyMid,background:isToday?C.greenBg:isOff?"#e8e8e8":"transparent",borderRight:"1px solid #efefef",boxSizing:"border-box"}}>{d}</div>;
                        })}
                      </div>
                    );
                  })}
                </div>
                {/* Rząd 2: numery tygodni */}
                <div style={{position:"relative",height:TIMELINE_DAY_HEADER_H,width:totalWidth,borderTop:`1px solid ${C.grey}`}}>
                  {weekSpans.map(span=>(
                    <div key={`w-${span.week}-${span.left}`} style={{position:"absolute",left:span.left,width:span.width,height:"100%",display:"flex",alignItems:"center",paddingLeft:3,fontSize:8,fontWeight:600,color:C.greyMid,borderRight:`1px solid #efefef`,boxSizing:"border-box",overflow:"hidden"}}>
                      {span.week}
                    </div>
                  ))}
                </div>
              </div>

              {/* Wiersze trenerów — bez lewej komórki etykiety */}
              {TIMELINE_TRAINERS.map(tid=>{
                const roomBars=(timelineData.find(r=>r.trainerId===tid)||{bars:[]}).bars;
                return (
                  <div key={tid} style={{position:"relative",height:TIMELINE_TRAINER_ROW_H,width:totalWidth,borderBottom:`1px solid ${C.grey}`}}>
                    {/* Klikalne komórki tła */}
                    {months.map((mon,mi)=>Array.from({length:_daysInMon(mon.year,mon.month)},(_,i)=>i+1).map(d=>{
                      const iso=`${mon.year}-${_pad(mon.month+1)}-${_pad(d)}`;
                      const isToday=iso===todayISO;
                      const isWe=new Date(iso+"T12:00:00").getDay()%6===0;
                      const isHol2=!!holidays[iso];
                      return <div key={`${mi}-${d}`} onClick={()=>{
                        if (liftedBar) {
                          moveEntry(liftedBar, iso, tid);
                          setLiftedBar(null);
                          closeForm();
                        } else {
                          openNewForm(iso, tid);
                        }
                      }} title={holidays[iso]||undefined} style={{position:"absolute",left:monthOffsets[mi]+(d-1)*cellW,top:0,width:cellW,height:"100%",background:liftedBar?(isToday?"rgba(138,183,62,.25)":"rgba(41,128,185,.07)"):isToday?"rgba(138,183,62,.12)":(isWe||isHol2)?"rgba(0,0,0,.05)":"transparent",cursor:liftedBar?"copy":"pointer",zIndex:0}}/>;
                    }))}
                    {/* Linie pionowe */}
                    {months.map((mon,mi)=>Array.from({length:_daysInMon(mon.year,mon.month)},(_,i)=>i+1).map(d=>(
                      <div key={`${mi}-${d}`} style={{position:"absolute",left:monthOffsets[mi]+d*cellW,top:0,width:1,height:"100%",background:"#efefef",pointerEvents:"none",zIndex:0}}/>
                    )))}
                    {/* Separatory miesięcy */}
                    {monthOffsets.slice(1).map((off,i)=>(
                      <div key={i} style={{position:"absolute",left:off,top:0,width:2,height:"100%",background:C.grey,pointerEvents:"none",zIndex:1}}/>
                    ))}
                    {/* Paski szkoleń */}
                    {roomBars.map((bar,bi)=><BarItem key={bi} bar={bar}/>)}
                  </div>
                );
              })}
              {/* Wiersz tymczasowy (trainer_id = 0) */}
              {(()=>{
                const tmpBars=(timelineData.find(r=>r.trainerId===0)||{bars:[]}).bars;
                return (
                  <div style={{position:"relative",height:TIMELINE_TRAINER_ROW_H,width:totalWidth,borderBottom:`1px solid ${C.grey}`}}>
                    {months.map((mon,mi)=>Array.from({length:_daysInMon(mon.year,mon.month)},(_,i)=>i+1).map(d=>{
                      const iso=`${mon.year}-${_pad(mon.month+1)}-${_pad(d)}`;
                      const isToday=iso===todayISO;
                      const isWe=new Date(iso+"T12:00:00").getDay()%6===0;
                      const isHol2=!!holidays[iso];
                      return <div key={`${mi}-${d}`} onClick={()=>{
                        if (liftedBar) { moveEntry(liftedBar, iso, 0); setLiftedBar(null); closeForm(); }
                        else { openNewForm(iso, 0); }
                      }} title={holidays[iso]||undefined} style={{position:"absolute",left:monthOffsets[mi]+(d-1)*cellW,top:0,width:cellW,height:"100%",background:liftedBar?(isToday?"rgba(138,183,62,.25)":"rgba(41,128,185,.07)"):isToday?"rgba(138,183,62,.12)":(isWe||isHol2)?"rgba(0,0,0,.05)":"transparent",cursor:liftedBar?"copy":"pointer",zIndex:0}}/>;
                    }))}
                    {months.map((mon,mi)=>Array.from({length:_daysInMon(mon.year,mon.month)},(_,i)=>i+1).map(d=>(
                      <div key={`${mi}-${d}`} style={{position:"absolute",left:monthOffsets[mi]+d*cellW,top:0,width:1,height:"100%",background:"#efefef",pointerEvents:"none",zIndex:0}}/>
                    )))}
                    {monthOffsets.slice(1).map((off,i)=>(
                      <div key={i} style={{position:"absolute",left:off,top:0,width:2,height:"100%",background:C.grey,pointerEvents:"none",zIndex:1}}/>
                    ))}
                    {tmpBars.map((bar,bi)=><BarItem key={bi} bar={bar}/>)}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      </div>

      {/* ── Banner trybu przenoszenia ── */}
      {liftedBar && (() => {
        const isST = liftedBar.training_id === "ST";
        const t = isST ? null : TRAININGS.find(x => x.id === liftedBar.training_id);
        const title = isST ? (liftedBar.custom_name || "ST") : (t?.short || liftedBar.training_id);
        return (
          <div style={{background:"#2980B9",color:"#fff",padding:"10px 14px",borderRadius:6,fontSize:12,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
            <span>✋ <strong>{title}</strong> — dotknij komórki aby przenieść · edytuj szczegóły poniżej · tap na pasek aby anulować</span>
            <button onClick={() => { setLiftedBar(null); closeForm(); }}
              style={{background:"rgba(255,255,255,.2)",border:"none",color:"#fff",padding:"4px 12px",borderRadius:4,cursor:"pointer",fontSize:11,fontWeight:700,flexShrink:0}}>
              ✕ Anuluj
            </button>
          </div>
        );
      })()}

      {/* ── Anuluj (tylko dla trybu nowego) ── */}
      {formMode === "new" && (
        <button onClick={closeForm}
          style={{background:C.greyDk,color:C.white,border:"none",padding:"13px 0",fontSize:13,fontWeight:700,cursor:"pointer",borderRadius:6}}>
          ✕ Anuluj
        </button>
      )}

      {msg && (
        <div style={{padding:"10px 14px",borderRadius:6,background:msg.ok?"#E8F8E8":"#FDEDEC",color:msg.ok?C.greenDk:C.red,fontSize:13,fontWeight:600}}>
          {msg.text}
        </div>
      )}

      {formMode && (
        <div style={{background:C.white,borderRadius:8,padding:16,boxShadow:"0 1px 4px rgba(0,0,0,.1)",display:"flex",flexDirection:"column",gap:14}}>

          {/* Nagłówek z info o dacie i trenerze */}
          <div style={{background:C.greyBg,borderRadius:6,padding:"10px 14px",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
            <span style={{fontSize:12,fontWeight:700,color:C.black}}>
              {formMode==="edit" ? "✏️ Edycja szkolenia" : "➕ Nowe szkolenie"}
            </span>
            <span style={{fontSize:12,color:C.greyDk}}>
              📅 {selDate} &nbsp;·&nbsp; {selTrainer === 0 ? "Tymczasowy (T)" : selTrainer ? `T${selTrainer} ${TRAINERS[selTrainer] || ""}` : ""}
            </span>
          </div>

          {/* RODZAJ SZKOLENIA */}
          <div>
            <div style={{fontSize:11,fontWeight:700,color:C.greyMid,letterSpacing:1,marginBottom:8,textTransform:"uppercase"}}>Rodzaj szkolenia</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {GROUPS.map(g=>(
                <button key={g.id} onClick={()=>{ setTrainingMode("normal"); setSelGroup(g.id); const first = TRAININGS.find(t=>t.group===g.id); if(first) setSelTraining(first.id); }}
                  style={{padding:"7px 14px",background:trainingMode==="normal"&&selGroup===g.id?g.color:"transparent",color:trainingMode==="normal"&&selGroup===g.id?C.white:g.color,border:`1.5px solid ${g.color}`,borderRadius:20,fontSize:11,fontWeight:700,cursor:"pointer"}}>
                  {g.label}
                </button>
              ))}
              <button onClick={()=>setTrainingMode("ST")}
                style={{padding:"7px 14px",background:trainingMode==="ST"?"#8E44AD":"transparent",color:trainingMode==="ST"?C.white:"#8E44AD",border:"1.5px solid #8E44AD",borderRadius:20,fontSize:11,fontWeight:700,cursor:"pointer"}}>
                ⭐ ST
              </button>
            </div>
          </div>

          {/* SZKOLENIE — normalne */}
          {trainingMode === "normal" && (
            <div>
              <div style={{fontSize:11,fontWeight:700,color:C.greyMid,letterSpacing:1,marginBottom:8,textTransform:"uppercase"}}>Szkolenie</div>
              <select value={selTraining} onChange={e=>setSelTraining(e.target.value)}
                style={{width:"100%",padding:"10px 12px",border:`1.5px solid ${C.grey}`,borderRadius:6,fontSize:13,color:C.black,background:C.white,boxSizing:"border-box"}}>
                {groupTrainings.map(t=>(
                  <option key={t.id} value={t.id}>{t.short} — {t.title}</option>
                ))}
              </select>
            </div>
          )}

          {/* SZKOLENIE — ST */}
          {trainingMode === "ST" && (
            <div style={{display:"flex",flexDirection:"column",gap:12,background:"#F9F0FF",border:"1px solid rgba(142,68,173,.25)",borderRadius:8,padding:14}}>
              <div style={{fontSize:11,fontWeight:700,color:"#8E44AD",letterSpacing:1}}>⭐ SZKOLENIE SPECJALNE (ST)</div>
              <div>
                <label style={{display:"block",fontSize:11,fontWeight:700,color:C.greyDk,marginBottom:6,textTransform:"uppercase"}}>Nazwa szkolenia</label>
                <input value={stName} onChange={e=>setStName(e.target.value)} placeholder="Wpisz nazwę…"
                  style={{width:"100%",padding:"10px 12px",border:"1.5px solid #8E44AD",borderRadius:6,fontSize:13,color:C.black,background:C.white,boxSizing:"border-box"}}/>
              </div>
              <div>
                <label style={{display:"block",fontSize:11,fontWeight:700,color:C.greyDk,marginBottom:6,textTransform:"uppercase"}}>Czas trwania (dni)</label>
                <div style={{display:"flex",gap:8}}>
                  {[1,2,3,4,5].map(d=>(
                    <button key={d} onClick={()=>setStDays(d)}
                      style={{flex:1,padding:"10px 0",background:stDays===d?"#8E44AD":C.white,color:stDays===d?C.white:C.greyDk,border:`1.5px solid ${stDays===d?"#8E44AD":C.grey}`,borderRadius:6,fontSize:15,fontWeight:700,cursor:"pointer"}}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* NOTATKI */}
          <div>
            <div style={{fontSize:11,fontWeight:700,color:C.greyMid,letterSpacing:1,marginBottom:8,textTransform:"uppercase"}}>Notatki</div>
            <textarea
              value={notes} onChange={e=>setNotes(e.target.value)}
              rows={10}
              placeholder="Dodatkowe informacje o szkoleniu…"
              style={{width:"100%",padding:"10px 12px",border:`1.5px solid ${C.grey}`,borderRadius:6,fontSize:12,color:C.black,background:C.white,boxSizing:"border-box",resize:"vertical",fontFamily:"inherit",lineHeight:1.55,outline:"none"}}
            />
          </div>

          {/* WIERSZ 1: 🔒 ✈️ 👥 + kolory */}
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <label style={{display:"flex",alignItems:"center",gap:4,cursor:"pointer"}}
              title="Ukryte — niewidoczne dla klientów">
              <input type="checkbox" checked={isHidden}
                onChange={e => { setIsHidden(e.target.checked); if (e.target.checked) setIsOutgoing(false); }}
                style={{width:16,height:16,cursor:"pointer",accentColor:C.amber}}/>
              <span style={{fontSize:16}}>🔒</span>
            </label>
            <label style={{display:"flex",alignItems:"center",gap:4,cursor:"pointer"}}
              title="Wyjazdowe — widoczne tylko dla trenerów">
              <input type="checkbox" checked={isOutgoing}
                onChange={e => { setIsOutgoing(e.target.checked); if (e.target.checked) setIsHidden(false); }}
                style={{width:16,height:16,cursor:"pointer",accentColor:"#2980B9"}}/>
              <span style={{fontSize:16}}>✈️</span>
            </label>
            <span style={{fontSize:11,fontWeight:700,color:C.greyMid,letterSpacing:1,marginLeft:6}}>👥</span>
            <input
              type="number" min="0" max="999" value={partCount}
              onChange={e=>setPartCount(e.target.value)}
              placeholder="—"
              style={{width:56,padding:"6px 8px",border:`1.5px solid ${C.grey}`,borderRadius:6,fontSize:14,fontWeight:700,color:C.black,background:C.white,textAlign:"center",outline:"none"}}
            />
            <div style={{flex:1}}/>
            <div style={{display:"flex",gap:5,alignItems:"center"}} title={T.adm_sch_bar_color}>
              {BAR_COLORS.map(bc => {
                const isSelected = barColor === bc.value;
                return (
                  <button
                    key={String(bc.value)}
                    onClick={() => setBarColor(bc.value)}
                    title={bc.label}
                    style={{
                      width: 22, height: 22, borderRadius: "50%",
                      background: bc.bg,
                      border: isSelected ? "2.5px solid #222" : "1.5px solid rgba(0,0,0,.18)",
                      cursor: "pointer", flexShrink: 0, padding: 0,
                      boxShadow: isSelected ? "0 0 0 1.5px #fff inset" : "none",
                      transition: "border .12s, box-shadow .12s",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 9, fontWeight: 700,
                      color: bc.value ? "#fff" : C.greyDk,
                    }}>
                    {bc.value ? "" : "A"}
                  </button>
                );
              })}
            </div>
          </div>

          {/* WIERSZ 2: Anuluj + Zapisz/Dodaj */}
          <div style={{display:"flex",gap:8}}>
            <button onClick={closeForm}
              style={{flex:1,padding:"11px 0",fontSize:13,fontWeight:600,background:C.white,color:C.greyDk,border:`1px solid ${C.grey}`,borderRadius:6,cursor:"pointer"}}>
              Anuluj
            </button>
            {formMode === "new" ? (
              <button onClick={addEntry} disabled={saving}
                style={{flex:1,padding:"11px 0",fontSize:13,fontWeight:700,background:saving?C.greyDk:C.black,color:C.white,border:"none",borderRadius:6,cursor:saving?"not-allowed":"pointer"}}>
                {saving ? "…" : "✓ Dodaj"}
              </button>
            ) : (
              <button onClick={updateEntry} disabled={saving}
                style={{flex:1,padding:"11px 0",fontSize:13,fontWeight:700,background:saving?C.greyDk:C.greenDk,color:C.white,border:"none",borderRadius:6,cursor:saving?"not-allowed":"pointer"}}>
                {saving ? "…" : "✓ Zapisz"}
              </button>
            )}
          </div>
          {/* WIERSZ 2: Usuń — tylko w trybie edycji, wyrównany do prawej */}
          {formMode === "edit" && (
            <div style={{display:"flex",justifyContent:"flex-end"}}>
              <button
                onClick={()=>{ if(window.confirm("Usunąć to szkolenie z terminarza?")) { deleteEntry(editingId); closeForm(); } }}
                style={{padding:"5px 12px",fontSize:11,fontWeight:600,background:"none",color:C.red,border:`1px solid ${C.red}`,borderRadius:5,cursor:"pointer"}}>
                🗑 Usuń szkolenie
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Lista nadchodzących ── */}
      {!loading && (
        <div style={{background:C.white,borderRadius:8,padding:14,boxShadow:"0 1px 3px rgba(0,0,0,.07)"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:8}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{fontSize:11,fontWeight:700,color:C.greyMid,letterSpacing:1,textTransform:"uppercase"}}>
                {showAll ? `Wszystkie nadchodzące (${upcoming.length})` : `Nadchodzące (${Math.min(upcoming.length, LIST_LIMIT)}${upcoming.length > LIST_LIMIT ? `/${upcoming.length}` : ""})`}
              </div>
              {!showAll && upcoming.length > LIST_LIMIT && (
                <button onClick={() => setShowAll(true)}
                  style={{background:"none",border:"none",fontSize:11,color:C.greyMid,cursor:"pointer",textDecoration:"underline",padding:0}}>
                  pokaż wszystkie
                </button>
              )}
              {showAll && (
                <button onClick={() => setShowAll(false)}
                  style={{background:"none",border:"none",fontSize:11,color:C.greyMid,cursor:"pointer",textDecoration:"underline",padding:0}}>
                  pokaż najbliższe
                </button>
              )}
            </div>
            {scheduled.length > 0 && (
              <button onClick={() => {
                const nowStr = new Date().toISOString().replace(/[-:.]/g,"").slice(0,15)+"Z";
                const events = scheduled.map(s => {
                  const isST = s.training_id === "ST";
                  const t = isST ? null : TRAININGS.find(x=>x.id===s.training_id);
                  const title = isST ? (s.custom_name||"ST") : (t?.title||s.training_id);
                  const sd = (s.date||"").replace(/-/g,"");
                  const ed = ((s.end_date||s.date)||"").replace(/-/g,"");
                  return ["BEGIN:VEVENT",`UID:${s.id}-${sd}@engel`,`DTSTAMP:${nowStr}`,`DTSTART;VALUE=DATE:${sd}`,`DTEND;VALUE=DATE:${ed}`,`SUMMARY:${title}`,"END:VEVENT"].join("\r\n");
                }).join("\r\n");
                const ics=`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//ENGEL Expert Academy//PL\r\n${events}\r\nEND:VCALENDAR`;
                const blob=new Blob([ics],{type:"text/calendar;charset=utf-8"});
                const url=URL.createObjectURL(blob);
                const a=document.createElement("a");
                a.href=url; a.download="terminarz-engel.ics"; a.click(); URL.revokeObjectURL(url);
              }} style={{fontSize:11,fontWeight:700,padding:"5px 10px",background:C.black,color:C.white,border:"none",borderRadius:4,cursor:"pointer"}}>
                📅 Eksportuj .ics
              </button>
            )}
          </div>
          {listToShow.length===0 && (
            <div style={{textAlign:"center",padding:20,color:C.greyMid,fontSize:13}}>Brak nadchodzących szkoleń</div>
          )}
          {listToShow.map(s => {
            const isST = s.training_id === "ST";
            const t = isST ? null : TRAININGS.find(x=>x.id===s.training_id);
            const grp = GROUPS.find(g=>g.id===t?.group);
            const barColor = s.bar_color || (isST ? "#8E44AD" : (grp?.color || C.grey));
            const isPlanned = (s.status||"active") === "planned";
            return (
              <div key={s.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderBottom:`1px solid ${C.grey}`,opacity:isPlanned?0.6:1}}>
                <div style={{width:4,alignSelf:"stretch",background:isPlanned?"#BBBBBB":barColor,borderRadius:2,flexShrink:0}}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12,fontWeight:700,color:C.black,marginBottom:2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                    {isST?(s.custom_name||"ST"):(t?.title||s.training_id)}
                    {isPlanned && <span style={{fontSize:10,fontWeight:400,color:C.greyMid}}> · planowane</span>}
                    {s.is_hidden && <span style={{fontSize:10,color:C.amber}}> 🔒</span>}
                  </div>
                  <div style={{fontSize:11,color:C.greyMid,display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                    <span>{s.date}{s.end_date&&s.end_date!==s.date?` → ${s.end_date}`:""}</span>
                    {s.trainer_id&&<span>· {trainerInitials(s.trainer_id)}</span>}
                    {s.participants_count!=null&&<span>· 👥 {s.participants_count}</span>}
                  </div>
                </div>
                <button onClick={()=>openEditForm(s)}
                  style={{background:"none",border:`1px solid ${C.grey}`,color:C.greyDk,fontSize:11,padding:"4px 10px",borderRadius:4,cursor:"pointer",flexShrink:0}}>
                  ✏️
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
