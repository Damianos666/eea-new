# ENGEL Expert Academy

## Struktura projektu (po optymalizacji)

```
src/
├── App.jsx                  # Główna logika aplikacji (167 linii)
├── main.jsx                 # Entry point
├── components/
│   ├── SharedUI.jsx         # Header, Toggle, Field, Spinner, Confetti...
│   ├── Login.jsx            # LoginScreen, AuthForm, RecoverForm
│   ├── Modals.jsx           # CelebModal, CertModal
│   ├── TrainingTab.jsx      # Zakładka Szkolenia
│   ├── CatalogTab.jsx       # Zakładka Katalog
│   ├── MessagesTab.jsx      # Zakładka Wiadomości
│   ├── ProfileTab.jsx       # Zakładka Profil
│   ├── AdminPanel.jsx       # Panel admina
│   └── TabBar.jsx           # Pasek zakładek
├── data/
│   └── trainings.js         # Dane 24 szkoleń
└── lib/
    ├── constants.js          # Kolory, grupy, stałe
    ├── helpers.js            # Funkcje pomocnicze
    └── supabase.js           # Klient Supabase (auth + db)
public/
├── logo.png                  # Logo ENGEL (nie wbudowane w JS!)
├── pwa-192.png               # Ikona PWA 192px
└── pwa-512.png               # Ikona PWA 512px
```

## Instalacja i uruchomienie

```bash
npm install
npm run dev
```

## Zmienne środowiskowe (.env)

```
VITE_SUPABASE_URL=https://pjcraotvldzihczfmtps.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

## Dodanie do ekranu głównego (PWA)

Po wdrożeniu na Vercel/Netlify — w Chrome/Safari pojawi się opcja
"Dodaj do ekranu głównego". Aplikacja działa wtedy jak natywna.

## Optymalizacje zastosowane

- **React.memo** na wszystkich komponentach — re-render tylko przy zmianie propsów
- **useMemo** na filtrowanych listach szkoleń
- **Logo jako plik PNG** zamiast 40KB base64 wbudowanego w JS
- **Dane szkoleń** w osobnym pliku — tree-shaking przez Vite
- **PWA** — Service Worker cache'uje zasoby, działa offline
- **Podział na 9 plików** — łatwiejszy development i maintenance
