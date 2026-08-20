/**
 * Browser automation utilities using playwright-core.
 * Handles session management, BeID auto-login, and TOTP.
 */
import { chromium, type Browser, type Page } from "playwright-core";
import { createHmac } from "node:crypto";
import { resolveEnv } from "./db/utils";
import { sendWhatsAppText } from "./notify";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

const BEID_HOST = "beid.bssn.go.id";

// Guards against duplicate WhatsApp alerts when handleBeIDLogin is invoked
// twice for the same failed login (framenavigated handler + acquireToken).
let lastBeidFailureNotifiedAt = 0;

// ---------------------------------------------------------------------------
// Session store
// ---------------------------------------------------------------------------

export interface BrowserSession {
  browser: Browser;
  page: Page;
  startedAt: Date;
  mode: string;
}

export const sessions = new Map<string, BrowserSession>();

/** Cached Bearer tokens keyed by userId — survives browser close */
export const tokenStore = new Map<string, string>();

// ---------------------------------------------------------------------------
// TOTP (RFC 6238) — zero dependencies, uses Node.js crypto
// ---------------------------------------------------------------------------

const BASE32_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(input: string): Uint8Array {
  const str = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const ch of str) {
    const val = BASE32_CHARS.indexOf(ch);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, "0");
  }
  const bytes = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  }
  return bytes;
}

function hmacSha1(key: Uint8Array, msg: Uint8Array): Uint8Array {
  const hmac = createHmac("sha1", Buffer.from(key));
  hmac.update(Buffer.from(msg));
  return new Uint8Array(hmac.digest());
}

function generateHOTP(secret: Uint8Array, counter: number, digits = 6): string {
  // counter → 8-byte big-endian
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  view.setUint32(0, Math.floor(counter / 0x100000000), false);
  view.setUint32(4, counter >>> 0, false);
  const counterBytes = new Uint8Array(buf);

  const hash = hmacSha1(secret, counterBytes);
  const offset = hash[hash.length - 1] & 0x0f;
  const code =
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff);
  return (code % 10 ** digits).toString().padStart(digits, "0");
}

interface TotpConfig {
  secret: Uint8Array;
  digits: number;
  period: number;
}

function parseOtpauthUri(uri: string): TotpConfig {
  const url = new URL(uri);
  const params = url.searchParams;
  const secret = base32Decode(params.get("secret") ?? "");
  const digits = parseInt(params.get("digits") ?? "6", 10);
  const period = parseInt(params.get("period") ?? "30", 10);
  return { secret, digits, period };
}

function makeTotpConfig(raw: string): TotpConfig {
  const trimmed = raw.trim();

  // Full otpauth:// URI — parse directly
  if (trimmed.startsWith("otpauth://")) {
    return parseOtpauthUri(trimmed);
  }

  // "//totp/Label?secret=..." format (missing scheme) — reconstruct full URI
  if (trimmed.startsWith("//totp/") || trimmed.startsWith("//otp/")) {
    return parseOtpauthUri("otpauth:" + trimmed);
  }

  // Raw base32 secret or "totp/Label?secret=..." fragment
  const cleaned = trimmed.replace(/^otpauth:/, "").replace(/^totp\/[^?]*\?/, "").trim();
  if (cleaned.includes("secret=")) {
    return parseOtpauthUri("otpauth://totp/?" + cleaned);
  }

  return {
    secret: base32Decode(cleaned || trimmed),
    digits: 6,
    period: 30,
  };
}

export async function generateTOTP(): Promise<string> {
  const env = await resolveEnv();
  const raw = env.PORTAL_OTP_AUTH ?? "";
  const config = makeTotpConfig(raw);
  const counter = Math.floor(Date.now() / 1000 / config.period);
  return generateHOTP(config.secret, counter, config.digits);
}

// ---------------------------------------------------------------------------
// Shared browser connection — CDP connects once, local launches per-session
// ---------------------------------------------------------------------------

