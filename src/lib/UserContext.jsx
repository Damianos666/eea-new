/**
 * UserContext — centralne miejsce na dane użytkownika i jego access token.
 *
 * DLACZEGO to ważne (bezpieczeństwo + czytelność):
 * - Wcześniej `token` (user.accessToken) był przekazywany przez props przez 4+ poziomy:
 *   App → TrainingTab → ... → db.get(token, ...)
 * - Każda zmiana sygnatury wymagała edycji wielu plików, co zwiększało ryzyko błędu.
 * - Context pozwala każdemu komponentowi pobrać token bezpośrednio, bez pośredników.
 *
 * Użycie:
 *   const { user, token, setUser } = useUser();
 */

import { createContext, useContext } from "react";

export const UserContext = createContext(null);

/**
 * Hook do użycia w dowolnym komponencie potomnym AppRoot.
 * Rzuca błąd jeśli użyty poza providerem — szybkie wykrycie pomyłki.
 */
export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used within UserContext.Provider");
  return ctx;
}
