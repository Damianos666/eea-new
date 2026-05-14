import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

const BUILD_TIME = __BUILD_TIME__;
const STORED_KEY = 'eaa_build_v';

async function checkVersion() {
  try {
    const res = await fetch('/version.json', { cache: 'no-store' });
    if (!res.ok) return;
    const { v } = await res.json();

    const stored = localStorage.getItem(STORED_KEY);

    if (stored && stored !== v) {
      localStorage.setItem(STORED_KEY, v);
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister()));
      }
      window.location.reload(true);
      return;
    }

    localStorage.setItem(STORED_KEY, v);
  } catch (e) {
    // Brak sieci lub błąd — nic nie rób, uruchom z cache
  }
}

checkVersion();

setInterval(() => {
  if (document.visibilityState !== 'hidden') checkVersion();
}, 15 * 60 * 1000);

if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) window.location.reload();
  });

  navigator.serviceWorker.ready.then(reg => {
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

// Splash znika gdy spełnione są OBA warunki jednocześnie:
//   1. React zamontował pierwsze drzewo (onMounted)
//   2. minęła minimum 1 sekunda (timer)
// Oba startują równolegle — żadne nie czeka na drugie.
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
