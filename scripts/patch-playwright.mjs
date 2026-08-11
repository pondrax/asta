// Patch playwright-core so connectOverCDP works under Bun.
//
// Root cause: playwright-core bundles its own copy of the `ws` client
// (inlined deps: receiver/sender/permessage-deflate) in utilsBundle.js.
// Under Bun, that inlined ws hangs at the WS upgrade/connect phase, while
// Bun's built-in `ws` module (and node's npm `ws`) connect fine.
//
// Fix: make utilsBundle's `ws` export prefer the real `ws` module
// (Bun built-in, or npm ws@8 on node), falling back to the inlined copy.
// The earlier agent/deflate patches in coreBundle.js are kept: they reduce
// negotiation surface and are harmless with the real ws implementation.
//
// Backup first, idempotent, prints what it changed.
import fs from "node:fs";
import path from "node:path";

const coreFile = path.resolve("node_modules/playwright-core/lib/coreBundle.js");
const utilsFile = path.resolve("node_modules/playwright-core/lib/utilsBundle.js");

// If playwright-core isn't installed (fresh clone before bun install finishes),
// exit silently — the postinstall hook runs after deps are present anyway.
if (!fs.existsSync(coreFile) || !fs.existsSync(utilsFile)) {
  console.log("playwright-core not found — skipping patch");
  process.exit(0);
}

const backups = [coreFile, utilsFile];
for (const f of backups) {
  const bak = f + ".bak";
  if (!fs.existsSync(bak)) fs.copyFileSync(f, bak);
}

let core = fs.readFileSync(coreFile, "utf8");
const origCore = core;

// 1) Drop the happy-eyeballs agent → plain default agent
{
  const marker = "httpsHappyEyeballsAgent : httpHappyEyeballsAgent,";
  const start = core.indexOf("agent: /^");
  if (start !== -1) {
    const end = core.indexOf(marker, start) + marker.length;
    core = core.slice(0, start) + "agent: undefined," + core.slice(end);
  }
}

// 2) Disable permessage-deflate negotiation
core = core.replace(/perMessageDeflate: perMessageDeflate2/, "perMessageDeflate: false");

const coreChanged = core !== origCore;
if (coreChanged) fs.writeFileSync(coreFile, core);

// 3) utilsBundle: prefer the real `ws` module over the inlined copy
let utils = fs.readFileSync(utilsFile, "utf8");
const origUtils = utils;
utils = utils.replace(
  /var ws = wrapper_default;/,
  `var ws = (() => { try { var __extWs = require("ws"); if (typeof __extWs === "function") return __extWs; if (__extWs && __extWs.default) return __extWs.default; } catch (e) {} return wrapper_default; })();`,
);
const utilsChanged = utils !== origUtils;
if (utilsChanged) fs.writeFileSync(utilsFile, utils);

console.log("core agent patched:", core.includes("agent: undefined,"));
console.log("core deflate patched:", core.includes("perMessageDeflate: false"));
console.log("utils ws->external patched:", utils.includes('require("ws")'));
console.log("changed:", coreChanged, utilsChanged);
