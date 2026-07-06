/**
 * Browser automation utilities using playwright-core.
 * Handles session management, BeID auto-login, and TOTP.
 */
import { chromium, type Browser, type Page } from "playwright-core";
import { env } from "$env/dynamic/private";
import * as OTPAuth from "otpauth";
import { tmpdir } from "os";
import { join } from "path";
import { mkdirSync } from "fs";

const BEID_HOST = "beid.bssn.go.id";

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
// TOTP
// ---------------------------------------------------------------------------

export function getTOTP(): OTPAuth.TOTP {
  const raw = env.PORTAL_OTP_AUTH ?? "";
  const uri = raw.startsWith("otpauth:") ? raw : `otpauth:${raw}`;
  if (raw.startsWith("//totp/") || raw.startsWith("otpauth://totp/")) {
    return OTPAuth.URI.parse(uri) as OTPAuth.TOTP;
  }
  return new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(raw) });
}

export function generateTOTP(): string {
  return getTOTP().generate();
}

// ---------------------------------------------------------------------------
// Shared browser connection — CDP connects once, local launches per-session
// ---------------------------------------------------------------------------

let sharedBrowser: Browser | null = null;
let sharedBrowserMode = "";

async function getOrCreateBrowser(): Promise<{ browser: Browser; mode: string }> {
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
    sharedBrowser = await chromium.connectOverCDP(remoteUrl);
    sharedBrowserMode = `remote:${remoteUrl}`;
    return { browser: sharedBrowser, mode: sharedBrowserMode };
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

export async function handleBeIDLogin(page: Page): Promise<void> {
  if (!new URL(page.url()).hostname.includes(BEID_HOST)) return;
  console.log("[browser] BeID detected — auto-login...");

  // Wait for full page load (all resources + JS rendering) before looking for fields
  await page.waitForLoadState("load", { timeout: 8_000 }).catch(() => { });
  // Give SPA a moment to render the form
  await page.waitForTimeout(1_000);

  const pageUrl = page.url();
  console.log("[browser] BeID page URL:", pageUrl);

  // Try a broader set of selectors for the username/email field
  const usernameSelectors = [
    'input[name="username"]',
    'input[type="text"]',
    'input#username',
    'input[autocomplete="username"]',
    'input[name="email"]',
    'input[type="email"]',
    'input[placeholder*="user" i]',
    'input[placeholder*="email" i]',
    'input[placeholder*="akun" i]',
  ].join(", ");

  try {
    await page.waitForSelector(usernameSelectors, { timeout: 8_000 });
  } catch (err) {
    // Debug: dump page state to understand the actual structure
    const html = await page.evaluate(() => document.body?.innerHTML?.slice(0, 5000) ?? "no body");
    console.log("[browser] ⛔ Could not find username field. Page HTML (first 5k chars):\n", html);
    try {
      const tmpDir = join(tmpdir(), "asta-browser");
      mkdirSync(tmpDir, { recursive: true });
      await page.screenshot({ path: join(tmpDir, "beid-login-fail.png"), fullPage: false });
      console.log("[browser] Screenshot saved to", join(tmpDir, "beid-login-fail.png"));
    } catch (_) { }
    throw err;
  }

  // Fill username — try specific selectors, fallback to first visible text input
  const usernameField = await page.$(
    'input[name="username"], input#username, input[autocomplete="username"], input[type="email"], input[name="email"]'
  );
  if (usernameField) {
    await usernameField.fill(env.PORTAL_BSRE_USERNAME);
  } else {
    // Grab the first visible text/email input as a last resort
    await page.fill('input[type="text"], input:not([type])', env.PORTAL_BSRE_USERNAME);
  }

  // Password
  const pwSelectors = 'input[name="password"], input[type="password"], input#password';
  await page.waitForSelector(pwSelectors, { timeout: 5_000 });
  await page.fill(pwSelectors, env.PORTAL_BSRE_PASSWORD);

  // Submit button
  const submitBtn = 'button[type="submit"], input[type="submit"], button:has-text("Masuk"), button:has-text("Login"), button:has-text("Sign in")';
  await page.click(submitBtn);
  await page.waitForLoadState("load", { timeout: 10_000 }).catch(() => { });

  // OTP step (Google Authenticator / TOTP)
  await page.waitForTimeout(800);
  const otpSelectors = 'input[name="otp"], input[name="token"], input[placeholder*="OTP" i], input[placeholder*="authenticator" i], input[maxlength="6"], input#otp, input#token';
  const otpInput = await page.$(otpSelectors);
  if (otpInput) {
    const token = generateTOTP();
    console.log("[browser] Submitting TOTP:", token);
    await otpInput.fill(token);
    await page.click(submitBtn);
    await page.waitForLoadState("load", { timeout: 10_000 }).catch(() => { });
  } else {
    console.log("[browser] No OTP input found — proceeding");
  }

  console.log("[browser] Login complete —", page.url());
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
