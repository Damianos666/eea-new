// ─────────────────────────────────────────────────────────────────────────────
// EXPERT CERT GENERATOR — certyfikaty tytułów eksperckich i ENGEL Certified Master
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Document, Page, Text, Font, Image, pdf, View } from '@react-pdf/renderer';
import QRCode from 'qrcode';

Font.register({
  family: 'Lato',
  fonts: [
    { src: '/fonts/Lato-Regular.ttf' },
    { src: '/fonts/Lato-Bold.ttf', fontWeight: 'bold' },
  ],
});

const MONTHS_PL = [
  "stycznia","lutego","marca","kwietnia","maja","czerwca",
  "lipca","sierpnia","września","października","listopada","grudnia"
];

function fmtDate(dateStr) {
  if (!dateStr) return "";
  const [dd, mm, yyyy] = dateStr.split(".");
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  return `${d.getDate()} ${MONTHS_PL[d.getMonth()]} ${d.getFullYear()}`;
}

// react-pdf nie obsługuje emoji — mapujemy na litery SVG-friendly
const TYPE_SYMBOL = {
  tech:    "PE",   // Process Expert
  ur:      "ME",   // Maintenance Expert
  maszyny: "OE",   // Operation Expert
  master:  "CM",   // Certified Master
};

const TYPE_SUBLABEL = {
  tech:    "PROCESS EXPERT",
  ur:      "MAINTENANCE EXPERT",
  maszyny: "OPERATION EXPERT",
  master:  "CERTIFIED MASTER",
};

const PALETTE = {
  tech:    { accent: "#3B6D11", accentLight: "#EAF3DE", accentMid: "#6FAD2A", label: "PROCESS"    },
  ur:      { accent: "#7A4500", accentLight: "#FDF0DC", accentMid: "#C47A1E", label: "MAINTENANCE" },
  maszyny: { accent: "#8B1A1A", accentLight: "#FDEAEA", accentMid: "#C43C3C", label: "OPERATION"  },
  master:  { accent: "#3D2070", accentLight: "#F0EAFE", accentMid: "#7C5CC0", label: "MASTER"      },
};

// Landscape A4
const W = 842;
const H = 595;
const PAD = 48;

// Generuje QR jako data:image/png;base64 przez qrcode lib
async function makeQR(url) {
  try {
    return await QRCode.toDataURL(url, {
      width: 90, margin: 1,
      color: { dark: "#1A1A1A", light: "#FFFFFF" },
    });
  } catch {
    return null;
  }
}

