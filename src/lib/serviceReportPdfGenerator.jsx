// ─────────────────────────────────────────────────────────────────────────────
// SERVICE REPORT PDF GENERATOR v5
// A4 portrait · Helvetica Neue (jak reszta aplikacji)
// tło: fetch("/firmowy.webp") — identycznie jak delegationPdfGenerator
// layout sterowany przez src/config/serviceReportConfig.js
// ─────────────────────────────────────────────────────────────────────────────

import React from "react";
import { Document, Page, Text, Font, View, Image, pdf } from "@react-pdf/renderer";
import cfg from "../config/serviceReportConfig";

// react-pdf nie obsługuje "Helvetica Neue" z systemu, ale "Helvetica" jest
// wbudowana w każdy PDF viewer i wygląda identycznie na ekranie.
// Nie rejestrujemy żadnej czcionki — domyślna czcionka react-pdf to Helvetica.

// ─── Helpers ──────────────────────────────────────────────────────────────────
const plMap = {
  ą:"a",ę:"e",ś:"s",ź:"z",ż:"z",ó:"o",ł:"l",ć:"c",ń:"n",
  Ą:"A",Ę:"E",Ś:"S",Ź:"Z",Ż:"Z",Ó:"O",Ł:"L",Ć:"C",Ń:"N",
};
const dePL = str => (str||"").replace(/[ąęśźżółćńĄĘŚŹŻÓŁĆŃ]/g, c => plMap[c]||c);

function diffTime(a, b) {
  if (!a || !b) return "-";
  const [ah,am] = a.split(":").map(Number);
  const [bh,bm] = b.split(":").map(Number);
  const mins = (bh*60+bm)-(ah*60+am);
  if (mins <= 0) return "-";
  return `${String(Math.floor(mins/60)).padStart(2,"0")}:${String(mins%60).padStart(2,"0")}`;
}

function totalHoursLabel(rows) {
  let total = 0;
  for (const r of rows) {
    if (r.mode === "depOnly" || r.mode === "retOnly") continue;
    if (!r.arrTime || !r.retDepTime) continue;
    const [ah,am] = r.arrTime.split(":").map(Number);
    const [bh,bm] = r.retDepTime.split(":").map(Number);
    const d = (bh*60+bm)-(ah*60+am);
    if (d > 0) total += d;
  }
  const h = Math.floor(total/60), m = total%60;
  return `${h},${String(Math.round(m/60*100)).padStart(2,"0")} godz`;
}

// ─── Kolory ───────────────────────────────────────────────────────────────────
const COL = {
  black:   "#1A1A1A",
  green:   "#8AB73E",
  greenDk: "#6E9430",
  grey:    "#D0D0D0",
  greyMid: "#909090",
  white:   "#FFFFFF",
};

// ─── Style komórek ────────────────────────────────────────────────────────────
const cell = (ex={}) => ({
  fontSize: cfg.table.fontSize,
  padding:"3 3",
  borderRightWidth:0.5, borderRightColor:COL.grey,
  color:COL.black, ...ex,
});
const hdr = (ex={}) => ({
  ...cell(),
  fontSize: cfg.table.headerFontSize,
  fontWeight:"bold",
  backgroundColor:"rgba(138,183,62,0.15)", ...ex,
});

// ─── Ładowanie tła ────────────────────────────────────────────────────────────


