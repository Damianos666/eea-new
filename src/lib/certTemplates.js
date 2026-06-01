// ─────────────────────────────────────────────────────────────────────────────
// CERT TEMPLATES — tła certyfikatów pobierane z Supabase Storage
// Bucket: cert-templates (prywatny — dostęp przez signed URL)
// Pliki:  trainer_1.jpg … trainer_N.jpg
// ─────────────────────────────────────────────────────────────────────────────

import { SB_URL, authHeaders } from "./supabase";
import { err as logErr } from "./logger";

const BUCKET = "cert-templates";

/**
 * Generuje tymczasowy signed URL (60s) dla pliku tła, pobiera go i zwraca base64.
 * Wymaga tokenu — bucket jest prywatny.
 *
 * @param {number} trainerNum
 * @param {string} token  — access token
 * @returns {Promise<string|null>}  "data:image/jpeg;base64,..." lub null przy błędzie
 */
export async function fetchCertTemplateAsBase64(trainerNum, token) {
  const file = `trainer_${trainerNum}.jpg`;

  try {
    // 1. Wygeneruj signed URL (ważny 60 sekund)
    const signRes = await fetch(
      `${SB_URL}/storage/v1/object/sign/${BUCKET}/${file}`,
      {
        method: "POST",
        headers: { ...authHeaders(token), "Content-Type": "application/json" },
        body: JSON.stringify({ expiresIn: 60 }),
      }
    );
    if (!signRes.ok) {
      logErr(`[certTemplates] Nie udało się wygenerować signed URL (${signRes.status})`);
      return null;
    }
    const { signedURL } = await signRes.json();

    // 2. Pobierz plik przez signed URL (nie wymaga nagłówków auth)
    const fullSignedURL = signedURL.startsWith("/storage/v1") ? `${SB_URL}${signedURL}` : `${SB_URL}/storage/v1${signedURL}`;
    const imgRes = await fetch(fullSignedURL);
    if (!imgRes.ok) {
      logErr(`[certTemplates] Błąd pobierania pliku przez signed URL (${imgRes.status})`);
      return null;
    }

    // 3. Konwertuj do base64 (wymagane przez @react-pdf/renderer)
    const blob = await imgRes.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("FileReader error"));
      reader.readAsDataURL(blob);
    });

  } catch (err) {
    logErr(`[certTemplates] Wyjątek dla trenera ${trainerNum}:`, err);
    return null;
  }
}