// ─── KOMPONENT PDF ────────────────────────────────────────────────────────────
const ExpertCertDocument = ({
  participantName, sub, titleLabel, titleType,
  certId, earnedDate, logoBase64, qrBase64,
}) => {
  const pal      = PALETTE[titleType] || PALETTE.master;
  const isMaster = titleType === "master";
  const symbol   = TYPE_SYMBOL[titleType] || "EX";
  const sublabel = TYPE_SUBLABEL[titleType] || "EXPERT";

  return (
    <Document hyphenationCallback={w => [w]}>
      <Page size="A4" orientation="landscape" style={{ padding: 0, margin: 0, fontFamily: "Lato" }}>
        <View style={{ width: W, height: H, backgroundColor: "#FFFFFF" }}>

          {/* ── Lewy kolorowy pasek (8 pt) ── */}
          <View style={{ position:"absolute", left:0, top:0, width:8, height:H, backgroundColor: pal.accent }}/>

          {/* ── Górna czarna belka ── */}
          <View style={{
            position:"absolute", left:8, top:0, width:W-8, height:60,
            backgroundColor:"#1A1A1A",
            flexDirection:"row", alignItems:"center",
            paddingLeft:PAD, paddingRight:PAD,
          }}>
            {logoBase64
              ? <Image src={logoBase64} style={{ height:20, objectFit:"contain" }}/>
              : <Text style={{ fontSize:18, fontWeight:"bold", color:"#FFFFFF", letterSpacing:4 }}>ENGEL</Text>
            }
            <View style={{ flex:1 }}/>
            <Text style={{ fontSize:8, color:"rgba(255,255,255,0.45)", letterSpacing:2 }}>EXPERT ACADEMY</Text>
          </View>

          {/* ── Kolorowa kreska pod belką ── */}
          <View style={{ position:"absolute", left:8, top:60, width:W-8, height:4, backgroundColor: pal.accent }}/>

          {/* ════════════════════════════════════════════════════════════════ */}
          {/*  LEWA KOLUMNA — treść (szerokość ~560 pt)                       */}
          {/* ════════════════════════════════════════════════════════════════ */}
          <View style={{
            position:"absolute", left:PAD+8, top:88,
            width:540,
          }}>

            {/* Etykieta nad tytułem */}
            <Text style={{
              fontSize:8, fontWeight:"bold", color: pal.accent,
              letterSpacing:3, marginBottom:10,
            }}>
              {isMaster ? "CERTYFIKAT TYTUŁU" : "CERTYFIKAT TYTUŁU EKSPERCKIEGO"}
            </Text>

            {/* Tytuł główny */}
            <Text style={{
              fontSize: isMaster ? 34 : 28,
              fontWeight:"bold", color:"#1A1A1A",
              letterSpacing:0.3, marginBottom:6,
            }}>
              {titleLabel}
            </Text>

            {/* Kolor akcentujący — kreska pod tytułem */}
            <View style={{ width:56, height:3, backgroundColor: pal.accent, marginBottom:24 }}/>

            {/* Tekst potwierdzenia */}
            <Text style={{ fontSize:11, color:"#666666", marginBottom:8 }}>
              Niniejszy certyfikat potwierdza, że
            </Text>

            {/* Imię i nazwisko */}
            <Text style={{
              fontSize:26, fontWeight:"bold", color:"#1A1A1A",
              marginBottom: sub ? 4 : 20,
            }}>
              {participantName}
            </Text>

            {sub ? (
              <Text style={{ fontSize:11, color:"#888888", marginBottom:22 }}>{sub}</Text>
            ) : null}

            {/* Opis ukończenia */}
            {isMaster ? (
              <Text style={{ fontSize:11, color:"#444444", lineHeight:1.7, maxWidth:500 }}>
                {'ukończył(a) z wynikiem pozytywnym wszystkie szkolenia technologiczne, utrzymania ruchu\noraz obsługi maszyn ENGEL — zdobywając tym samym trzy tytuły eksperckie\ni najwyższe wyróżnienie ENGEL Expert Academy.'}
              </Text>
            ) : (
              <Text style={{ fontSize:11, color:"#444444", lineHeight:1.7, maxWidth:500 }}>
                {'ukończył(a) z wynikiem pozytywnym pełny program szkoleń z kategorii '}
                <Text style={{ fontWeight:"bold", color: pal.accent }}>{pal.label}</Text>
                {' realizowanych przez ENGEL Expert Academy.'}
              </Text>
            )}

          </View>

          {/* ════════════════════════════════════════════════════════════════ */}
          {/*  PRAWA KOLUMNA — emblemat (pozycja absolutna, prawa strona)     */}
          {/* ════════════════════════════════════════════════════════════════ */}
          <View style={{
            position:"absolute", right: PAD, top: 90,
            width:140, alignItems:"center",
          }}>
            {/* Koło z akronimem */}
            <View style={{
              width:100, height:100, borderRadius:50,
              backgroundColor: pal.accentLight,
              borderWidth:2.5, borderColor: pal.accent, borderStyle:"solid",
              alignItems:"center", justifyContent:"center",
              marginBottom:10,
            }}>
              <Text style={{
                fontSize: isMaster ? 20 : 22,
                fontWeight:"bold", color: pal.accent,
                letterSpacing:2,
              }}>{symbol}</Text>
            </View>

            <Text style={{
              fontSize:7, fontWeight:"bold", color: pal.accent,
              letterSpacing:1.5, textAlign:"center",
            }}>{sublabel}</Text>

            {/* QR code */}
            {qrBase64 && (
              <View style={{ marginTop:20, alignItems:"center" }}>
                <Image src={qrBase64} style={{ width:72, height:72 }}/>
                <Text style={{ fontSize:6, color:"#AAAAAA", marginTop:4, letterSpacing:0.5, textAlign:"center" }}>
                  WERYFIKACJA
                </Text>
              </View>
            )}
          </View>

          {/* ════════════════════════════════════════════════════════════════ */}
          {/*  DOLNA CZARNA BELKA                                              */}
          {/* ════════════════════════════════════════════════════════════════ */}
          <View style={{
            position:"absolute", left:8, bottom:0,
            width:W-8, height:58,
            backgroundColor:"#1A1A1A",
            flexDirection:"row", alignItems:"center",
            paddingLeft:PAD, paddingRight:PAD,
          }}>
            {/* Data */}
            <View>
              <Text style={{ fontSize:7, color:"rgba(255,255,255,0.4)", letterSpacing:1.5, marginBottom:4 }}>
                DATA PRZYZNANIA
              </Text>
              <Text style={{ fontSize:11, fontWeight:"bold", color:"#FFFFFF", letterSpacing:0.3 }}>
                {fmtDate(earnedDate)}
              </Text>
            </View>

            <View style={{ flex:1 }}/>

            {/* Podpis ENGEL */}
            <View style={{ alignItems:"center" }}>
              <View style={{ width:110, height:0.5, backgroundColor:"rgba(255,255,255,0.25)", marginBottom:5 }}/>
              <Text style={{ fontSize:7, color:"rgba(255,255,255,0.45)", letterSpacing:1 }}>ENGEL AUSTRIA GmbH</Text>
            </View>

            <View style={{ flex:1 }}/>

            {/* Nr certyfikatu */}
            <View style={{ alignItems:"flex-end" }}>
              <Text style={{ fontSize:7, color:"rgba(255,255,255,0.4)", letterSpacing:1.5, marginBottom:4 }}>
                NR CERTYFIKATU
              </Text>
              <Text style={{ fontSize:12, fontWeight:"bold", color: pal.accentMid, letterSpacing:2.5 }}>
                {certId}
              </Text>
            </View>
          </View>

        </View>
      </Page>
    </Document>
  );
};