let sharedBrowser: Browser | null = null;
let sharedBrowserMode = "";

async function getOrCreateBrowser(): Promise<{ browser: Browser; mode: string }> {
  const env = await resolveEnv();
  const remoteUrl = env.BROWSER_REMOTE_DEBUG_URL;

  if (remoteUrl) {
    // Reuse the same CDP connection — closing pages, not the browser
    if (sharedBrowser?.isConnected()) {
      return { browser: sharedBrowser, mode: sharedBrowserMode };
    }
    // Close stale reference if disconnected
    if (sharedBrowser) {
      try { sharedBrowser.close().catch(() => { }); } catch (_) { }
      sharedBrowser = null;
    }
    try {
      // connectOverCDP can hang forever at the WS handshake stage (no effective
      // timeout) when the remote browser is unreachable or the network drops
      // packets. Wrap it in a hard deadline so the cron never stalls.
      sharedBrowser = await new Promise<Browser>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("CDP connect timed out after 15s")),
          15_000,
        );
        chromium
          .connectOverCDP(remoteUrl, { timeout: 15_000 })
          .then((b) => { clearTimeout(timer); resolve(b); })
          .catch((e) => { clearTimeout(timer); reject(e); });
      });
      sharedBrowserMode = `remote:${remoteUrl}`;
      return { browser: sharedBrowser, mode: sharedBrowserMode };
    } catch (err) {
      // NO local fallback — if the remote CDP browser is unreachable, stop.
      // The sync must run against the shared, logged-in CDP browser only.
      throw new Error(
        `CDP browser ${remoteUrl} unreachable: ${(err as Error)?.message ?? err}`,
      );
    }
  }

  // Local headless: launch a fresh one each time (will be fully closed later)
  const execPath =
    env.BROWSER_EXECUTABLE_PATH ||
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";

  const browser = await chromium.launch({
    executablePath: execPath,
    headless: true,
    args: ['--no-sandbox'],
  });
  return { browser, mode: `local:${execPath}` };
}

// ---------------------------------------------------------------------------
// Close only the page/tab for a user — don't disconnect the shared browser
// ---------------------------------------------------------------------------

export async function closeSession(userId: string): Promise<void> {
  const session = sessions.get(userId);
  if (!session) return;

  const isShared = sharedBrowser && session.browser === sharedBrowser;

  if (isShared) {
    // For shared/CDP: navigate to blank instead of closing the tab,
    // so the 1st tab stays alive for next use
    try { await session.page.goto("about:blank", { timeout: 5_000 }).catch(() => { }); } catch (_) { }
  } else {
    // Local headless: close the page + browser entirely
    try { await session.page.close().catch(() => { }); } catch (_) { }
    try { await session.browser.close().catch(() => { }); } catch (_) { }
  }

  sessions.delete(userId);
}

export async function openSession(userId: string): Promise<BrowserSession> {
  // Reuse existing session for this user — never open a new tab unnecessarily
  const existing = sessions.get(userId);
  if (existing) {
    // Check page is still usable
    try {
      await existing.page.evaluate(() => 1, { timeout: 2_000 });
      existing.startedAt = new Date();
      return existing;
    } catch {
      // Page is dead — clean up and create a new one
      try { await existing.page.close().catch(() => { }); } catch (_) { }
      sessions.delete(userId);
    }
  }

  const { browser, mode } = await getOrCreateBrowser();

  let ctx = browser.contexts()[0];
  if (!ctx) ctx = await browser.newContext({ ignoreHTTPSErrors: true });

  // Always reuse the first tab instead of opening a new one
  const page = ctx.pages()[0] ?? await ctx.newPage();

  // Forward console logs to server terminal
  page.on("console", (msg) => {
    console.log(`[browser-console] [${msg.type()}] ${msg.text()}`);
  });

  // Intercept requests to extract bearer token from headers
  page.on("request", (req) => {
    try {
      const auth = req.headers()["authorization"];
      if (auth && auth.startsWith("Bearer ") && auth.length > 100) {
        tokenStore.set(userId, auth);
        console.log(`[browser] Intercepted token from request headers for ${userId}`);
      }
    } catch (_) { }
  });

  // Watch for mid-session BeID redirects
  page.on("framenavigated", async (frame: any) => {
    if (frame !== page.mainFrame()) return;
    try {
      if (new URL(frame.url()).hostname.includes(BEID_HOST) && userId === "auto-sync") {
        await page.waitForLoadState("load", { timeout: 8_000 }).catch(() => { });
        await handleBeIDLogin(page);
      }
    } catch (_) { }
  });

  const session: BrowserSession = { browser, page, startedAt: new Date(), mode };
  sessions.set(userId, session);
  return session;
}

