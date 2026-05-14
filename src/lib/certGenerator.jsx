// ─────────────────────────────────────────────────────────────────────────────
// CERT GENERATOR — @react-pdf/renderer
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Document, Page, Text, Image, Font, pdf, View } from '@react-pdf/renderer';
import { fetchCertTemplateAsBase64 } from "./certTemplates";
import { TRAININGS } from "../data/trainings";
import { TRAINERS as TRAINER_NAMES } from "./constants";

Font.register({
  family: 'Lato',
  fonts: [
    { src: '/fonts/Lato-Regular.ttf' },
    { src: '/fonts/Lato-Bold.ttf', fontWeight: 'bold' },
  ],
});

const TRAINER_ORIENTATION = {
  1: 'portrait',   // Sylwester Klimek
  2: 'portrait',   // Adam Laskowski
  3: 'portrait',   // Michał Michałowski
  4: 'portrait',   // Damian Świderski
  5: 'portrait',   // Marcin Bednarczyk
};

function getDays(trainingId) {
  const training = TRAININGS.find(t => t.id === trainingId);
  if (!training) return 1;
  return parseInt(training.duration, 10) || 1;
}

const MONTHS_PL = [
  "stycznia","lutego","marca","kwietnia","maja","czerwca",
  "lipca","sierpnia","września","października","listopada","grudnia"
];

function fmt(d) {
  return `${d.getDate()} ${MONTHS_PL[d.getMonth()]} ${d.getFullYear()}`;
}

function parseDDMMYYYY(str) {
  const [dd, mm, yyyy] = str.split(".");
  return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
}

// ─────────────────────────────────────────────────────────────────────────────
// POZYCJE — stałe wartości w pt (nie procenty!)
//   Portrait:  W=595  H=842
//   Landscape: W=842  H=595
//
// Jak dostosować pozycję elementu:
//   top   = odległość od góry strony w pt
//   left  = odległość od lewej strony w pt
//   right = odległość od prawej strony w pt (alternatywa dla left)
//   width = szerokość bloku w pt
// ─────────────────────────────────────────────────────────────────────────────
const PORTRAIT_CFG = {
  certName:    { top: 370, left: 60,  width: 476, fontSize: 22, fontWeight: 'bold',   color: '#1a1a1a', letterSpacing: 1 },
  certConfirm: { top: 490, left: 60,  width: 476, fontSize: 12,                        color: '#555555', letterSpacing: 0.5 },
  certTitle:   { top: 510, left: 60,  width: 476, fontSize: 20, fontWeight: 'bold',   color: '#1a1a1a', lineHeight: 1.35 },
  certDates:   { top: 600, left: 60,  width: 476, fontSize: 10,                       color: '#444444' },
  trainerName: { top: 710, right: 42, width: 149, fontSize: 9,  fontWeight: 'bold',   color: '#1a1a1a' },
  trainerLabel:{ top: 730, right: 42, width: 149, fontSize: 8,                        color: '#555555' },
  certNumLabel:{ top: 800, left: 60,  width: 476, fontSize: 7,  fontWeight: 'bold',   color: '#999999', letterSpacing: 1.5 },
  certNum:     { top: 812, left: 60,  width: 476, fontSize: 9,                        color: '#666666', letterSpacing: 2 },
};

const LANDSCAPE_CFG = {
  certName:    { top: 334, left: 168, width: 505, fontSize: 22, fontWeight: 'bold',   color: '#1a1a1a', letterSpacing: 1 },
  certConfirm: { top: 448, left: 181, width: 480, fontSize: 8.5,                      color: '#555555', letterSpacing: 0.5 },
  certTitle:   { top: 476, left: 202, width: 438, fontSize: 13, fontWeight: 'bold',   color: '#1a1a1a', lineHeight: 1.35 },
  certDates:   { top: 548, left: 202, width: 438, fontSize: 9,                        color: '#444444' },
  trainerName: { top: 570, right: 42, width: 168, fontSize: 9,  fontWeight: 'bold',   color: '#1a1a1a' },
  trainerLabel:{ top: 576, right: 42, width: 168, fontSize: 8,                        color: '#555555' },
  certNumLabel:{ top: 558, left: 202, width: 438, fontSize: 7,  fontWeight: 'bold',   color: '#999999', letterSpacing: 1.5 },
  certNum:     { top: 568, left: 202, width: 438, fontSize: 9,                        color: '#666666', letterSpacing: 2 },
};

