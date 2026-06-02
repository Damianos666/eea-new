import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

const BUILD_TIME = __BUILD_TIME__;
const STORED_KEY = 'eaa_build_v';

// ─── SPRAWDZANIE AKTUALNOŚCI ──────────────────────────────────────────────────
//
// Dwa równoległe mechanizmy:
//
// 1. version.json — wykrywa nowy deploy na Vercel.
//    Timestamp budowania zapisany w /public/version.json i w __BUILD_TIME__.
//    Fetch z ?t= omija cache HTTP i SW (URL nie pasuje do żadnej reguły Workbox).
//
// 2. reg.update() — wymusza sprawdzenie nowej wersji Service Workera.
//    Krytyczne dla PWA: przeglądarka domyślnie odpytuje SW co 24h lub przy
//    nawigacji. Przy otwieraniu z ikony (standalone) update NIE jest triggerowany.
//    reg.update() naprawia ten problem.
//
// Oba mechanizmy wywoływane:
//   • przy starcie aplikacji
//   • przy powrocie z tła (visibilitychange: hidden → visible)
//   • co 15 minut gdy aplikacja jest aktywna

let swRegistration = null;

async function checkVersion() {
  try {
    // ?t= gwarantuje ominięcie cache HTTP i SW (Workbox nie ma reguły dla tego URL)
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const { v } = await res.json();
    const stored = localStorage.getItem(STORED_KEY);

    if (stored && stored !== v) {
      localStorage.setItem(STORED_KEY, v);
      // Wyczyść caches (precache Workbox + runtimeCaching)
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      // Wyrejestruj stary SW — po reload nowy zainstaluje się od razu
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
      window.location.reload();
      return;
    }
    localStorage.setItem(STORED_KEY, v);
  } catch {
    // Brak sieci lub błąd — działaj z cache, spróbuj przy następnej okazji
  }
}

async function triggerSwUpdate() {
  try {
    const reg = swRegistration
      || (await navigator.serviceWorker?.getRegistration?.('/'))
      || null;
    if (reg) await reg.update();
  } catch {
    // SW update nieistotny — nie blokuj ładowania
  }
}

async function checkAll() {
  await Promise.allSettled([checkVersion(), triggerSwUpdate()]);
}

// Startup
checkAll();

// Co 15 minut gdy aktywna (karta/okno widoczne)
setInterval(() => {
  if (document.visibilityState !== 'hidden') checkAll();
}, 15 * 60 * 1000);

// Powrót z tła (użytkownik wraca do PWA po czasie)
let lastCheckTs = Date.now();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const now = Date.now();
  // Sprawdzaj tylko jeśli minęło ≥ 60 sekund od ostatniego sprawdzenia
  // (unikamy podwójnego triggerowania przy szybkim alt-tab)
  if (now - lastCheckTs >= 60_000) {
    lastCheckTs = now;
    checkAll();
  }
});

// ─── SERVICE WORKER ───────────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;

  // Gdy nowy SW przejmie kontrolę → odśwież stronę żeby załadować nowe zasoby
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) window.location.reload();
  });

  navigator.serviceWorker.ready.then(reg => {
    swRegistration = reg;

    // Jeśli nowy SW czeka na aktywację (był zainstalowany wcześniej ale
    // nie mógł przejąć kontroli) — aktywuj go od razu
    if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });

    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      if (!nw) return;
      nw.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) {
          nw.postMessage({ type: 'SKIP_WAITING' });
        }
      });
    });
  }).catch(() => {});
}

// ─── SPLASH ───────────────────────────────────────────────────────────────────
// Splash znika gdy spełnione są OBA warunki jednocześnie:
//   1. React zamontował pierwsze drzewo (onMounted)
//   2. minęła minimum 1 sekunda (timer)
const splashReady = (() => {
  let resolveMounted, resolveTimer;
  const mounted = new Promise(r => { resolveMounted = r; });
  const timer   = new Promise(r => { resolveTimer   = r; });
  setTimeout(resolveTimer, 1000);
  Promise.all([mounted, timer]).then(() => {
    const splash = document.getElementById('splash');
    if (!splash) return;
    splash.classList.add('hide');
    setTimeout(() => splash.remove(), 380);
  });
  return resolveMounted;
})();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App onMounted={splashReady} />
  </React.StrictMode>
)
