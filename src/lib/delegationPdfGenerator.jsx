// ─────────────────────────────────────────────────────────────────────────────
// DELEGATION PDF GENERATOR — @react-pdf/renderer
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

function generateDocNumber() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  return `DEL/${date}`;
}

function fmtDatetime() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getDate()} ${MONTHS_PL[now.getMonth()]} ${now.getFullYear()}, ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

const plMap = {
  ą:"a",ę:"e",ś:"s",ź:"z",ż:"z",ó:"o",ł:"l",ć:"c",ń:"n",
  Ą:"A",Ę:"E",Ś:"S",Ź:"Z",Ż:"Z",Ó:"O",Ł:"L",Ć:"C",Ń:"N",
};
const dePL = str => str.replace(/[ąęśźżółćńĄĘŚŹŻÓŁĆŃ]/g, c => plMap[c] || c);

// ─── Kolory ───────────────────────────────────────────────────────────────────
const COL = {
  black:   "#1A1A1A",
  green:   "#8AB73E",
  greenDk: "#6E9430",
  greenBg: "#F0F7E0",
  grey:    "#E8E8E8",
  greyMid: "#A0A0A0",
  greyBg:  "#F4F4F4",
  white:   "#FFFFFF",
  red:     "#C0392B",
  blue:    "#2980B9",
};