// ---------------------------------------------------------------------------
// BeID auto-login
// ---------------------------------------------------------------------------

// Re-entrancy guard — BeID login is triggered both explicitly (acquireToken /
// navigateBsre) AND by the framenavigated auto-login handler in openSession.
// Keycloak submits the login form via POST → full page navigation on every
// failed attempt → framenavigated fires → a *nested* handleBeIDLogin starts,
// which spawns more on its own submits → unbounded loop. Joining the in-flight
// flow (per page) fixes it: nested calls just await the same promise.
const loginFlows = new WeakMap<Page, Promise<void>>();

export function handleBeIDLogin(page: Page): Promise<void> {
  const existing = loginFlows.get(page);
  if (existing) {
    console.log("[browser] BeID login already in progress — joining existing flow");
    return existing;
  }
  const flow = runBeIDLogin(page).finally(() => loginFlows.delete(page));
  loginFlows.set(page, flow);
  return flow;
}

async function runBeIDLogin(page: Page): Promise<void> {
  if (!new URL(page.url()).hostname.includes(BEID_HOST)) return;
  console.log("[browser] BeID detected — auto-login...");
  const env = await resolveEnv();

  // Wait for full page load (all resources + JS rendering) before looking for fields
  await page.waitForLoadState("load", { timeout: 8_000 }).catch(() => { });
  // Give SPA a moment to render the form
  await page.waitForTimeout(1_000);

  const pageUrl = page.url();
  console.log("[browser] BeID page URL:", pageUrl);

  // OTP selectors — check FIRST so we don't misidentify OTP input as username
  const otpSelectors = 'input[name="otp"], input[name="token"], input[placeholder*="OTP" i], input[placeholder*="authenticator" i], input[maxlength="6"], input#otp, input#token';

  // Exclude OTP fields from username selectors (OTP input is often type="text"
  // with maxlength="6", which would otherwise match the broad text selectors)
  const otpExclusion = ':not([maxlength="6"]):not([name="otp"]):not([name="token"]):not([id="otp"]):not([id="token"])';
  const usernameSelectors = [
    'input[name="username"]',
    `input[type="text"]${otpExclusion}`,
    'input#username',
    'input[autocomplete="username"]',
    'input[name="email"]',
    'input[type="email"]',
    `input[placeholder*="user" i]${otpExclusion}`,
    `input[placeholder*="email" i]${otpExclusion}`,
    `input[placeholder*="akun" i]${otpExclusion}`,
  ].join(", ");
  const pwSelectors = 'input[name="password"], input[type="password"], input#password';
  const submitBtn = 'button[type="submit"], input[type="submit"], button:has-text("Masuk"), button:has-text("Login"), button:has-text("Sign in")';

  const username = env.PORTAL_BSRE_USERNAME ?? "";
  const password = env.PORTAL_BSRE_PASSWORD ?? "";
  const MAX_ATTEMPTS = 5;
  let lastErrorText = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    console.log(`[browser] BeID login attempt ${attempt}/${MAX_ATTEMPTS} — ${page.url()}`);

    // 1. Wait for the login form to render (Keycloak re-renders it after each
    //    failed submit, so we must re-acquire the fields every attempt)
    try {
      await page.waitForSelector(usernameSelectors, { timeout: 10_000 });
    } catch (err) {
      // The username field might not exist because we're already on the OTP page
      // (e.g. after a previous submit succeeded but page reloaded on BEID)
      let otpInput: Awaited<ReturnType<Page["$"]>> = null;
      try {
        otpInput = await page.waitForSelector(otpSelectors, { timeout: 2_000 });
      } catch { }

      if (otpInput) {
        const token = await generateTOTP();
        console.log(`[browser] Attempt ${attempt}: no username field but OTP input found — submitting TOTP`);
        await otpInput.fill(token);
        await page.click(submitBtn);
        await page.waitForLoadState("load", { timeout: 10_000 }).catch(() => { });
        if (!new URL(page.url()).hostname.includes(BEID_HOST)) {
          console.log("[browser] Login complete via OTP —", page.url());
          return;
        }
        // Still on BEID after OTP submit — let the loop continue
      }

      // No username field AND no OTP — but maybe the page already left BEID
      if (!new URL(page.url()).hostname.includes(BEID_HOST)) {
        console.log("[browser] Login complete (no form found, already redirected) —", page.url());
        return;
      }

      lastErrorText = "Form login tidak ditemukan";
      console.log(`[browser] Attempt ${attempt}: username field not found`);
      if (attempt === MAX_ATTEMPTS) {
        // Debug: dump page state to understand the actual structure
        const html = await page.evaluate(() => document.body?.innerHTML?.slice(0, 5000) ?? "no body");
        console.log("[browser] ⛔ Could not find username field. Page HTML (first 5k chars):\n", html);
        try {
          const tmpDir = join(tmpdir(), "asta-browser");
          mkdirSync(tmpDir, { recursive: true });
          await page.screenshot({ path: join(tmpDir, "beid-login-fail.png"), fullPage: false });
          console.log("[browser] Screenshot saved to", join(tmpDir, "beid-login-fail.png"));
        } catch (_) { }
      }
      continue;
    }

    // 2. Fill username — try specific selectors, fallback to first visible text input
    const usernameField = await page.$(
      `input[name="username"], input#username, input[autocomplete="username"], input[type="email"], input[name="email"]`
    );
    if (usernameField) {
      await usernameField.fill(username);
    } else {
      // Grab the first visible text/email input as a last resort (skip OTP inputs)
      await page.fill(`input[type="text"]${otpExclusion}, input:not([type]):not([maxlength="6"])`, username);
    }

    // 3. Password + submit
    await page.waitForSelector(pwSelectors, { timeout: 5_000 });
    await page.fill(pwSelectors, password);
    await page.click(submitBtn);
    await page.waitForLoadState("load", { timeout: 10_000 }).catch(() => { });

    // If the page already left BEID, login succeeded without OTP — done
    if (!new URL(page.url()).hostname.includes(BEID_HOST)) {
      console.log("[browser] Login complete (redirected off BEID) —", page.url());
      return;
    }

    // 4. OTP step (Google Authenticator / TOTP) — wait up to 3s for it to appear
    let otpInput: Awaited<ReturnType<Page["$"]>> = null;
    try {
      otpInput = await page.waitForSelector(otpSelectors, { timeout: 3_000 });
    } catch { }

    if (otpInput) {
      const token = await generateTOTP();
      console.log("[browser] Submitting TOTP:", token);
      await otpInput.fill(token);
      await page.click(submitBtn);
      await page.waitForLoadState("load", { timeout: 10_000 }).catch(() => { });
      console.log("[browser] Login complete —", page.url());
      return;
    }

    // No OTP step — login did NOT advance. Capture the page error and retry.
    lastErrorText = await page
      .evaluate(() => {
        const sels = [
          ".alert-error",
          ".kc-feedback-text",
          "#input-error",
          ".alert-danger",
          "[class*='error']",
          ".alert",
        ];
        for (const sel of sels) {
          const el = document.querySelector(sel);
          const text = el?.textContent?.trim();
          if (text) return text.slice(0, 500);
        }
        return "";
      })
      .catch(() => "");
    console.error(
      `[browser] Attempt ${attempt}/${MAX_ATTEMPTS}: no OTP step reached.`,
      lastErrorText ? "Page error: " + lastErrorText : "",
      "URL:",
      page.url(),
    );
  }

  // All attempts exhausted — stop and notify admin via WhatsApp (at most once/min)
  console.error(`[browser] ⛔ BeID login failed after ${MAX_ATTEMPTS} attempts (no OTP step reached).`);
  const now = Date.now();
  if (now - lastBeidFailureNotifiedAt > 60_000) {
    lastBeidFailureNotifiedAt = now;
    await sendWhatsAppText(
      [
        "*⚠️ BSrE Auto-Sync Gagal*",
        "",
        `Login ke portal BSrE gagal setelah ${MAX_ATTEMPTS} kali percobaan (tidak sampai ke langkah OTP).`,
        "Kemungkinan *password portal BSrE telah berubah* atau akun terkendala.",
        "",
        lastErrorText ? `Pesan dari halaman: ${lastErrorText}` : "",
        "",
        `URL: ${page.url()}`,
        `Waktu: ${new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}`,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  throw new Error(`BeID login failed after ${MAX_ATTEMPTS} attempts: no OTP step reached (password changed?)`);
}

// ---------------------------------------------------------------------------
// Misc helpers
// ---------------------------------------------------------------------------

/** Intercept API requests to capture Bearer token from Authorization header */
export async function captureApiToken(page: Page): Promise<string | null> {
  let captured: string | null = null;
  const handler = (req: any) => {
    const auth = req.headers()?.["authorization"];
    if (auth && auth.startsWith("Bearer ") && !captured) {
      captured = auth;
    }
  };
  page.on("request", handler);
  // Give SPA a moment to fire authenticated requests
  await new Promise((r) => setTimeout(r, 1_000));
  page.off("request", handler);
  return captured;
}

/** Read access_token from the page's localStorage, cookies, or API request headers */
export async function getAccessToken(page: Page): Promise<string | null> {
  try {
    // 1. Check cookies
    const cookies = await page.context().cookies();
    for (const c of cookies) {
      if (c.name.toLowerCase().includes("token") || c.name.toLowerCase().includes("bearer")) {
        return c.value;
      }
    }

    // 2. Check localStorage/sessionStorage
    const result = await page.evaluate(() => {
      const candidates = [
        "access_token", "token", "auth_token", "bearer_token",
        "kc-access-token", "oidc.access_token", "keycloak-token"
      ];
      for (const key of candidates) {
        const val = localStorage.getItem(key) || sessionStorage.getItem(key);
        if (val) return val;
      }
      // Brute-force fallback: any value over 100 chars is likely a JWT
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)!;
        const val = localStorage.getItem(key);
        if (val && val.length > 100) return val;
      }
      return null;
    });
    if (result) return result as string;

    // 3. Capture from API request headers
    return await captureApiToken(page);
  } catch (e) {
    console.error("[bsre] getAccessToken error:", e);
    return null;
  }
}

/** Save token to persistent store after successful login */
export async function cacheToken(userId: string, page: Page): Promise<string | null> {
  const token = await getAccessToken(page);
  if (token) {
    tokenStore.set(userId, token.startsWith('Bearer ') ? token : `Bearer ${token}`);
    console.log('[bsre] Token cached for', userId);
  }
  return token;
}

/** Returns { active, mode, startedAt } or { active: false } */
export function sessionInfo(userId: string) {
  const session = sessions.get(userId);
  if (!session) return { active: false as const };
  return { active: true as const, mode: session.mode, startedAt: session.startedAt.toISOString() };
}
