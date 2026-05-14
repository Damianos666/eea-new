import { useEffect } from "react";

/**
 * Odczytuje rzeczywistą wartość env(safe-area-inset-bottom) po renderze
 * i ustawia CSS variable --safe-bottom na document.documentElement.
 *
 * Dlaczego nie czytamy env() bezpośrednio w <head>:
 * iOS oblicza safe-area asynchronicznie — przy pierwszym renderze zwraca 0.
 * Trick z offsetHeight wymusza reflow, po którym env() ma już poprawną wartość.
 *
 * Komponent nie dostaje wartości jako prop — zamiast tego CSS używa
 * var(--safe-bottom) co eliminuje potrzebę rerenderowania.
 */
export function useSafeArea() {
  function readAndApply() {
    const div = document.createElement("div");
    div.style.cssText = [
      "position:fixed",
      "bottom:0",
      "left:0",
      "right:0",
      "height:env(safe-area-inset-bottom)",
      "visibility:hidden",
      "pointer-events:none",
    ].join(";");

    document.body.appendChild(div);
    const h = div.offsetHeight; // wymusza reflow → env() ma już realną wartość
    document.body.removeChild(div);

    document.documentElement.style.setProperty("--safe-bottom", h + "px");
  }

  useEffect(() => {
    // 50ms daje iOS czas na inicjalizację safe-area po pierwszym renderze React
    const t1 = setTimeout(readAndApply, 50);
    const t2 = setTimeout(readAndApply, 300);

    const onOrientationChange = () => {
      setTimeout(readAndApply, 100);
      setTimeout(readAndApply, 400);
    };

    window.addEventListener("orientationchange", onOrientationChange);
    if (window.screen?.orientation) {
      window.screen.orientation.addEventListener("change", onOrientationChange);
    }

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener("orientationchange", onOrientationChange);
      window.screen?.orientation?.removeEventListener("change", onOrientationChange);
    };
  }, []);
}