// ─── Komponenty ───────────────────────────────────────────────────────────────
const SectionHeader = ({ children }) => (
  <View style={{
    backgroundColor: COL.greyBg,
    borderBottomWidth: 1,
    borderBottomColor: COL.grey,
    padding: "5 10",
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

// ── InfoRow: bold i noBorderBottom = zero linii na dole ──
const InfoRow = ({ label, value, valueColor, bold, noBorderBottom }) => (
  <View style={{
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2,
    // brak linii gdy: ostatni przed separatorem LUB wiersz "Łącznie" (bold)
    borderBottomWidth: (noBorderBottom || bold) ? 0 : 1,
    borderBottomColor: COL.grey,
  }}>
    <Text style={{
      fontFamily: "Lato",
      fontSize: 8,
      color: bold ? COL.black : COL.greyMid,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      fontWeight: bold ? "bold" : "normal",
    }}>
      {label}
    </Text>
    <Text style={{
      fontFamily: "Lato",
      fontSize: 8,
      fontWeight: bold ? "bold" : "normal",
      color: valueColor || COL.black,
    }}>
      {value}
    </Text>
  </View>
);

// ── Separator: jedna gruba czarna kreska przed "Łącznie" ──
const SectionSeparator = () => (
  <View style={{
    borderTopWidth: 2,
    borderTopColor: COL.black,
    marginTop: 4,
    marginBottom: 2,
  }} />
);

// ── Podwójny separator przed "DO WYPŁATY" ──
const DoubleSeparator = () => (
  <>
    <View style={{ borderTopWidth: 2, borderTopColor: COL.black, marginTop: 6 }} />
    <View style={{ borderTopWidth: 2, borderTopColor: COL.black, marginTop: 3 }} />
  </>
);

// ── Row bez borderTop (separator zastępuje) ──
const Row = ({ label, value, valueColor, bold, big, noBorderBottom }) => (
  <View style={{
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
    borderBottomWidth: noBorderBottom ? 0 : 1,
    borderBottomColor: COL.grey,
  }}>
    <Text style={{
      fontFamily: "Lato",
      fontSize: big ? 9 : 8,
      color: bold ? COL.black : COL.greyMid,
      fontWeight: bold ? "bold" : "normal",
    }}>
      {label}
    </Text>
    <Text style={{
      fontFamily: "Lato",
      fontSize: big ? 10 : 8,
      fontWeight: bold ? "bold" : "normal",
      color: valueColor || COL.black,
    }}>
      {value}
    </Text>
  </View>
);

// ─── Główny dokument PDF ──────────────────────────────────────────────────────
const DelegationDocument = ({ data, bgBase64, docNumber, generatedAt }) => {
  const {
    trainerName, trainingTitle, tripPurpose,
    date, endDate,
    origin, destination,
    depDate, depTime, retDate, retTime,
    transport, km, plate, ticketCost, ticketRoute, otherCost, otherDesc,
    extraCosts = [], extraTotal = 0,
    nights,
    meals,
    payCard, payAdvance,
    dur, dietaBase, mealCut, nightsTotal, transportCost, gross, net,
  } = data;

  const transportLabel =
    transport === "car"
      ? `Pojazd służbowy${km ? ` · ${km} km` : ""}${plate ? ` · ${plate}` : ""}`
      : transport === "train"
      ? `Pociąg/Bus${ticketRoute ? ` · ${ticketRoute}` : ""}`
      : otherDesc || "Inne";

  const transportCostStr =
    transport === "car"   ? "— (pojazd służbowy)" :
    transport === "train" ? fmtMoney(parseFloat(ticketCost) || 0) :
    fmtMoney(parseFloat(otherCost) || 0);

  const nightsRows = nights.map((n, i) => ({
    label: `${n.name || "Hotel"} · ${n.type === "ryczalt" ? "ryczałt" : "rachunek"}`,
    value: n.type === "ryczalt" ? fmtMoney(67.5) : fmtMoney(Math.min(n.amount || 0, 900)),
  }));

  const mealsLabels = ["Śniadania", "Obiady", "Kolacje"];
  const mealsCuts   = [11.25, 22.5, 11.25];
  const dietaLabel  = `Dieta (${dur.label})`;

  const activeMeals   = meals.map((cnt, i) => ({ cnt, i })).filter(x => x.cnt > 0);
  const filteredExtra = extraCosts.filter(x => x.desc || x.amount);

  // Pozycje pracownicze (dieta + gotówka + ryczałt noclegi + transport)
  const employeeNightRows = nights.filter(n =>
    n.type === "ryczalt" || (n.type !== "ryczalt" && (n.payMethod || "card") === "cash")
  ).map((n, i) => ({
    label: n.type === "ryczalt"
      ? `${n.name || "Hotel"} · ryczałt`
      : `${n.name || "Hotel"} · gotówka`,
    value: n.type === "ryczalt" ? fmtMoney(67.5) : fmtMoney(Math.min(n.amount || 0, 900)),
  }));
  const employeeExtraRows = extraCosts.filter(x =>
    (x.payMethod || "card") === "cash" && (x.desc || x.amount)
  ).map(x => ({
    label: x.desc || "Koszt dodatkowy",
    value: fmtMoney(parseFloat(x.amount) || 0),
  }));

  // Pozycje kartą firmową (noclegi + inne koszty)
  const cardNightRows = nights.filter(n =>
    n.type !== "ryczalt" && (n.payMethod || "card") === "card" && (n.amount || 0) > 0
  ).map((n, i) => ({
    label: `${n.name || "Hotel"} · karta`,
    value: fmtMoney(Math.min(n.amount || 0, 900)),
  }));
  const cardExtraRows = extraCosts.filter(x =>
    (x.payMethod || "card") === "card" && (x.desc || x.amount)
  ).map(x => ({
    label: x.desc || "Koszt dodatkowy",
    value: fmtMoney(parseFloat(x.amount) || 0),
  }));
  const cardTotal = payCard || 0;
  const advance  = payAdvance || 0;

  return (
    <Document>
      <Page
        size="A4"
        orientation="portrait"
        style={{
          padding: 0,
          paddingTop: 85,   // ~3 cm od góry
          fontFamily: "Lato",
          backgroundColor: COL.white,
          position: "relative",
        }}
      >
        {bgBase64 && (
          <Image
            src={bgBase64}
            style={{
              position: "absolute", top: 0, left: 0,
              width: "100%", height: "100%",
              objectFit: "cover",
            }}
            fixed
          />
        )}

        {/* ── NAGŁÓWEK ── */}
        <View style={{
          backgroundColor: "rgba(255,255,255,0.94)",
          borderBottomWidth: 2,
          borderBottomColor: COL.green,
          padding: "10 14",
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}>
          <View>
            <Text style={{ fontSize: 15, fontWeight: "bold", color: COL.black, letterSpacing: 0.5 }}>
              Rozliczenie delegacji
            </Text>
            {/* ── "Szkolenie wyjazdowe" usunięte ── */}
            <Text style={{ fontSize: 8, color: COL.greyMid, marginTop: 2 }}>
              Podróż służbowa krajowa
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontSize: 9, fontWeight: "bold", color: COL.black, letterSpacing: 0.8 }}>
              {docNumber}
            </Text>
            <Text style={{ fontSize: 7, color: COL.greyMid, marginTop: 2 }}>
              Wygenerowano: {generatedAt}
            </Text>
          </View>
        </View>

        <View style={{ padding: "0 14 14" }}>

          {/* ── BANER GÓRNY ── */}
          <View style={{
            marginTop: 10,
            borderRadius: 6,
            borderWidth: 1,
            borderColor: COL.grey,
            backgroundColor: "rgba(255,255,255,0.90)",
          }}>
            {/* Wiersz 1: Trener + Cel (szeroki, bez Terminu) */}
            <View style={{
              flexDirection: "row",
              padding: "7 12",
              borderBottomWidth: 1,
              borderBottomColor: COL.grey,
            }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 7, color: COL.greyMid, textTransform: "uppercase", letterSpacing: 0.5 }}>Trener</Text>
                <Text style={{ fontSize: 9, fontWeight: "bold", color: COL.black, marginTop: 2 }}>{trainerName}</Text>
              </View>
              <View style={{ flex: 3, paddingHorizontal: 10, borderLeftWidth: 1, borderLeftColor: COL.grey }}>
                <Text style={{ fontSize: 7, color: COL.greyMid, textTransform: "uppercase", letterSpacing: 0.5 }}>Cel podróży</Text>
                <Text style={{ fontSize: 9, fontWeight: "bold", color: COL.black, marginTop: 2 }}>{tripPurpose || trainingTitle}</Text>
              </View>
            </View>

            {/* Wiersz 2: Skąd→Dokąd / Wyjazd / Powrót / Czas trwania / Dieta bazowa */}
            <View style={{ flexDirection: "row", padding: "7 12" }}>
              <View style={{ flex: 1.5, flexDirection: "row", alignItems: "center" }}>
                <View style={{ alignItems: "center" }}>
                  <Text style={{ fontSize: 7, color: COL.greyMid, textTransform: "uppercase", letterSpacing: 0.5 }}>Skąd</Text>
                  <Text style={{ fontSize: 9, fontWeight: "bold", color: COL.black, marginTop: 2 }}>{origin || "—"}</Text>
                </View>
                <Text style={{ fontSize: 12, color: COL.green, fontWeight: "bold", marginHorizontal: 8 }}>→</Text>
                <View style={{ alignItems: "center" }}>
                  <Text style={{ fontSize: 7, color: COL.greyMid, textTransform: "uppercase", letterSpacing: 0.5 }}>Dokąd</Text>
                  <Text style={{ fontSize: 9, fontWeight: "bold", color: COL.black, marginTop: 2 }}>{destination || "—"}</Text>
                </View>
              </View>

              <View style={{ flex: 1.2, paddingHorizontal: 8, borderLeftWidth: 1, borderLeftColor: COL.grey }}>
                <Text style={{ fontSize: 7, color: COL.greyMid, textTransform: "uppercase", letterSpacing: 0.5 }}>Wyjazd</Text>
                <Text style={{ fontSize: 8, fontWeight: "bold", color: COL.black, marginTop: 2 }}>{fmtDate(depDate)}</Text>
                <Text style={{ fontSize: 8, color: COL.greyMid }}>{depTime || ""}</Text>
              </View>

              <View style={{ flex: 1.2, paddingHorizontal: 8, borderLeftWidth: 1, borderLeftColor: COL.grey }}>
                <Text style={{ fontSize: 7, color: COL.greyMid, textTransform: "uppercase", letterSpacing: 0.5 }}>Powrót</Text>
                <Text style={{ fontSize: 8, fontWeight: "bold", color: COL.black, marginTop: 2 }}>{fmtDate(retDate)}</Text>
                <Text style={{ fontSize: 8, color: COL.greyMid }}>{retTime || ""}</Text>
              </View>

              <View style={{ flex: 1.2, paddingHorizontal: 8, borderLeftWidth: 1, borderLeftColor: COL.grey }}>
                <Text style={{ fontSize: 7, color: COL.greyMid, textTransform: "uppercase", letterSpacing: 0.5 }}>Czas trwania</Text>
                <Text style={{ fontSize: 8, fontWeight: "bold", color: COL.black, marginTop: 2 }}>{dur.label || "—"}</Text>
              </View>

              <View style={{ flex: 1, paddingHorizontal: 8, borderLeftWidth: 1, borderLeftColor: COL.grey }}>
                <Text style={{ fontSize: 7, color: COL.greyMid, textTransform: "uppercase", letterSpacing: 0.5 }}>Dieta bazowa</Text>
                <Text style={{ fontSize: 9, fontWeight: "bold", color: COL.greenDk, marginTop: 2 }}>{fmtMoney(dietaBase)}</Text>
              </View>
            </View>
          </View>

          {/* ── Dwie kolumny ── */}
          <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>

            {/* ══ LEWA — koszty ══ */}
            <View style={{ flex: 1 }}>

              {/* Transport */}
              <View style={{ borderRadius: 6, overflow: "hidden", borderWidth: 1, borderColor: COL.grey }}>
                <SectionHeader>🚗  Transport</SectionHeader>
                <View style={{ padding: "5 10", gap: 2 }}>
                  <InfoRow label="Środek" value={transportLabel} />
                  <InfoRow
                    label="Koszt"
                    value={transportCostStr}
                    valueColor={transportCost > 0 ? COL.black : COL.greyMid}
                  />
                  {transport === "car" && km && (
                    <Text style={{ fontSize: 7, color: COL.greyMid, marginTop: 3 }}>
                      📍 Przebieg: {km} km — ewidencja pojazdu
                    </Text>
                  )}
                </View>
              </View>

              {/* Posiłki */}
              {activeMeals.length > 0 && (
                <View style={{ marginTop: 6, borderRadius: 6, overflow: "hidden", borderWidth: 1, borderColor: COL.grey }}>
                  <SectionHeader>🍽  Posiłki (odliczenie)</SectionHeader>
                  <View style={{ padding: "5 10", gap: 2 }}>
                    {activeMeals.map(({ cnt, i }, idx) => (
                      <InfoRow
                        key={i}
                        label={`${mealsLabels[i]} × ${cnt} szt.`}
                        value={`− ${fmtMoney(cnt * mealsCuts[i])}`}
                        valueColor={COL.red}
                        noBorderBottom={idx === activeMeals.length - 1}
                      />
                    ))}
                    <SectionSeparator />
                    <InfoRow
                      label="Łącznie odliczenie"
                      value={`− ${fmtMoney(mealCut)}`}
                      valueColor={COL.red}
                      bold
                    />
                  </View>
                </View>
              )}

              {/* Noclegi */}
              {nights.length > 0 && (
                <View style={{ marginTop: 6, borderRadius: 6, overflow: "hidden", borderWidth: 1, borderColor: COL.grey }}>
                  <SectionHeader>🏨  Noclegi</SectionHeader>
                  <View style={{ padding: "5 10", gap: 2 }}>
                    {nightsRows.map((r, i) => (
                      <InfoRow
                        key={i}
                        label={r.label}
                        value={r.value}
                        noBorderBottom={i === nightsRows.length - 1}
                      />
                    ))}
                    <SectionSeparator />
                    <InfoRow
                      label="Łącznie noclegi"
                      value={fmtMoney(nightsTotal)}
                      bold
                    />
                  </View>
                </View>
              )}

              {/* Inne koszty */}
              {filteredExtra.length > 0 && (
                <View style={{ marginTop: 6, borderRadius: 6, overflow: "hidden", borderWidth: 1, borderColor: COL.grey }}>
                  <SectionHeader>📎  Inne koszty</SectionHeader>
                  <View style={{ padding: "5 10", gap: 2 }}>
                    {filteredExtra.map((x, i) => (
                      <InfoRow
                        key={i}
                        label={x.desc || `Koszt ${i + 1}`}
                        value={fmtMoney(parseFloat(x.amount) || 0)}
                        noBorderBottom={i === filteredExtra.length - 1}
                      />
                    ))}
                    <SectionSeparator />
                    <InfoRow
                      label="Łącznie inne koszty"
                      value={fmtMoney(extraTotal)}
                      bold
                    />
                  </View>
                </View>
              )}
            </View>

            {/* ══ PRAWA — dwa bloki: pracownik + karta ══ */}
            <View style={{ flex: 1, gap: 8 }}>

              {/* ── BLOK 1: Rozliczenie pracownika ── */}
              <View style={{ borderRadius: 6, overflow: "hidden", borderWidth: 2, borderColor: COL.green }}>
                <View style={{
                  backgroundColor: COL.greenBg,
                  borderBottomWidth: 1,
                  borderBottomColor: COL.green,
                  padding: "7 12",
                }}>
                  <Text style={{ fontSize: 8, fontWeight: "bold", color: COL.greenDk, letterSpacing: 1, textTransform: "uppercase" }}>
                    Rozliczenie pracownika
                  </Text>
                </View>

                <View style={{ padding: "6 12" }}>
                  {/* Dieta */}
                  <Row label={dietaLabel} value={`+ ${fmtMoney(dietaBase)}`} />
                  {/* Posiłki */}
                  {mealCut > 0 && (
                    <Row label="Pomniejszenia za posilki" value={`- ${fmtMoney(mealCut)}`} valueColor={COL.red} />
                  )}
                  {/* Noclegi ryczałt + gotówka */}
                  {employeeNightRows.map((r, i) => (
                    <Row key={`en_${i}`} label={r.label} value={`+ ${r.value}`} />
                  ))}
                  {/* Inne koszty gotówka */}
                  {employeeExtraRows.map((r, i) => (
                    <Row key={`ee_${i}`} label={r.label} value={`+ ${r.value}`} />
                  ))}
                  {/* Transport */}
                  {transportCost > 0 && (
                    <Row label="Transport" value={`+ ${fmtMoney(transportCost)}`} />
                  )}
                  {/* Zaliczka */}
                  {advance > 0 && (
                    <Row label="Zaliczka pobrana" value={`- ${fmtMoney(advance)}`} valueColor={COL.red} noBorderBottom />
                  )}

                  <DoubleSeparator />

                  {/* DO ZWROTU / WYPŁATY — wyróżnione */}
                  <View style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    paddingTop: 7,
                    paddingBottom: 4,
                    paddingHorizontal: 6,
                    marginTop: 2,
                    backgroundColor: COL.greenBg,
                    borderRadius: 4,
                  }}>
                    <Text style={{ fontFamily: "Lato", fontSize: 9, fontWeight: "bold", color: COL.greenDk, letterSpacing: 0.4, textTransform: "uppercase" }}>
                      Do zwrotu / wyplaty
                    </Text>
                    <Text style={{ fontFamily: "Lato", fontSize: 15, fontWeight: "bold", color: net < 0 ? COL.red : COL.greenDk }}>
                      {fmtMoney(net)}
                    </Text>
                  </View>

                  {transport === "car" && km && (
                    <View style={{ paddingTop: 4, marginTop: 4, borderTopWidth: 1, borderTopColor: COL.grey }}>
                      <Text style={{ fontSize: 7, color: COL.greyMid }}>
                        Przebieg pojazdu: {km} km — ewidencja pojazdu
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              {/* ── BLOK 2: Rozliczenie karta firmowa (tylko gdy > 0) ── */}
              {cardTotal > 0 && (
                <View style={{ borderRadius: 6, overflow: "hidden", borderWidth: 2, borderColor: COL.blue }}>
                  <View style={{
                    backgroundColor: COL.blueBg,
                    borderBottomWidth: 1,
                    borderBottomColor: COL.blue,
                    padding: "7 12",
                  }}>
                    <Text style={{ fontSize: 8, fontWeight: "bold", color: COL.blueDk, letterSpacing: 1, textTransform: "uppercase" }}>
                      Rozliczenie karta firmowa
                    </Text>
                  </View>

                  <View style={{ padding: "6 12" }}>
                    {/* Noclegi kartą */}
                    {cardNightRows.map((r, i) => (
                      <Row key={`cn_${i}`} label={r.label} value={`+ ${r.value}`} />
                    ))}
                    {/* Inne koszty kartą */}
                    {cardExtraRows.map((r, i) => (
                      <Row
                        key={`ce_${i}`}
                        label={r.label}
                        value={`+ ${r.value}`}
                        noBorderBottom={i === cardExtraRows.length - 1 && cardNightRows.length === 0}
                      />
                    ))}

                    <DoubleSeparator />

                    {/* DO ROZLICZENIA KARTA — wyróżnione */}
                    <View style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      paddingTop: 7,
                      paddingBottom: 4,
                      paddingHorizontal: 6,
                      marginTop: 2,
                      backgroundColor: COL.blueBg,
                      borderRadius: 4,
                    }}>
                      <Text style={{ fontFamily: "Lato", fontSize: 9, fontWeight: "bold", color: COL.blueDk, letterSpacing: 0.4, textTransform: "uppercase" }}>
                        Do rozliczenia karta
                      </Text>
                      <Text style={{ fontFamily: "Lato", fontSize: 15, fontWeight: "bold", color: COL.blue }}>
                        {fmtMoney(cardTotal)}
                      </Text>
                    </View>
                  </View>
                </View>
              )}

            </View>

          </View>

          {/* ── Trzy podpisy ── */}
          <View style={{
            marginTop: 28, flexDirection: "row",
            justifyContent: "space-between", paddingHorizontal: 4,
          }}>
            {[
              { label: "Podpis pracownika",             sub: "(trener)" },
              { label: "Podpis przełożonego",           sub: "(akceptacja merytoryczna)" },
              { label: "Akceptacja formalno-finansowa", sub: "(księgowa / pieczęć firmy)" },
            ].map((sig, i) => (
              <View key={i} style={{ alignItems: "center", width: "30%" }}>
                <View style={{ height: 44 }} />
                <View style={{ borderTopWidth: 1, borderTopColor: COL.black, width: "100%", paddingTop: 4 }}>
                  <Text style={{ fontFamily: "Lato", fontSize: 7.5, fontWeight: "bold", color: COL.black, textAlign: "center" }}>
                    {sig.label}
                  </Text>
                  <Text style={{ fontFamily: "Lato", fontSize: 6.5, color: COL.greyMid, textAlign: "center", marginTop: 1 }}>
                    {sig.sub}
                  </Text>
                </View>
              </View>
            ))}
          </View>

        </View>
      </Page>
    </Document>
  );
};

// ─── Export ───────────────────────────────────────────────────────────────────
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
  const bgBase64    = await fetchBase64("/firmowy.webp");
  const docNumber   = generateDocNumber();
  const generatedAt = fmtDatetime();

  const blob = await pdf(
    <DelegationDocument
      data={data}
      bgBase64={bgBase64}
      docNumber={docNumber}
      generatedAt={generatedAt}
    />
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
