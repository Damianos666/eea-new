import { C } from "../lib/constants";

const TERMS_TITLE = "OGÓLNE WARUNKI ŚWIADCZENIA USŁUG SZKOLENIOWYCH ENGEL Polska Sp. z o.o.";

function Section({ no, title, children }) {
  return (
    <div style={{ marginBottom: 24, paddingLeft: 12, borderLeft: `3px solid ${C.green}` }}>
      <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 10px 0", color: C.black }}>
        {no}. {title}
      </h3>
      <div style={{ fontSize: 13, color: C.greyDk, lineHeight: 1.6, display: "flex", flexDirection: "column", gap: 8 }}>
        {children}
      </div>
    </div>
  );
}

function Item({ no, children }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
      <span style={{ fontWeight: 700, flexShrink: 0 }}>{no}.</span>
      <div style={{ flex: 1, minWidth: 0, msWordWrap: "break-word", wordWrap: "break-word" }}>{children}</div>
    </div>
  );
}

export function TermsPage() {
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
        
        <div style={{ background: C.white, border: `1px solid ${C.grey}`, borderRadius: 10, boxShadow: "0 10px 30px rgba(16,24,40,.08)", overflow: "hidden", width: "100%" }}>
          
          {/* Header */}
          <div style={{ padding: "24px", borderBottom: `4px solid ${C.green}`, background: "#2C2C2C", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
            <h1 style={{ fontSize: 18, color: C.white, margin: 0, flex: 1, lineHeight: 1.4, maxWidth: 600 }}>
              {TERMS_TITLE}
            </h1>
            <img src="/logo-header.png" alt="ENGEL" style={{ height: 28, width: "auto", display: "block" }} />
          </div>

          {/* Body */}
          <div style={{ padding: "28px 24px" }}>

            <Section no={1} title="Zgłoszenie">
              <Item no="1.1">Warunkiem zgłoszenia udziału w Szkoleniu jest przesłanie Organizatorowi przez Zamawiającego – w postaci elektronicznej za pośrednictwem strony <a href="https://www.engelglobal.com/pl" target="_blank" rel="noreferrer" style={{color: C.green, textDecoration: "underline"}}>engelglobal.com/pl</a> lub mailowo – wypełnionego formularza zgłoszeniowego.</Item>
              <Item no="1.2">Złożenie zgłoszenia uczestnictwa w Szkoleniu jest równoznaczne z akceptacją przez Zamawiającego warunków udziału w Szkoleniu, wynikających z zamówienia oraz niniejszych Ogólnych Warunków.</Item>
              <Item no="1.3">Składający zamówienie oświadcza, że jest upoważniony do reprezentowania Zamawiającego i złożenia zamówienia w imieniu i na rzecz Zamawiającego. W przypadku braku takiego upoważnienia Organizatorowi przysługuje prawo do obciążenia osoby składającej zamówienie pełnymi kosztami szkolenia.</Item>
              <Item no="1.4">W przypadku, gdy Uczestnik nie jest jednocześnie osobą dokonującą zgłoszenia udziału w Szkoleniu, Zamawiający udostępnia dane osobowe Uczestnika do przetwarzania w celu przeprowadzenia szkolenia w zakresie niezbędnym do jego realizacji.</Item>
            </Section>

            <Section no={2} title="Wpisanie na listę uczestników">
              <Item no="2.1">W ciągu 3 dni roboczych od przesłania Organizatorowi formularza zgłoszeniowego Zamawiający otrzyma (za pośrednictwem e-maila), potwierdzenie wpisania Uczestnika na listę szkolenia – Potwierdzenie zamówienia Szkolenia. Organizator przekaże Zamawiającemu informacje niezbędne do dokonania zapłaty (m.in. nr rachunku bankowego, tytuł wpłaty, kwotę).</Item>
              <Item no="2.2">Zawarcie wiążącej umowy o świadczenie usługi szkoleniowej następuje w momencie potwierdzenia zamówienia Szkolenia przez Organizatora.</Item>
            </Section>

            <Section no={3} title="Płatność za Szkolenie">
              <Item no="3.1">Płatności za Szkolenie należy dokonywać na podstawie wystawionej przez Organizatora faktury pro forma, przesłanej przez Organizatora razem z Potwierdzeniem zamówienia Szkolenia.</Item>
              <Item no="3.2">Nieuregulowanie w terminie faktury pro forma jest równoznaczne z rezygnacją z uczestnictwa w Szkoleniu.</Item>
              <Item no="3.3">W przypadku uregulowania płatności na podstawie faktury pro forma, faktura VAT zostanie wystawiona w ciągu 7 dni po zaksięgowaniu wpłaty. Zamawiający upoważnia Organizatora do wystawienia faktury VAT bez składania podpisu przez Zamawiającego lub przez osobę przez niego upoważnioną. Faktura zostanie wysłana na adres wskazany w formularzu zgłoszeniowym.</Item>
            </Section>

            <Section no={4} title="Rezygnacja">
              <Item no="4.1">Dla ważności oświadczenia Zamawiającego o rezygnacji z udziału w Szkoleniu wymagane jest zachowanie formy pisemnej i jego doręczenie do Organizatora na adres mailowy Organizatora: <a href="mailto:training.pl@engel.at" style={{color: C.green, textDecoration: "underline"}}>training.pl@engel.at</a> (decyduje data wpływu pisma do Organizatora).</Item>
              <Item no="4.2">Doręczenie pisemnego oświadczenia o rezygnacji z udziału w Szkoleniu – nie później niż 14 dni przed terminem nie pociąga za sobą żadnych obciążeń finansowych.</Item>
              <Item no="4.3">Doręczenie pisemnego oświadczenia o rezygnacji z udziału w Szkoleniu na 7 – 14 dni przed terminem Organizatorowi przysługuje opłata za uczestnictwo w Szkoleniu w 50% wysokości.</Item>
              <Item no="4.4">Doręczenie pisemnego oświadczenia o rezygnacji z udziału w Szkoleniu nie później niż 7 dni przed terminem lub w przypadku nieprzybycia Uczestnika na Szkolenie bez wcześniejszego oświadczenia Zamawiającego o rezygnacji, Organizatorowi przysługuje opłata za uczestnictwo w Szkoleniu w pełnej wysokości.</Item>
              <Item no="4.5">W przypadku braku możliwości udziału w Szkoleniu Uczestnika, Organizator dopuszcza możliwość udziału w Szkoleniu innego Uczestnika wskazanego przez Zamawiającego. Wskazanie przez Zamawiającego innego Uczestnika Szkolenia wymaga formy pisemnej poprzez e-mail.</Item>
            </Section>

            <Section no={5} title="Informacje dodatkowe">
              <Item no="5.1">Każdy Uczestnik po Szkoleniu otrzymuje imienne zaświadczenie potwierdzające udział w Szkoleniu.</Item>
              <Item no="5.2">Organizator zastrzega sobie prawo do dokonywania modyfikacji programu Szkolenia lub zmiany prelegenta, w merytorycznie uzasadnionych przypadkach.</Item>
              <Item no="5.3">Organizatorowi, w terminie do dnia rozpoczęcia Szkolenia, przysługuje prawo do jego odwołania (odstąpienie od umowy) w szczególności w razie niemożliwości przeprowadzenia Szkolenia z przyczyn niezależnych od Organizatora, w tym zwłaszcza w przypadku nieotrzymania minimalnej liczby zgłoszeń.</Item>
              <Item no="5.4">W przypadku odwołania Szkolenia, Organizator może zaproponować Zamawiającemu udział w Szkoleniu w innym terminie. Jeżeli Organizator nie zaproponuje innego terminu Szkolenia lub termin ten nie zostanie zaakceptowany przez Zamawiającego, kwota wpłacona przez Zamawiającego na konto Organizatora zostanie zwrócona najpóźniej w terminie 14 dni od planowanej daty rozpoczęcia Szkolenia, na rachunek bankowy wskazany przez Zamawiającego.</Item>
              <Item no="5.5">W przypadku odwołania Szkolenia, Zamawiającemu nie przysługuje prawo do zwrotu poniesionych kosztów przejazdu, rezerwacji hotelowych i innych kosztów związanych z udziałem w Szkoleniu z wyjątkiem zwrotu uiszczonej na rzecz Organizatora opłaty za uczestnictwo w Szkoleniu.</Item>
              <Item no="5.6">Organizator oświadcza, że materiały udostępniane Uczestnikom podczas Szkolenia są objęte ochroną prawa autorskiego. Zamawiający i/lub Uczestnik ma prawo do korzystania z nich jedynie w ramach dozwolonego użytku osobistego. Kopiowanie, zwielokrotnianie, rozpowszechnianie i inne formy korzystania z tych materiałów jest zabronione.</Item>
            </Section>

            <Section no={6} title="Postanowienia końcowe">
              <Item no="6.1">Niniejsze Ogólne Warunki Świadczenia Usług Szkoleniowych stanowią integralną część zamówienia, zgodnie z art. 384 Kodeksu cywilnego.</Item>
              <Item no="6.2">Ewentualne spory wynikające z umów zawartych w oparciu o niniejsze Ogólne Warunki rozstrzygane będą przez sąd właściwy dla siedziby Organizatora.</Item>
              <Item no="6.3">Ogólne Warunki Świadczenia Usług Szkoleniowych obowiązują od dnia 1 stycznia 2019 r.</Item>
              <Item no="6.4">ENGEL Polska Sp. z o.o. jest uprawnione do wprowadzenia zmian do niniejszego Regulaminu w każdym czasie, z tym zastrzeżeniem, że zachowane są prawa Zamawiającego wynikające z tej wersji Ogólnych Warunków, które obowiązywały w chwili otrzymania przez Zamawiającego potwierdzenia złożenia zamówienia.</Item>
            </Section>

            <Section no={7} title="Przetwarzanie danych">
              <Item no="7.1">Niniejszym wyrażam zgodę na przetwarzanie moich danych osobowych przez spółki z Grupy ENGEL w obrębie Unii Europejskiej, które mnie dotyczą, a konkretnie mojego imienia i nazwiska oraz mojego adresu e-mail, wyłącznie w celu rejestracji mojego zgłoszenia na szkolenie, oraz realizacji usług związanych z przeprowadzeniem szkolenia.</Item>
              <Item no="7.2">Wyrażam zgodę, przyjmując do wiadomości potencjalne ryzyka z tym związane, na przekazywanie danych osobowych podanych w zgłoszeniu na szkolenie – spółkom z Grupy ENGEL z siedzibą w państwach spoza Unii Europejskiej w celu określonym w punkcie 1.</Item>
              <Item no="7.3">Powyższe zgody można wycofać w każdym momencie bez podawania przyczyny. Przyjmuję do wiadomości, że wycofanie zgody nie wpływa na zgodność z prawem przetwarzania, którego dokonano na podstawie zgody przed jej wycofaniem. Ze sposobami wycofania zgody oraz związanymi z tym pomocami, a także wszelkimi informacjami dotyczącymi spółek grupy ENGEL można zapoznać się na stronie <a href="https://www.engelglobal.com/dataprotection" target="_blank" rel="noreferrer" style={{color: C.green, textDecoration: "underline"}}>www.engelglobal.com/dataprotection</a>.</Item>
              <Item no="7.4">Oświadczam, że zapoznałem/am się z klauzulami informacyjnymi zgodnie z art. 13 i 14 RODO dostępnymi na stronie <a href="https://www.engelglobal.com/dataprotection" target="_blank" rel="noreferrer" style={{color: C.green, textDecoration: "underline"}}>www.engelglobal.com/dataprotection</a>.</Item>
            </Section>

          </div>
        </div>

        <div style={{ marginTop: 20, textAlign: "center", fontSize: 11, color: C.greyMid }}>
          ENGEL Expert Academy · Regulamin
        </div>
      </div>
    </div>
  );
}
