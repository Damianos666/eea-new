import { useMemo } from "react";
import { TRAININGS } from "../data/trainings";
import { TRAININGS_EN } from "../data/trainings.en";
import { useLang } from "./LangContext";

/**
 * Zwraca tablicę szkoleń w aktywnym języku z nadpisanymi wartościami z Supabase.
 * Nie mutuje globalnego modułu — każdy wywołujący dostaje czystą kopię.
 *
 * @param {Object} overrides - mapa { [training_id]: { title, desc, duration, level, ... } }
 */
export function useTrainings(overrides = {}) {
  const { lang } = useLang();
  const base = lang === "en" ? TRAININGS_EN : TRAININGS;
  return useMemo(
    () => base.map(t => overrides[t.id] ? { ...t, ...overrides[t.id] } : t),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lang, overrides]
  );
}
