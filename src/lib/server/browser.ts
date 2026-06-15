/**
 * Browser automation utilities using playwright-core.
 * Handles session management, BeID auto-login, and TOTP.
 */
import { chromium, type Browser, type Page } from "playwright-core";
import { env } from "$env/dynamic/private";
import * as OTPAuth from "otpauth";

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
// Browser factory — prioritises BROWSER_REMOTE_DEBUG_URL over exec path
// ---------------------------------------------------------------------------

export async function getBrowser(): Promise<{ browser: Browser; mode: string }> {
  const remoteUrl = env.BROWSER_REMOTE_DEBUG_URL;
  if (remoteUrl) {
    const browser = await chromium.connectOverCDP(remoteUrl);
    return { browser, mode: `remote:${remoteUrl}` };
  }

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
// Session helpers
// ---------------------------------------------------------------------------

export async function closeSession(userId: string): Promise<void> {
  const session = sessions.get(userId);
  if (!session) return;
  try { await session.browser.close(); } catch (_) { }
  sessions.delete(userId);
}

export async function openSession(userId: string): Promise<BrowserSession> {
  await closeSession(userId);

  const { browser, mode } = await getBrowser();

  let ctx = browser.contexts()[0];
  if (!ctx) ctx = await browser.newContext({ ignoreHTTPSErrors: true });

  const page = await ctx.newPage() as Page;

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
        await page.waitForLoadState("domcontentloaded").catch(() => { });
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

  await page.waitForSelector(
    'input[name="username"], input[type="text"]',
    { timeout: 10_000 }
  );
  await page.fill('input[name="username"]', env.PORTAL_BSRE_USERNAME);
  await page.fill(
    'input[name="password"], input[type="password"]',
    env.PORTAL_BSRE_PASSWORD
  );
  await page.click(
    'button[type="submit"], input[type="submit"], button:has-text("Masuk"), button:has-text("Login")'
  );
  await page.waitForLoadState("domcontentloaded", { timeout: 15_000 });

  // OTP step (Google Authenticator)
  const otpInput = await page.$(
    'input[name="otp"], input[name="token"], input[placeholder*="OTP"], input[placeholder*="authenticator"], input[maxlength="6"]'
  );
  if (otpInput) {
    const token = generateTOTP();
    console.log("[browser] Submitting TOTP:", token);
    await otpInput.fill(token);
    await page.click('button[type="submit"], input[type="submit"]');
    await page.waitForLoadState("domcontentloaded", { timeout: 15_000 });
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
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => { });
  // Give SPA a moment to fire authenticated requests
  await new Promise((r) => setTimeout(r, 2000));
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

    // 2. Check localStorage/sessionStorage (without logging every time)
    const result = await page.evaluate(() => {
      const candidates = ["access_token", "token", "auth_token", "bearer_token", "kc-access-token"];
      for (const key of candidates) {
        const val = localStorage.getItem(key) || sessionStorage.getItem(key);
        if (val) return val;
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
