import { useEffect, useRef, useState } from "react";
import { C } from "../lib/constants";
import { edge } from "../lib/supabase";

/**
 * QRScannerTab — nakładka z widokiem kamery, skanuje QR kody szkoleniowe.
 * Wywołaj onComplete(result) gdy kod zostanie pomyślnie zweryfikowany.
 * Wywołaj onClose() gdy użytkownik zamknie skaner.
 *
 * Wymaga: npm install jsqr
 *
 * WAŻNE — dlaczego token jako prop + useRef:
 * useEffect z [] uruchamia się raz i "zamraża" wszystkie zmienne z pierwszego renderu
 * (stale closure). Gdybyśmy używali useUser() wewnątrz, user.accessToken mógłby być
 * nieaktualny po odświeżeniu tokena. session.getToken() z kolei zależy od _memoryToken
 * w module — który nie zawsze jest ustawiony (np. po przeładowaniu PWA). Rozwiązanie:
 * token przychodzi jako prop od TrainingTab (zawsze świeży z useUser()), a tokenRef
 * pozwala closurze zawsze czytać aktualną wartość bez re-deklaracji efektu.
 */
export function QRScannerTab({ token, onComplete, onClose }) {
  // tokenRef — zawsze trzyma aktualny token; closure czyta z ref, nie z props
  const tokenRef = useRef(token);
  useEffect(() => { tokenRef.current = token; }, [token]);
  const videoRef  = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef    = useRef(null);
  const scanningRef = useRef(true); // flaga — zatrzymaj po pierwszym trafieniu

  const [status,  setStatus]  = useState("starting"); // starting | scanning | verifying | success | error
  const [message, setMessage] = useState("");

  useEffect(() => {
    let jsQR;

    async function init() {
      // Lazy import jsQR — ładuje się tylko gdy skaner jest otwarty
      try {
        const mod = await import("jsqr");
        jsQR = mod.default;
      } catch {
        setStatus("error");
        setMessage("Nie udało się załadować skanera. Zainstaluj: npm install jsqr");
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setStatus("scanning");
          requestAnimationFrame(tick);
        }
      } catch {
        setStatus("error");
        setMessage("Brak dostępu do kamery. Sprawdź uprawnienia w przeglądarce.");
      }
    }

    function tick() {
      if (!scanningRef.current) return;
      const video  = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < video.HAVE_ENOUGH_DATA) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      canvas.width  = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const result    = jsQR(imageData.data, imageData.width, imageData.height);

      if (result?.data) {
        const url = result.data;
        // Wyciągnij kod i opcjonalny tytuł z URL: .../verify/KOD?title=Nazwa
        const match = url.match(/\/verify\/([A-Z0-9-]+)/i);
        const code  = match ? match[1] : url;
        // Parsuj parametry URL poprawnie (obsługa title i days)
        let titleParam = "";
        let daysParam  = undefined;
        try {
          const qIndex = url.indexOf("?");
          if (qIndex !== -1) {
            const params = new URLSearchParams(url.slice(qIndex + 1));
            titleParam = params.get("title") ? decodeURIComponent(params.get("title")) : "";
            const d = parseInt(params.get("days"), 10);
            if (!isNaN(d) && d > 0) daysParam = d;
          }
        } catch (_) {}
        if (code) {
          scanningRef.current = false;
          stopCamera();
          verifyCode(code, titleParam, daysParam);
          return;
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    init();

    return () => {
      scanningRef.current = false;
      stopCamera();
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  function stopCamera() {
    streamRef.current?.getTracks().forEach(t => t.stop());
    cancelAnimationFrame(rafRef.current);
  }

  async function verifyCode(code, specialTitle = "", specialDays = undefined, attempt = 1) {
    setStatus("verifying");
    // Czytamy z ref — zawsze aktualny token, bez stale closure
    const tok = tokenRef.current;
    if (!tok) {
      setStatus("error");
      setMessage("Brak sesji — zaloguj się ponownie.");
      return;
    }
    try {
      const result = await edge.verifyCode(tok, code, specialTitle || undefined, specialDays);
      setStatus("success");
      if (navigator.vibrate) navigator.vibrate([60, 80, 120, 60, 200]);
      // Poczekaj chwilę żeby użytkownik zobaczył sukces, potem zamknij
      setTimeout(() => {
        onComplete({
          ...result,
          key: code.replace(/-/g, ""),
        });
        onClose();
      }, 1200);
    } catch (e) {
      // Auto-retry raz dla przejściowych błędów sieciowych.
      // Na iOS PWA po powrocie z tła pierwsza próba fetch() często kończy się
      // TypeError ("Failed to fetch") zanim sieć się "przebudzi" — jedno retry
      // z krótkim opóźnieniem rozwiązuje ten problem bez widocznego efektu dla użytkownika.
      if (attempt === 1 && (
        e.message.includes("Brak połączenia") ||
        e.message.includes("Failed to fetch") ||
        e.message.includes("Network request failed")
      )) {
        await new Promise(res => setTimeout(res, 1200));
        return verifyCode(code, specialTitle, specialDays, 2);
      }
      setStatus("error");
      setMessage(e.message || "Nieprawidłowy kod QR");
    }
  }

  function retry() {
    scanningRef.current = true;
    setStatus("starting");
    setMessage("");
    // Restart kamery
    streamRef.current?.getTracks().forEach(t => t.stop());
    cancelAnimationFrame(rafRef.current);

    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
      .then(stream => {
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().then(() => {
            setStatus("scanning");
            rafRef.current = requestAnimationFrame(function tick() {
              if (!scanningRef.current) return;
              const video  = videoRef.current;
              const canvas = canvasRef.current;
              if (!video || !canvas || video.readyState < video.HAVE_ENOUGH_DATA) {
                rafRef.current = requestAnimationFrame(tick); return;
              }
              canvas.width = video.videoWidth; canvas.height = video.videoHeight;
              const ctx = canvas.getContext("2d");
              ctx.drawImage(video, 0, 0);
              import("jsqr").then(mod => {
                const result = mod.default(ctx.getImageData(0,0,canvas.width,canvas.height).data, canvas.width, canvas.height);
                if (result?.data) {
                  const match = result.data.match(/\/verify\/([A-Z0-9-]+)/i);
                  const code  = match ? match[1] : result.data;
                  if (code) { scanningRef.current = false; stopCamera(); verifyCode(code); return; }
                }
                rafRef.current = requestAnimationFrame(tick);
              });
            });
          });
        }
      })
      .catch(() => { setStatus("error"); setMessage("Brak dostępu do kamery."); });
  }

  // Kolory i treść zależnie od statusu
  const statusConfig = {
    starting:  { color: C.greyMid,  bg: "rgba(0,0,0,.6)", text: "Uruchamiam kamerę..." },
    scanning:  { color: C.green,    bg: "transparent",    text: "Skieruj aparat na kod QR" },
    verifying: { color: C.amber,    bg: "rgba(0,0,0,.6)", text: "Weryfikuję..." },
    success:   { color: C.green,    bg: "rgba(0,0,0,.6)", text: "✓ Szkolenie zaliczone!" },
    error:     { color: C.red,      bg: "rgba(0,0,0,.6)", text: message || "Błąd skanowania" },
  };
  const cfg = statusConfig[status];

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "#000",
      display: "flex", flexDirection: "column",
      fontFamily: "'Helvetica Neue',Helvetica,Arial,sans-serif",
    }}>
      {/* Pasek górny */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, zIndex: 10,
        background: "rgba(0,0,0,.7)",
        paddingTop: "calc(14px + env(safe-area-inset-top, 0px))",
        paddingBottom: 14, paddingLeft: 16, paddingRight: 16,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <span style={{ color: C.white, fontSize: 14, fontWeight: 700, letterSpacing: .5 }}>
          📷 Skanuj kod QR
        </span>
        <button onClick={() => { stopCamera(); onClose(); }} style={{
          background: "none", border: `1px solid rgba(255,255,255,.4)`,
          color: C.white, padding: "5px 12px", fontSize: 12,
          fontWeight: 600, cursor: "pointer",
        }}>Zamknij</button>
      </div>

      {/* Podgląd kamery */}
      <video
        ref={videoRef}
        playsInline muted
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
      <canvas ref={canvasRef} style={{ display: "none" }}/>

      {/* Nakładka z celownikiem */}
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        pointerEvents: "none",
      }}>
        {/* Przyciemnienie wokół celownika */}
        <div style={{
          position: "absolute", inset: 0,
          background: "rgba(0,0,0,.45)",
          WebkitMaskImage: "radial-gradient(ellipse 240px 240px at 50% 45%, transparent 0%, black 100%)",
          maskImage:        "radial-gradient(ellipse 240px 240px at 50% 45%, transparent 0%, black 100%)",
        }}/>
        {/* Ramka celownika */}
        <div style={{
          width: 240, height: 240,
          marginTop: -40, // przesuń lekko w górę od centrum
          border: `3px solid ${status === "success" ? C.green : status === "error" ? C.red : C.green}`,
          borderRadius: 16,
          boxShadow: `0 0 0 2px rgba(${status === "success" ? "138,183,62" : "255,255,255"},.2)`,
          transition: "border-color .3s",
          position: "relative",
        }}>
          {/* Narożniki */}
          {[["0","0","1","1"],["0","auto","1","0"],["auto","0","0","1"],["auto","auto","0","0"]].map(([t,r,bt,bl], i) => (
            <div key={i} style={{
              position: "absolute",
              top: t !== "auto" ? -3 : "auto", right: r !== "auto" ? -3 : "auto",
              bottom: bt !== "auto" ? -3 : "auto", left: bl !== "auto" ? -3 : "auto",
              width: 24, height: 24,
              borderTop:    bt === "0" ? `4px solid ${C.green}` : "none",
              borderBottom: bt !== "0" ? `4px solid ${C.green}` : "none",
              borderLeft:   bl === "0" ? `4px solid ${C.green}` : "none",
              borderRight:  r  === "0" ? `4px solid ${C.green}` : "none",
            }}/>
          ))}
        </div>
      </div>

      {/* Status na dole */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        paddingBottom: "calc(24px + env(safe-area-inset-bottom, 0px))",
        paddingTop: 16, paddingLeft: 24, paddingRight: 24,
        background: cfg.bg || "rgba(0,0,0,.6)",
        textAlign: "center",
      }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: cfg.color, marginBottom: 8 }}>
          {cfg.text}
        </div>
        {status === "error" && (
          <button onClick={retry} style={{
            background: C.black, border: `1px solid ${C.green}`,
            color: C.green, padding: "10px 28px",
            fontSize: 13, fontWeight: 700, cursor: "pointer",
          }}>
            Spróbuj ponownie
          </button>
        )}
        {status === "scanning" && (
          <div style={{ fontSize: 12, color: "rgba(255,255,255,.5)" }}>
            Kod musi być wyraźnie widoczny w ramce
          </div>
        )}
      </div>
    </div>
  );
}
