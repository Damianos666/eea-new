// ─────────────────────────────────────────────────────────────────────────────
// DELEGATION PDF GENERATOR — @react-pdf/renderer
// Generuje rozliczenie delegacji jako PDF — bez zapisu do Supabase
// ─────────────────────────────────────────────────────────────────────────────

import React from "react";
import { Document, Page, Text, Font, View, Image, pdf } from "@react-pdf/renderer";

Font.register({
  family: "Lato",
  fonts: [
    { src: "/fonts/Lato-Regular.ttf" },
    { src: "/fonts/Lato-Bold.ttf", fontWeight: "bold" },
  ],
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
const MONTHS_PL = [
  "stycznia","lutego","marca","kwietnia","maja","czerwca",
  "lipca","sierpnia","września","października","listopada","grudnia",
];

function fmtDate(isoStr) {
  if (!isoStr) return "—";
  const d = new Date(isoStr + "T12:00:00");
  return `${d.getDate()} ${MONTHS_PL[d.getMonth()]} ${d.getFullYear()}`;
}

function fmtMoney(n) {
  return (n || 0).toFixed(2).replace(".", ",") + " zł";
}

const plMap = {
  ą:"a",ę:"e",ś:"s",ź:"z",ż:"z",ó:"o",ł:"l",ć:"c",ń:"n",
  Ą:"A",Ę:"E",Ś:"S",Ź:"Z",Ż:"Z",Ó:"O",Ł:"L",Ć:"C",Ń:"N",
};
const dePL = str => str.replace(/[ąęśźżółćńĄĘŚŹŻÓŁĆŃ]/g, c => plMap[c] || c);

// ─── Kolory / stałe ───────────────────────────────────────────────────────────
const COL = {
  black:   "#1A1A1A",
  darkHdr: "#2C2C2C",
  green:   "#8AB73E",
  greenDk: "#6E9430",
  greenBg: "#F0F7E0",
  grey:    "#E8E8E8",
  greyMid: "#A0A0A0",
  greyBg:  "#F4F4F4",
  white:   "#FFFFFF",
  red:     "#C0392B",
  amber:   "#E67E22",
  blue:    "#2980B9",
  blueBg:  "#EBF5FB",
};

// ─── Małe komponenty ──────────────────────────────────────────────────────────
const SectionHeader = ({ children }) => (
  <View style={{
    backgroundColor: COL.greyBg,
    borderBottomWidth: 1,
    borderBottomColor: COL.grey,
    padding: "5 10",
    marginBottom: 0,
  }}>
    <Text style={{
      fontFamily: "Lato",
      fontSize: 7,
      fontWeight: "bold",
      color: COL.greyMid,
      letterSpacing: 1,
      textTransform: "uppercase",
    }}>
      {children}
    </Text>
  </View>
);

const Row = ({ label, value, valueColor, bold, borderTop, big }) => (
  <View style={{
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
    borderTopWidth: borderTop ? 1.5 : 0,
    borderTopColor: COL.grey,
    borderBottomWidth: 1,
    borderBottomColor: COL.grey,
  }}>
    <Text style={{ fontFamily: "Lato", fontSize: big ? 9 : 8, color: COL.greyMid }}>{label}</Text>
    <Text style={{ fontFamily: "Lato", fontSize: big ? 10 : 8, fontWeight: bold ? "bold" : "normal", color: valueColor || COL.black }}>{value}</Text>
  </View>
);

const InfoRow = ({ label, value, valueColor }) => (
  <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 }}>
    <Text style={{ fontFamily: "Lato", fontSize: 8, color: COL.greyMid, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</Text>
    <Text style={{ fontFamily: "Lato", fontSize: 8, fontWeight: "bold", color: valueColor || COL.black }}>{value}</Text>
  </View>
);

// ─── Główny dokument PDF ──────────────────────────────────────────────────────
const DelegationDocument = ({ data, bgBase64 }) => {
  const {
    trainerName, trainingTitle,
    date, endDate,
    origin, destination,
    depDate, depTime, retDate, retTime,
    transport, km, plate, ticketCost, ticketRoute, otherCost, otherDesc,
    extraCosts = [], extraTotal = 0,
    nights,
    meals,
    payCard, payCash, payAdvance,
    dur, dietaBase, mealCut, nightsTotal, transportCost, gross, net,
  } = data;

  const transportLabel =
    transport === "car"   ? `Pojazd służbowy${km ? ` · ${km} km` : ""}${plate ? ` · ${plate}` : ""}` :
    transport === "train" ? `Pociąg/Bus${ticketRoute ? ` · ${ticketRoute}` : ""}` :
    otherDesc || "Inne";

  const transportCostStr =
    transport === "car"   ? "— (pojazd służbowy)" :
    transport === "train" ? fmtMoney(parseFloat(ticketCost) || 0) :
    fmtMoney(parseFloat(otherCost) || 0);

  const nightsRows = nights.map((n, i) => ({
    label: `Nocleg ${i + 1} · ${n.type === "ryczalt" ? "ryczałt" : "rachunek"}`,
    value: n.type === "ryczalt" ? fmtMoney(67.5) : fmtMoney(Math.min(n.amount || 0, 900)),
  }));

  const mealsLabels = ["Śniadania", "Obiady", "Kolacje"];
  const mealsCuts   = [11.25, 22.5, 11.25];

  // ── POPRAWKA: używamy dur.label identycznie w obu miejscach ──
  const dietaLabel = `Dieta (${dur.label || `${dur.doby} dób`})`;

  return (
    <Document>
      <Page size="A4" orientation="portrait" style={{ padding: 0, fontFamily: "Lato", backgroundColor: COL.white, position:"relative" }}>

        {/* Tło firmowe */}
        {bgBase64 && (
          <Image src={bgBase64} style={{ position:"absolute", top:0, left:0, width:"100%", height:"100%", objectFit:"cover" }} fixed />
        )}

        {/* ── Nagłówek ── */}
        <View style={{
          backgroundColor: "rgba(255,255,255,0.94)",
          borderBottomWidth: 2,
          borderBottomColor: COL.green,
          padding: "12 14",
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <View>
            <Text style={{ fontSize: 15, fontWeight: "bold", color: COL.black, letterSpacing: 0.5 }}>Rozliczenie delegacji</Text>
            <Text style={{ fontSize: 8, color: COL.greyMid, marginTop: 2 }}>Szkolenie wyjazdowe  ·  Podróż służbowa krajowa</Text>
          </View>
        </View>

        {/* ── Baner ── */}
        <View style={{
          backgroundColor: "rgba(255,255,255,0.85)",
          borderBottomWidth: 1,
          borderBottomColor: COL.grey,
          padding: "4 14",
          flexDirection: "row",
          alignItems: "center",
        }}>
          <Text style={{ fontSize: 8, fontWeight: "bold", color: COL.greyMid }}>✈  Wyjazdowe  ·  Podróż służbowa krajowa</Text>
        </View>

        <View style={{ padding: "0 14 14" }}>

          {/* ── Dane z terminarza – poziomy baner ── */}
          <View style={{
            marginTop: 10,
            borderRadius: 6,
            borderWidth: 1,
            borderColor: COL.grey,
            flexDirection: "row",
            padding: "7 12",
          }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 7, color: COL.greyMid, textTransform: "uppercase", letterSpacing: 0.5 }}>Trener</Text>
              <Text style={{ fontSize: 9, fontWeight: "bold", color: COL.black, marginTop: 2 }}>{trainerName}</Text>
            </View>
            <View style={{ flex: 2, paddingHorizontal: 8, borderLeftWidth: 1, borderLeftColor: COL.grey }}>
              <Text style={{ fontSize: 7, color: COL.greyMid, textTransform: "uppercase", letterSpacing: 0.5 }}>Szkolenie</Text>
              <Text style={{ fontSize: 9, fontWeight: "bold", color: COL.black, marginTop: 2 }}>{trainingTitle}</Text>
            </View>
            <View style={{ flex: 1, paddingHorizontal: 8, borderLeftWidth: 1, borderLeftColor: COL.grey }}>
              <Text style={{ fontSize: 7, color: COL.greyMid, textTransform: "uppercase", letterSpacing: 0.5 }}>Termin</Text>
              <Text style={{ fontSize: 9, fontWeight: "bold", color: COL.blue, marginTop: 2 }}>
                {date === endDate || !endDate ? fmtDate(date) : `${fmtDate(date)} – ${fmtDate(endDate)}`}
              </Text>
            </View>
          </View>

          {/* ── Środek: 2 kolumny ── */}
          <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>

            {/* ── KOLUMNA LEWA ── */}
            <View style={{ flex: 1 }}>

              {/* Szczegóły podróży */}
              <View style={{ borderRadius: 6, overflow: "hidden", borderWidth: 1, borderColor: COL.grey }}>
                <SectionHeader>🚗  Szczegóły podróży</SectionHeader>
                <View style={{ padding: "5 10", gap: 2 }}>
                  <InfoRow label="Skąd"         value={origin || "—"} />
                  <InfoRow label="Dokąd"        value={destination || "—"} />
                  <InfoRow label="Wyjazd"       value={`${fmtDate(depDate)}  ${depTime || ""}`} />
                  <InfoRow label="Powrót"       value={`${fmtDate(retDate)}  ${retTime || ""}`} />
                  <View style={{ borderTopWidth: 1, borderTopColor: COL.grey, marginVertical: 2 }} />
                  <InfoRow label="Czas trwania" value={dur.label || "—"} />
                  <InfoRow label="Dieta bazowa" value={fmtMoney(dietaBase)} valueColor={COL.greenDk} />
                </View>
              </View>

              {/* Transport */}
              <View style={{ marginTop: 6, borderRadius: 6, overflow: "hidden", borderWidth: 1, borderColor: COL.grey }}>
                <SectionHeader>🚌  Transport</SectionHeader>
                <View style={{ padding: "5 10", gap: 2 }}>
                  <InfoRow label="Środek" value={transportLabel} />
                  <InfoRow label="Koszt"  value={transportCostStr}
                    valueColor={transportCost > 0 ? COL.black : COL.greyMid} />
                </View>
              </View>

              {/* Posiłki */}
              {meals.some(m => m > 0) && (
                <View style={{ marginTop: 6, borderRadius: 6, overflow: "hidden", borderWidth: 1, borderColor: COL.grey }}>
                  <SectionHeader>🍽  Posiłki (odliczenie)</SectionHeader>
                  <View style={{ padding: "5 10", gap: 2 }}>
                    {meals.map((cnt, i) => cnt > 0 && (
                      <InfoRow key={i}
                        label={`${mealsLabels[i]} × ${cnt} szt.`}
                        value={`− ${fmtMoney(cnt * mealsCuts[i])}`}
                        valueColor={COL.red}
                      />
                    ))}
                    <View style={{ borderTopWidth: 1, borderTopColor: COL.grey, marginVertical: 2 }} />
                    <InfoRow label="Łącznie odliczenie"
                      value={`− ${fmtMoney(mealCut)}`} valueColor={COL.red} />
                  </View>
                </View>
              )}

            </View>{/* koniec kolumny lewej */}

                        {/* ── KOLUMNA PRAWA ── */}
            <View style={{ flex: 1 }}>

              {/* Noclegi */}
              {nights.length > 0 && (
                <View style={{ borderRadius: 6, overflow: "hidden", borderWidth: 1, borderColor: COL.grey }}>
                  <SectionHeader>🏨  Noclegi</SectionHeader>
                  <View style={{ padding: "5 10", gap: 2 }}>
                    {nightsRows.map((r, i) => (
                      <InfoRow key={i} label={r.label} value={r.value} />
                    ))}
                    <View style={{ borderTopWidth: 1, borderTopColor: COL.grey, marginVertical: 2 }} />
                    <InfoRow label="Łącznie noclegi" value={fmtMoney(nightsTotal)} valueColor={COL.black} />
                  </View>
                </View>
              )}

              {/* Inne koszty */}
              {extraCosts && extraCosts.length > 0 && (
                <View style={{ marginTop: 6, borderRadius: 6, overflow: "hidden", borderWidth: 1, borderColor: COL.grey }}>
                  <SectionHeader>📎  Inne koszty</SectionHeader>
                  <View style={{ padding: "5 10", gap: 2 }}>
                    {extraCosts.filter(x => x.desc || x.amount).map((x, i) => (
                      <InfoRow key={i}
                        label={x.desc || `Koszt ${i + 1}`}
                        value={fmtMoney(parseFloat(x.amount) || 0)}
                      />
                    ))}
                    <View style={{ borderTopWidth: 1, borderTopColor: COL.grey, marginVertical: 2 }} />
                    <InfoRow label="Łącznie inne koszty" value={fmtMoney(extraTotal)} />
                  </View>
                </View>
              )}

              {/* ── Podsumowanie ── */}
              <View style={{ marginTop: 6, borderRadius: 6, overflow: "hidden", borderWidth: 2, borderColor: COL.green }}>
                <View style={{
                  backgroundColor: COL.greenBg,
                  borderBottomWidth: 1,
                  borderBottomColor: COL.green,
                  padding: "8 12",
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}>
                  <Text style={{ fontSize: 9, fontWeight: "bold", color: COL.greenDk, letterSpacing: 1, textTransform: "uppercase" }}>📊  Podsumowanie</Text>
                  <Text style={{ fontSize: 16, fontWeight: "bold", color: COL.green }}>{fmtMoney(gross)}</Text>
                </View>
                <View style={{ padding: "5 12" }}>

                  {/* ── POPRAWKA: dur.label zamiast dur.doby ── */}
                  <Row label={dietaLabel}                          value={`+ ${fmtMoney(dietaBase)}`} />
                  {mealCut > 0 &&
                    <Row label="Pomniejszenia za posiłki"          value={`− ${fmtMoney(mealCut)}`}    valueColor={COL.red} />}
                  {nightsTotal > 0 &&
                    <Row label="Noclegi"                           value={`+ ${fmtMoney(nightsTotal)}`} />}
                  {transportCost > 0 &&
                    <Row label="Transport"                         value={`+ ${fmtMoney(transportCost)}`} />}
                  {extraTotal > 0 &&
                    <Row label="Inne koszty"                       value={`+ ${fmtMoney(extraTotal)}`} />}

                  <Row label="Suma należności" value={fmtMoney(gross)} bold big borderTop />

                  {payCard > 0 &&
                    <Row label="💳 Karta firmowa"    value={`− ${fmtMoney(payCard)}`}    valueColor={COL.red} />}
                  {payCash > 0 &&
                    <Row label="💵 Gotówka trenera"  value={`+ ${fmtMoney(payCash)}`}    valueColor={COL.greenDk} />}
                  {payAdvance > 0 &&
                    <Row label="💸 Zaliczka pobrana" value={`− ${fmtMoney(payAdvance)}`} valueColor={COL.red} />}

                  {/* DO WYPŁATY */}
                  <View style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    paddingVertical: 6,
                    marginTop: 4,
                    borderTopWidth: 2,
                    borderTopColor: COL.grey,
                  }}>
                    <Text style={{ fontSize: 10, fontWeight: "bold", color: COL.black }}>DO WYPŁATY / ZWROTU</Text>
                    <Text style={{ fontSize: 13, fontWeight: "bold", color: net < 0 ? COL.red : COL.greenDk }}>{fmtMoney(net)}</Text>
                  </View>

                  {/* Notatka km */}
                  {transport === "car" && km && (
                    <View style={{ marginTop: 4, paddingTop: 4, borderTopWidth: 1, borderTopColor: COL.grey }}>
                      <Text style={{ fontSize: 7, color: COL.greyMid }}>
                        📍 Przebieg pojazdu: {km} km — ewidencja pojazdu
                      </Text>
                    </View>
                  )}

                </View>
              </View>

            </View>{/* koniec kolumny prawej */}
          </View>{/* koniec 2 kolumn */}

          {/* ── Podpisy – więcej miejsca ── */}
          <View style={{ marginTop: 32, flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 10 }}>
            <View style={{ alignItems: "center", width: 200 }}>
              <View style={{ height: 40 }} />
              <View style={{ borderTopWidth: 1, borderTopColor: COL.black, width: "100%", paddingTop: 5 }}>
                <Text style={{ fontSize: 8, color: COL.greyMid, textAlign: "center" }}>Podpis trenera</Text>
              </View>
            </View>
            <View style={{ alignItems: "center", width: 200 }}>
              <View style={{ height: 40 }} />
              <View style={{ borderTopWidth: 1, borderTopColor: COL.black, width: "100%", paddingTop: 5 }}>
                <Text style={{ fontSize: 8, color: COL.greyMid, textAlign: "center" }}>Akceptacja / pieczęć firmy</Text>
              </View>
            </View>
          </View>

        </View>
      </Page>
    </Document>
  );
};

// ─── Eksportowana funkcja ─────────────────────────────────────────────────────
async function fetchBase64(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const blob = await r.blob();
    return await new Promise(res => {
      const reader = new FileReader();
      reader.onload = () => res(reader.result);
      reader.readAsDataURL(blob);
    });
  } catch { return null; }
}

export async function generateDelegationPdf(data) {
  const bgBase64 = await fetchBase64("/firmowy.webp");

  const blob = await pdf(
    <DelegationDocument data={data} bgBase64={bgBase64} />
  ).toBlob();

  const safeName = dePL(data.trainerName || "trener")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_]/g, "");

  const safeDate = (data.date || "").replace(/-/g, "");
  const fileName = `delegacja_${safeName}_${safeDate}.pdf`;

  const url = URL.createObjectURL(blob);
  const a   = document.createElement("a");
  a.href     = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