// ─── KOMPONENT PDF ────────────────────────────────────────────────────────────
const CertificateDocument = ({ participantName, trainingTitle, dateRange, backgroundSrc, trainerName, orientation, certId }) => {
  const isLandscape = orientation === 'landscape';
  const W = isLandscape ? 842 : 595;
  const H = isLandscape ? 595 : 842;
  const cfg = isLandscape ? LANDSCAPE_CFG : PORTRAIT_CFG;

  // Helper — absolutnie pozycjonowany kontener + tekst wewnątrz (bez position na Text)
  const Block = ({ k, children }) => {
    const p = cfg[k];
    return (
      <View style={{
        position: 'absolute',
        top:   p.top,
        left:  p.left,
        right: p.right,
        width: p.width,
      }}>
        <Text style={{
          fontFamily:    'Lato',
          textAlign:     'center',
          fontSize:      p.fontSize,
          fontWeight:    p.fontWeight    || 'normal',
          color:         p.color         || '#000',
          letterSpacing: p.letterSpacing || 0,
          lineHeight:    p.lineHeight    || 1,
        }}>{children}</Text>
      </View>
    );
  };

  return (
    <Document>
      <Page size="A4" orientation={orientation} style={{ padding: 0, margin: 0 }}>

        {/*
          ── KLUCZOWE ──────────────────────────────────────────────────────────
          Jeden root <View> z jawną szerokością i wysokością (W × H pt).
          NIE ma position:'absolute' — to normalny element flow,
          który zajmuje dokładnie jedną stronę.
          Wewnątrz: tło i teksty — oba jako position:'absolute' względem tego View.
          ─────────────────────────────────────────────────────────────────────
        */}
        <View wrap={false} style={{ width: W, height: H, overflow: 'hidden' }}>

          {/* Tło */}
          {backgroundSrc && (
            <Image
              src={backgroundSrc}
              style={{ position: 'absolute', top: 0, left: 0, width: W, height: H }}
            />
          )}

          {/* Teksty */}
          <Block k="certName">{participantName}</Block>
          <Block k="certConfirm">Potwierdzamy uczestnictwo w szkoleniu</Block>
          <Block k="certTitle">{trainingTitle}</Block>
          <Block k="certDates">{dateRange}</Block>

          {trainerName && (
            <>
              <Block k="trainerName">{trainerName}</Block>
              <Block k="trainerLabel">Trener</Block>
            </>
          )}

          {certId && (
            <>
              <Block k="certNumLabel">NR CERTYFIKATU</Block>
              <Block k="certNum">{certId}</Block>
            </>
          )}

        </View>
      </Page>
    </Document>
  );
};

// ─── GŁÓWNA FUNKCJA ───────────────────────────────────────────────────────────
export async function generateCertificate({ participantName, trainingTitle, certId, parsedCode, token }) {
  const trainer = {
    name:        TRAINER_NAMES[parsedCode.trainerNum] || null,
    orientation: TRAINER_ORIENTATION[parsedCode.trainerNum] || 'portrait',
  };
  const bg        = await fetchCertTemplateAsBase64(parsedCode.trainerNum, token);
  const endDate   = parseDDMMYYYY(parsedCode.date);
  const days      = parseInt(parsedCode.duration, 10) || getDays(parsedCode.prefix);
  const startDate = new Date(endDate);
  startDate.setDate(endDate.getDate() - (days - 1));

  const dateRange = days === 1
    ? fmt(endDate)
    : `od ${fmt(startDate)} do ${fmt(endDate)}`;

  const blob = await pdf(
    <CertificateDocument
      participantName={participantName}
      trainingTitle={trainingTitle}
      dateRange={dateRange}
      backgroundSrc={bg}
      trainerName={trainer.name}
      orientation={trainer.orientation}
      certId={certId || null}
    />
  ).toBlob();

  // Zamiana polskich znaków na ASCII
  const plMap = { ą:'a',ę:'e',ś:'s',ź:'z',ż:'z',ó:'o',ł:'l',ć:'c',ń:'n',
                  Ą:'A',Ę:'E',Ś:'S',Ź:'Z',Ż:'Z',Ó:'O',Ł:'L',Ć:'C',Ń:'N' };
  const dePL = str => str.replace(/[ąęśźżółćńĄĘŚŹŻÓŁĆŃ]/g, c => plMap[c] || c);

  // safeName: polskie znaki → ASCII, spacje → _, reszta specjalna usunięta
  const safeName = dePL(participantName)
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '');

  // Kod szkolenia: dla zwykłego bierzemy prefix (np. "RTM-viper"),
  // dla specjalnego sanityzujemy tytuł szkolenia
  const trainingCode = parsedCode.isSpecial
    ? dePL(trainingTitle).replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '')
    : parsedCode.prefix;                  // np. "RTM-viper" — zostawiamy myślnik

  // Data z parsedCode.date (DD.MM.YYYY) → DD-MM-YYYY
  const safeDate = parsedCode.date.replace(/\./g, '-');

  const fileName = `${safeName}_${trainingCode}_${safeDate}.pdf`;

  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
