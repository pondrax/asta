import { dev } from "$app/environment";

/**
 * Cookie consent, shared by the server (read/write) and the client (render).
 *
 * Stored as a cookie rather than in `localStorage`. `localStorage` is scoped to
 * a full origin (scheme + host + port), so a visitor who accepted on
 * `localhost:5173` was shown the banner again on `:5175` and on every other
 * dev port. Cookies are scoped to host only — the port is not part of the key —
 * so the decision now follows the visitor across every port, and across
 * subdomains in production.
 *
 * Note this is a host boundary, not a magic fix: a cookie set on `localhost`
 * is *not* sent to `127.0.0.1`, which is a different host. In dev, pick one
 * hostname and stick to it (or use a `Domain` attribute) if that matters.
 */

/** The two states of a stored decision. `null` = never asked. */
export type ConsentChoice = "accepted" | "rejected";

/** Cookie name holding the visitor's decision. */
export const CONSENT_COOKIE = "asta-cookie-consent";

/** One year, in seconds. */
const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * Narrow a raw cookie value to a valid choice.
 *
 * Anything unrecognised (including a value tampered with client-side) is
 * treated as "never asked" so the banner comes back rather than silently
 * treating a garbage cookie as consent.
 */
export function parseConsent(raw: string | undefined | null): ConsentChoice | null {
  return raw === "accepted" || raw === "rejected" ? raw : null;
}

/** Cookie options for a stored decision. */
export const CONSENT_COOKIE_OPTIONS = {
  // Site-wide: the banner lives in the root layout, and the choice should
  // follow the visitor across `app.example` and `www.example`.
  path: "/",
  // Readable from JS on purpose: the banner renders on the client, and a
  // consent record is not a secret.
  httpOnly: false,
  // Lax still sends the cookie on top-level navigations, which is all a
  // consent record needs; `strict` would drop it on cross-site inbound links.
  sameSite: "lax",
  // `dev` rather than `process.env.NODE_ENV`: this module is imported by the
  // client component too, where `process` does not exist. Off in dev so the
  // cookie is stored over plain `http://localhost` and the LAN IPs used for
  // device testing.
  secure: !dev,
  maxAge: ONE_YEAR,
} as const;
