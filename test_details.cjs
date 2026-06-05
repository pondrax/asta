const { chromium } = require("playwright-core");
const OTPAuth = require("otpauth");
const fs = require("fs");
const path = require("path");

const envPath = path.resolve(__dirname, ".env");
const envContent = fs.readFileSync(envPath, "utf-8");
const env = {};
envContent.split("\n").forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] ? match[2].trim() : "";
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    env[match[1]] = value;
  }
});

function getTOTP() {
  const raw = env.PORTAL_OTP_AUTH ?? "";
  const uri = raw.startsWith("otpauth:") ? raw : `otpauth:${raw}`;
  if (raw.startsWith("//totp/") || raw.startsWith("otpauth://totp/")) {
    return OTPAuth.URI.parse(uri);
  }
  return new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(raw) });
}

async function run() {
  const execPath = env.BROWSER_EXECUTABLE_PATH || "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser";
  const browser = await chromium.launch({ executablePath: execPath, headless: true });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();

  let authorizationToken = null;

  page.on("request", req => {
    const auth = req.headers()["authorization"];
    if (auth && auth.startsWith("Bearer ") && auth.length > 100) {
      authorizationToken = auth;
    }
  });

  await page.goto("https://portal-bsre.bssn.go.id/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector('input[name="username"]', { timeout: 20000 });
  await page.fill('input[name="username"]', env.PORTAL_BSRE_USERNAME);
  await page.fill('input[name="password"]', env.PORTAL_BSRE_PASSWORD);
  await page.click('button[type="submit"], input[type="submit"]');
  
  const otpInput = await page.waitForSelector('input[name="otp"], input[name="token"]', { timeout: 15000 }).catch(() => null);
  if (otpInput) {
    const totp = getTOTP();
    await otpInput.fill(totp.generate());
    await page.click('button[type="submit"], input[type="submit"]');
  }

  await page.waitForURL("**/portal-bsre.bssn.go.id/**", { timeout: 20000 });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 3000));

  if (authorizationToken) {
    console.log("Fetching user details...");
    const res = await fetch("https://portal-bsre.bssn.go.id/api/rest/manage/user/details/00191957-5439-42e5-94ef-f022bfe71fb8", {
      method: "GET",
      headers: {
        accept: "application/json, text/plain, */*",
        authorization: authorizationToken,
      }
    });

    console.log("Details Status:", res.status);
    const data = await res.json();
    console.log("User Details Full JSON:");
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log("Failed to capture authorization token.");
  }

  await browser.close();
}

run().catch(console.error);