// ─── GŁÓWNA FUNKCJA ───────────────────────────────────────────────────────────
export async function generateExpertCertificate({
  participantName, sub, titleLabel, titleType, certId, earnedDate,
}) {
  const verifyUrl = `https://engelexpert.academy/verify/${certId}`;

  // Logo i QR generujemy równolegle
  const [logoBase64, qrBase64] = await Promise.all([
    fetch("/logo.png")
      .then(r => r.blob())
      .then(b => new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload  = () => res(reader.result);
        reader.onerror = () => res(null);
        reader.readAsDataURL(b);
      }))
      .catch(() => null),
    makeQR(verifyUrl),
  ]);

  const blob = await pdf(
    <ExpertCertDocument
      participantName={participantName}
      sub={sub}
      titleLabel={titleLabel}
      titleType={titleType}
      certId={certId}
      earnedDate={earnedDate}
      logoBase64={logoBase64}
      qrBase64={qrBase64}
    />
  ).toBlob();

  const plMap = { ą:"a",ę:"e",ś:"s",ź:"z",ż:"z",ó:"o",ł:"l",ć:"c",ń:"n",
                  Ą:"A",Ę:"E",Ś:"S",Ź:"Z",Ż:"Z",Ó:"O",Ł:"L",Ć:"C",Ń:"N" };
  const dePL = str => str.replace(/[ąęśźżółćńĄĘŚŹŻÓŁĆŃ]/g, c => plMap[c] || c);

  const safeName  = dePL(participantName).replace(/\s+/g,"_").replace(/[^a-zA-Z0-9_]/g,"");
  const typeLabel = titleType === "master" ? "Master" : `Expert_${titleType}`;
  const fileName  = `${safeName}_${typeLabel}_${certId}.pdf`;

  const url = URL.createObjectURL(blob);
  const a   = document.createElement("a");
  a.href    = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
