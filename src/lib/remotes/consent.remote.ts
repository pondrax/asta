import { command, getRequestEvent } from "$app/server";
import {
  CONSENT_COOKIE,
  CONSENT_COOKIE_OPTIONS,
  parseConsent,
  type ConsentChoice,
} from "$lib/app/cookie-consent";

/**
 * Record the visitor's decision in a cookie.
 *
 * A cookie rather than `localStorage` so the choice survives a host/port
 * change and applies to every subdomain — see the note in
 * `$lib/app/cookie-consent`. The server writes it so it is available to the
 * next request's `load`, which means the banner never has to flash in after
 * hydration.
 */
export const setCookieConsent = command("unchecked", async (choice: ConsentChoice) => {
  const value = parseConsent(choice);
  if (!value) throw new Error("Invalid consent choice");

  getRequestEvent().cookies.set(CONSENT_COOKIE, value, CONSENT_COOKIE_OPTIONS);
  return { choice: value };
});

/**
 * Read the stored decision. Used by the root layout's `load` to render the
 * banner (or its absence) during SSR.
 */
export const getCookieConsent = command("unchecked", async () => {
  return { choice: parseConsent(getRequestEvent().cookies.get(CONSENT_COOKIE)) };
});