// ─── Dokument PDF ─────────────────────────────────────────────────────────────
const ServiceReportDoc = ({ data, bgBase64 }) => {
  const {
    clientName="", clientAddress="", clientCity="",
    signerName="", signatureDate="",
    technicianName="",
    rows=[],
    workDescription="", clientNotes="",
    clientSig=null, technicianSig=null,
    reportVersion="v1",
  } = data;

  const S = cfg.content.paddingSide;
  const hS = cfg.header.paddingSide;

  return (
    <Document>
      <Page size="A4" orientation="portrait"
        style={{ padding:0, backgroundColor:COL.white, position:"relative" }}>

        {/* Tło firmowe */}
        {bgBase64 && cfg.background.enabled && (
          <Image src={bgBase64} style={{
            position:"absolute", top:0, left:0,
            width:"100%", height:"100%",
            objectFit:"cover",
          }} fixed />
        )}

        {/* ══ NAGŁÓWEK ════════════════════════════════════════════════════════ */}
        <View style={{
          padding:`${cfg.header.paddingTop} ${hS} ${cfg.header.paddingBottom}`,
          borderBottomWidth:2, borderBottomColor:COL.green,
          backgroundColor:"rgba(255,255,255,0.93)",
        }}>
          <View style={{ flexDirection:"row", justifyContent:"space-between", alignItems:"flex-start" }}>
            <View style={{ flex:1 }}>
              <Text style={{ fontSize:cfg.header.titleFontSize, fontWeight:"bold", color:COL.black, marginBottom:2 }}>
                RAPORT SERWISOWY
              </Text>
              <Text style={{ fontSize:7, color:COL.greyMid }}>Report {reportVersion}</Text>
            </View>
            <View style={{ alignItems:"flex-end" }}>
              <Text style={{ fontSize:cfg.header.clientFontSize, fontWeight:"bold", color:COL.black }}>{dePL(clientName)||"-"}</Text>
              {clientAddress ? <Text style={{ fontSize:8, color:COL.black }}>{dePL(clientAddress)}</Text> : null}
              {clientCity    ? <Text style={{ fontSize:8, color:COL.black }}>{dePL(clientCity)}</Text>    : null}
            </View>
          </View>
        </View>

        {/* ══ META ════════════════════════════════════════════════════════════ */}
        <View style={{
          flexDirection:"row",
          padding:`${cfg.meta.paddingVertical} ${cfg.meta.paddingSide}`,
          backgroundColor:"rgba(255,255,255,0.85)",
          borderBottomWidth:0.5, borderBottomColor:COL.grey,
        }}>
          <View style={{ flexDirection:"row", gap:4, flex:1 }}>
            <Text style={{ fontSize:cfg.meta.fontSize, color:COL.greyMid }}>Zamawiajacy:</Text>
            <Text style={{ fontSize:cfg.meta.fontSize, fontWeight:"bold", color:COL.black }}>{dePL(clientName)||"-"}</Text>
          </View>
          <View style={{ flexDirection:"row", gap:4, flex:1 }}>
            <Text style={{ fontSize:cfg.meta.fontSize, color:COL.greyMid }}>Technik serwisu:</Text>
            <Text style={{ fontSize:cfg.meta.fontSize, fontWeight:"bold", color:COL.black }}>{dePL(technicianName)||"-"}</Text>
          </View>
        </View>

        {/* ══ TREŚĆ ═══════════════════════════════════════════════════════════ */}
        <View style={{ padding:`${cfg.content.paddingTop} ${S} ${cfg.content.paddingBottom}` }}>

          {/* Tabela wyjazdów */}
          <Text style={{ fontSize:8, fontWeight:"bold", color:COL.black, marginBottom:4 }}>
            Zestawienie wyjazdow:
          </Text>
          <View style={{ borderWidth:0.5, borderColor:COL.grey, marginBottom:6, backgroundColor:"rgba(255,255,255,0.96)" }}>
            <View style={{ flexDirection:"row", borderBottomWidth:0.5, borderBottomColor:COL.grey }}>
              <Text style={{ ...hdr(), width:"5%",  textAlign:"center" }}>Lp.</Text>
              <Text style={{ ...hdr(), width:"11%", textAlign:"center" }}>Data</Text>
              <Text style={{ ...hdr(), width:"9%",  textAlign:"center" }}>Wyjazd</Text>
              <Text style={{ ...hdr(), width:"9%",  textAlign:"center" }}>Przyjazd</Text>
              <Text style={{ ...hdr(), width:"8%",  textAlign:"center" }}>Czas</Text>
              <Text style={{ ...hdr(), width:"7%",  textAlign:"center" }}>KM</Text>
              <Text style={{ ...hdr(), width:"9%",  textAlign:"center" }}>Start</Text>
              <Text style={{ ...hdr(), width:"9%",  textAlign:"center" }}>Koniec</Text>
              <Text style={{ ...hdr(), width:"8%",  textAlign:"center" }}>Praca</Text>
              <Text style={{ ...hdr(), width:"9%",  textAlign:"center" }}>Pow.wyjazd</Text>
              <Text style={{ ...hdr(), width:"9%",  textAlign:"center" }}>Pow.przyjazd</Text>
              <Text style={{ ...hdr(), width:"7%",  textAlign:"center", borderRightWidth:0 }}>Czas</Text>
            </View>
            {rows.map((r, i) => {
              const m = r.mode || "full";
              return (
              <View key={i} style={{
                flexDirection:"row",
                borderBottomWidth: i < rows.length-1 ? 0.5 : 0,
                borderBottomColor:COL.grey,
                backgroundColor: i%2===0 ? "rgba(255,255,255,0.97)" : "rgba(245,245,245,0.97)",
              }}>
                <Text style={{ ...cell(), width:"5%",  textAlign:"center" }}>{i+1}.</Text>
                <Text style={{ ...cell(), width:"11%", textAlign:"center" }}>{r.date||"-"}</Text>
                {/* Wyjazd */}
                <Text style={{ ...cell(), width:"9%",  textAlign:"center" }}>{m!=="retOnly" ? (r.depTime||"-") : ""}</Text>
                <Text style={{ ...cell(), width:"9%",  textAlign:"center" }}>{m!=="retOnly" ? (r.arrTime||"-") : ""}</Text>
                <Text style={{ ...cell(), width:"8%",  textAlign:"center" }}>{m!=="retOnly" ? diffTime(r.depTime,r.arrTime) : ""}</Text>
                {/* KM */}
                <Text style={{ ...cell(), width:"7%",  textAlign:"center" }}>{r.km||"-"}</Text>
                {/* Praca */}
                <Text style={{ ...cell(), width:"9%",  textAlign:"center" }}>{m==="full" ? (r.arrTime||"-") : ""}</Text>
                <Text style={{ ...cell(), width:"9%",  textAlign:"center" }}>{m==="full" ? (r.retDepTime||"-") : ""}</Text>
                <Text style={{ ...cell(), width:"8%",  textAlign:"center", fontWeight:"bold", color:m==="full" ? COL.greenDk : COL.greyMid }}>{m==="full" ? diffTime(r.arrTime,r.retDepTime) : ""}</Text>
                {/* Powrót */}
                <Text style={{ ...cell(), width:"9%",  textAlign:"center" }}>{m!=="depOnly" ? (r.retDepTime||"-") : ""}</Text>
                <Text style={{ ...cell(), width:"9%",  textAlign:"center" }}>{m!=="depOnly" ? (r.retArrTime||"-") : ""}</Text>
                <Text style={{ ...cell(), width:"7%",  textAlign:"center", borderRightWidth:0 }}>{m!=="depOnly" ? diffTime(r.retDepTime,r.retArrTime) : ""}</Text>
              </View>
              );
            })}
          </View>

          {/* Suma */}
          <View style={{ backgroundColor:"rgba(138,183,62,0.12)", borderRadius:3, padding:"4 8", marginBottom:10, alignSelf:"flex-start", borderWidth:0.5, borderColor:COL.green }}>
            <Text style={{ fontSize:8, fontWeight:"bold", color:COL.greenDk }}>
              Laczny czas pracy: {totalHoursLabel(rows)}
            </Text>
          </View>

          {/* Opis pracy + Uwagi */}
          <View style={{ flexDirection:"row", gap:8, marginBottom:10 }}>
            <View style={{ flex:1.6, borderWidth:0.5, borderColor:COL.grey, borderRadius:3, padding:"6 8", minHeight:70, backgroundColor:"rgba(255,255,255,0.95)" }}>
              <Text style={{ fontSize:7.5, fontWeight:"bold", marginBottom:4, color:COL.black }}>Opis wykonanych prac:</Text>
              <Text style={{ fontSize:8, color:COL.black, lineHeight:1.5 }}>{dePL(workDescription)||"-"}</Text>
            </View>
            <View style={{ flex:1, borderWidth:0.5, borderColor:COL.grey, borderRadius:3, padding:"6 8", minHeight:70, backgroundColor:"rgba(255,255,255,0.95)" }}>
              <Text style={{ fontSize:7.5, fontWeight:"bold", marginBottom:4, color:COL.black }}>Uwagi klienta:</Text>
              <Text style={{ fontSize:8, color:COL.black, lineHeight:1.5 }}>{dePL(clientNotes)||""}</Text>
            </View>
          </View>

          {/* Podpisy */}
          <View style={{ flexDirection:"row", gap:8 }}>
            <View style={{ flex:1, borderWidth:0.5, borderColor:COL.grey, borderRadius:3, padding:"8 10", backgroundColor:"rgba(255,255,255,0.95)" }}>
              <Text style={{ fontSize:cfg.signatures.fontSize, fontWeight:"bold", marginBottom:6, color:COL.black }}>Podpis klienta:</Text>
              <View style={{ height:cfg.signatures.signatureBoxHeight, borderWidth:0.5, borderColor:COL.grey, borderRadius:2, overflow:"hidden", marginBottom:4, backgroundColor:COL.white }}>
                {clientSig ? <Image src={clientSig} style={{ width:"100%", height:"100%", objectFit:"contain" }} /> : null}
              </View>
              {signerName    ? <Text style={{ fontSize:7, color:COL.black, textAlign:"center" }}>{dePL(signerName)}</Text>    : null}
              {signatureDate ? <Text style={{ fontSize:cfg.signatures.dateFontSize, color:COL.greyMid, textAlign:"center" }}>{signatureDate}</Text> : null}
            </View>
            <View style={{ flex:1, borderWidth:0.5, borderColor:COL.grey, borderRadius:3, padding:"8 10", backgroundColor:"rgba(255,255,255,0.95)" }}>
              <Text style={{ fontSize:cfg.signatures.fontSize, fontWeight:"bold", marginBottom:6, color:COL.black }}>Podpis technika serwisu:</Text>
              <View style={{ height:cfg.signatures.signatureBoxHeight, borderWidth:0.5, borderColor:COL.grey, borderRadius:2, overflow:"hidden", marginBottom:4, backgroundColor:COL.white }}>
                {technicianSig ? <Image src={technicianSig} style={{ width:"100%", height:"100%", objectFit:"contain" }} /> : null}
              </View>
              <Text style={{ fontSize:7, color:COL.black, textAlign:"center" }}>{dePL(technicianName)||""}</Text>
              {signatureDate ? <Text style={{ fontSize:cfg.signatures.dateFontSize, color:COL.greyMid, textAlign:"center" }}>{signatureDate}</Text> : null}
            </View>
          </View>

          {/* Stopka */}
          <View style={{ marginTop:cfg.footer.marginTop, borderTopWidth:0.5, borderTopColor:"rgba(200,200,200,0.6)", paddingTop:4 }}>
            <Text style={{ fontSize:cfg.footer.fontSize, color:"rgba(120,120,120,0.9)" }}>
              {cfg.footer.text}
            </Text>
          </View>

        </View>
      </Page>
    </Document>
  );
};

// ─── Eksport ──────────────────────────────────────────────────────────────────
export async function generateServiceReportPdf(data) {
  const bgBase64 = cfg.background.enabled ? (cfg.background.data || null) : null;

  const blob = await pdf(
    <ServiceReportDoc data={data} bgBase64={bgBase64} />
  ).toBlob();

  const safeName = dePL(data.clientName||"klient").replace(/\s+/g,"_").replace(/[^a-zA-Z0-9_]/g,"");
  const safeDate = (data.rows?.[0]?.date||"").replace(/\./g,"");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `raport_serwisowy_${safeName}_${safeDate}.pdf`; a.click();
  URL.revokeObjectURL(url);
}
