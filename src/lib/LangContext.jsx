import { createContext, useContext, useState, useCallback, useMemo } from "react";
import { translations } from "./translations";

const LangContext = createContext("pl");

export function LangProvider({ children }) {
  const [lang, setLang] = useState(() => {
    try { return localStorage.getItem("eea_lang") || "pl"; } catch { return "pl"; }
  });

  // useCallback — stała referencja, nie powoduje re-renderów konsumentów kontekstu
  const switchLang = useCallback((l) => {
    setLang(l);
    try { localStorage.setItem("eea_lang", l); } catch {}
  }, []);

  // useMemo — nowa wartość kontekstu tylko gdy zmienia się lang lub switchLang
  const value = useMemo(
    () => ({ lang, switchLang, T: translations[lang] }),
    [lang, switchLang]
  );

  return (
    <LangContext.Provider value={value}>
      {children}
    </LangContext.Provider>
  );
}

export function useT() {
  const { T } = useContext(LangContext);
  return T;
}

export function useLang() {
  return useContext(LangContext);
}
