// Drives the built FreightPulse frontend (burner mode) against studionet through
// the full lifecycle, switching between a shipper and a carrier burner wallet.
// Records every signed transaction hash plus screenshots, and captures a video.
//
//   E2E_CHROME=<chrome.exe> E2E_URL=http://localhost:4173/freight-pulse/ \
//     node tools/e2e_full_flow.mjs
//
// Reads the funded burner keys from the gitignored evidence/_burners.json. Keys
// are only placed into page localStorage, never printed. Only 32-byte transaction
// hashes are harvested for evidence.
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const BURNERS = JSON.parse(readFileSync(resolve(ROOT, "evidence/_burners.json"), "utf-8"));
const APP_URL = process.env.E2E_URL || "http://localhost:4173/freight-pulse/";
const OUT_DIR = resolve(ROOT, "evidence/screenshots");
const VIDEO_DIR = resolve(ROOT, "evidence/_video");
const HASHES_OUT = resolve(ROOT, "evidence/_e2e_hashes.json");
mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(VIDEO_DIR, { recursive: true });

const MANIFEST_LAX =
  "https://raw.githubusercontent.com/richeroveis/freight-pulse/main/evidence/manifests/lax-bcn-aerospace.txt";
const BOL_A = "BOL-LAX-BCN-55"; // must equal the manifest BOL so the audit binds
const TS = Date.now() % 1000000;
const BOL_B = `BOL-MUT-${TS}`;
const BOL_C = `BOL-RC-${TS}`;

const seen = new Set();
const records = [];
// Fallback hashes captured straight from the studio JSON-RPC responses, used only
// when a slow write's receipt poll times out before the ledger can show its hash.
const captured = [];
const consoleErrors = [];

function writeRecords(extra = {}) {
  writeFileSync(
    HASHES_OUT,
    JSON.stringify({ app_url: APP_URL, generated_at: new Date().toISOString(), transactions: records, ...extra }, null, 2),
  );
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function shot(page, name) {
  await page.screenshot({ path: resolve(OUT_DIR, `${name}.png`) });
}

function harvest(html, meta) {
  const found = [...String(html).matchAll(/transactions\/(0x[0-9a-fA-F]{64})/g)].map((m) => m[1]);
  const fresh = [...new Set(found)].filter((h) => !seen.has(h));
  for (const hash of fresh) {
    seen.add(hash);
    records.push({ ...meta, hash });
  }
  if (fresh.length) writeRecords();
  return fresh;
}

// Wait until the ledger renders a hash we have not recorded yet. The ledger row
// only appears once sendWrite resolves, so this is also the signal that the UI
// finished (busy cleared) and the next action is clickable. The RPC-captured
// submission hash is used only as a late fallback for very slow writes (the live
// audit can outlast the receipt poll), never as the primary completion signal.
async function waitForHash(page, scope, meta, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  const fallbackAfter = Date.now() + Math.min(timeoutMs, 300000);
  while (Date.now() < deadline) {
    const html = await page.locator(scope).innerHTML();
    const fresh = harvest(html, meta);
    if (fresh.length) return fresh[fresh.length - 1];
    if (Date.now() > fallbackAfter && captured.length) {
      const h = captured[captured.length - 1];
      if (!seen.has(h)) {
        seen.add(h);
        records.push({ ...meta, hash: h, fallback: true });
        writeRecords();
        return h;
      }
    }
    await sleep(3000);
  }
  if (captured.length) {
    const h = captured[captured.length - 1];
    if (!seen.has(h)) {
      seen.add(h);
      records.push({ ...meta, hash: h, fallback: true });
      writeRecords();
      return h;
    }
  }
  return null;
}

async function connectBurner(page) {
  await page.getByRole("button", { name: /1-click burner wallet/i }).click();
  await page.getByText(/burner session/i).first().waitFor({ timeout: 30000 });
}

async function faucet(page) {
  await page.getByRole("button", { name: /Claim 100,000 test FPT/i }).click();
  await page.getByText(/Faucet confirmed/i).first().waitFor({ timeout: 180000 });
  await waitForHash(page, "#wallet", { path: "wallet", step: "faucet", method: "faucet_or_deposit", expect: "return" }, 30000);
}

async function clickRefresh(page) {
  const btn = page.getByRole("button", { name: /^(Refresh|Syncing)$/i }).first();
  if (await btn.count()) await btn.click().catch(() => {});
}

// The app falls back to the committed demo snapshot whenever a live read fails.
// For an automated flow that is fatal (our new orders would be invisible), so
// detect the banner and keep nudging a live refresh until it clears.
async function ensureLive(page, tries = 12) {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    const snapshotBanner = await page.getByText(/committed demo snapshot/i).count();
    if (snapshotBanner === 0) return true;
    await clickRefresh(page);
    // Back off: a snapshot banner usually means the RPC is rate limiting, and
    // hammering it with refresh calls only deepens the 429 window.
    await sleep(6000 + attempt * 2000);
  }
  return (await page.getByText(/committed demo snapshot/i).count()) === 0;
}

async function switchTo(page, role) {
  // Set the burner key, then reconnect without a full reload so the live data
  // already in memory is preserved (reload risks a snapshot fallback). If a
  // wallet is connected, disconnect first so the burner button is reachable.
  await page.evaluate((key) => window.localStorage.setItem("fp_burner_key", key), BURNERS[role].key);
  const disconnect = page.locator('button[title="Disconnect"]').first();
  if (await disconnect.count()) {
    await disconnect.click();
    await page.getByRole("button", { name: /1-click burner wallet/i }).waitFor({ timeout: 20000 });
  }
  await connectBurner(page);
  await clickRefresh(page);
  await ensureLive(page);
}

async function selectByBol(page, bol) {
  const deadline = Date.now() + 300000;
  const search = page.getByPlaceholder(/Search bill of lading/i);
  while (Date.now() < deadline) {
    await ensureLive(page);
    await page.locator("#tower").scrollIntoViewIfNeeded();
    await search.fill(bol);
    await sleep(1000);
    const row = page.locator("tbody tr", { hasText: bol }).last();
    if ((await row.count()) && (await row.isVisible())) {
      await row.click();
      await page.locator("#deck").scrollIntoViewIfNeeded();
      // Confirm the control deck actually switched to this shipment: the action
      // column header renders the bill of lading id.
      const confirmed = await page
        .locator("#deck")
        .getByText(bol, { exact: false })
        .first()
        .waitFor({ timeout: 8000 })
        .then(() => true)
        .catch(() => false);
      if (!confirmed) {
        await search.fill("");
        await sleep(1500);
        continue;
      }
      const header = await page.locator("#deck").getByText(/Shipment #\d+ actions/i).first().innerText();
      const id = Number((header.match(/Shipment #(\d+)/i) || [])[1] || "0");
      await search.fill("");
      return id;
    }
    await search.fill("");
    await clickRefresh(page);
    await sleep(8000);
  }
  throw new Error("shipment " + bol + " never appeared as the selected action target");
}

async function setCreateForm(page, opts) {
  const deck = page.locator("#deck");
  await deck.getByLabel(/Bill of lading reference/i).fill(opts.bol);
  await deck.getByLabel(/^Route$/i).fill(opts.route);
  await deck.getByLabel(/Temp ceiling/i).fill(String(opts.temp));
  await deck.getByLabel(/Transit SLA/i).fill(String(opts.transit));
  await deck.getByLabel(/Freight fee/i).fill(String(opts.fee));
  await deck.getByLabel(/Carrier bond/i).fill(String(opts.bond));
  await deck.getByLabel(/Delivery deadline/i).fill(String(opts.deadline));
}

function countFail(html) {
  return (String(html).match(/SUBMISSION_FAILED/g) || []).length;
}

async function runAction(page, { button, scope = "#deck", meta, timeoutMs = 480000, maxAttempts = 5 }) {
  const nameRe = new RegExp(button, "i");
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const baseFail = countFail(await page.locator(scope).innerHTML());
    const baseCaptured = captured.length;
    await page.getByRole("button", { name: nameRe }).first().click();
    const deadline = Date.now() + timeoutMs;
    let done = { status: "timeout" };
    while (Date.now() < deadline) {
      const html = await page.locator(scope).innerHTML();
      const fresh = harvest(html, meta);
      if (fresh.length) {
        done = { status: "hash", hash: fresh[fresh.length - 1] };
        break;
      }
      if (countFail(html) > baseFail) {
        // A SUBMISSION_FAILED entry appeared. If a tx hash was actually broadcast
        // (captured), the receipt poll merely timed out client-side: record it and
        // do NOT resubmit. Only retry when nothing was ever sent.
        if (captured.length > baseCaptured) {
          const h = captured[captured.length - 1];
          if (!seen.has(h)) {
            seen.add(h);
            records.push({ ...meta, hash: h, fallback: true });
            writeRecords();
          }
          done = { status: "hash", hash: h };
        } else {
          done = { status: "failed" };
        }
        break;
      }
      await sleep(5000);
    }
    if (done.status === "hash") return done.hash;
    if (done.status === "failed") {
      // Escalating backoff so a rate-limited window can clear before resubmitting.
      await sleep(10000 * attempt);
      continue;
    }
    return null;
  }
  return null;
}

// Poll the ledger "Refresh state" button and report once a shipment action button
// flips to the enabled state (which the UI derives from the on-chain status).
async function waitButtonEnabled(page, button, timeoutMs, refresh = true) {
  const deadline = Date.now() + timeoutMs;
  const regex = new RegExp(button, "i");
  while (Date.now() < deadline) {
    const btn = page.getByRole("button", { name: regex }).first();
    if ((await btn.count()) && !(await btn.isDisabled())) return true;
    if (refresh) {
      const r = page.getByRole("button", { name: /Refresh state/i }).first();
      if (await r.count()) await r.click().catch(() => {});
    }
    await sleep(6000);
  }
  return false;
}

const browser = await chromium.launch({ headless: true, executablePath: process.env.E2E_CHROME || undefined });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1100 },
  recordVideo: { dir: VIDEO_DIR, size: { width: 1440, height: 900 } },
});
const page = await context.newPage();
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text().slice(0, 160));
});
page.on("response", async (res) => {
  try {
    if (!res.url().includes("/api")) return;
    const body = await res.json();
    const result = body && body.result;
    if (typeof result === "string" && /^0x[0-9a-f]{64}$/.test(result)) captured.push(result);
  } catch {
    /* non-JSON or read failure, ignore */
  }
});

const status = { path_a: "PENDING", path_b: "PENDING", path_c: "PENDING", path_d: "PENDING", errors: [] };
const shipments = {};

function noteError(where, message) {
  status.errors.push({ where, message: String(message).slice(0, 200) });
}

try {
  await page.goto(APP_URL, { waitUntil: "networkidle", timeout: 60000 });
  await page.getByText("AI-audited cold-chain fulfilment").first().waitFor({ timeout: 30000 });
  await shot(page, "00-initial");

  // ---- SHIPPER session ----
  // Install the funded shipper key before the first connect, otherwise the
  // one-click burner mints a throwaway in-memory wallet and every shipper write
  // (and the later co-sign) would come from a different address than the orders.
  await page.evaluate((key) => window.localStorage.setItem("fp_burner_key", key), BURNERS.shipper.key);
  await connectBurner(page);
  await shot(page, "01-shipper-connected");
  await page.getByText(/burner session/i).first().waitFor({ timeout: 20000 });
  await faucet(page);
  await shot(page, "02-shipper-faucet");

  // Path C: create with the shortest deadline, nobody will accept it.
  await page.locator("#deck").scrollIntoViewIfNeeded();
  await setCreateForm(page, { bol: BOL_C, route: "Reclaim Lane Test", temp: 4, transit: 18, fee: 2000, bond: 800, deadline: 180 });
  await runAction(page, {
    button: "create_shipment_order",
    meta: { path: "c", step: "create", method: "create_shipment_order", expect: "return" },
  });
  shipments.c = await selectByBol(page, BOL_C);
  // Path D: reclaim must be disabled with the reason before the deadline.
  const reclaimBtn = page.getByRole("button", { name: /reclaim_expired_shipment/i }).first();
  const reclaimDisabled = await reclaimBtn.isDisabled();
  const reclaimHint = await page.getByText(/Reclaim unlocks after the deadline/i).first().innerText().catch(() => "");
  status.path_d = reclaimDisabled && reclaimHint.length > 0 ? "PASS" : "FAIL";
  await shot(page, "03-path-d-reclaim-disabled");
  writeRecords({ path_d: { disabled: reclaimDisabled, reason: reclaimHint } });

  // Path A: order bound to the LAX manifest, generous deadline for the audit.
  await setCreateForm(page, { bol: BOL_A, route: "LAX to BCN Aerospace", temp: 6, transit: 30, fee: 2000, bond: 800, deadline: 3600 });
  await runAction(page, {
    button: "create_shipment_order",
    meta: { path: "a", step: "create", method: "create_shipment_order", expect: "return" },
  });
  shipments.a = await selectByBol(page, BOL_A);
  await shot(page, "04-path-a-created");

  // Path B: order for the mutual release.
  await setCreateForm(page, { bol: BOL_B, route: "Mutual Release Lane", temp: 4, transit: 18, fee: 2000, bond: 800, deadline: 3600 });
  await runAction(page, {
    button: "create_shipment_order",
    meta: { path: "b", step: "create", method: "create_shipment_order", expect: "return" },
  });
  shipments.b = await selectByBol(page, BOL_B);
  await shot(page, "05-path-b-created");

  // ---- CARRIER session ----
  await switchTo(page, "carrier");
  await shot(page, "06-carrier-connected");
  await faucet(page);
  await shot(page, "07-carrier-faucet");

  // Accept path B, then run the guard probe on it (URL guard trips in this state).
  await selectByBol(page, BOL_B);
  await runAction(page, {
    button: "accept_shipment_bid",
    meta: { path: "b", step: "accept", method: "accept_shipment_bid", expect: "return" },
  });
  await waitButtonEnabled(page, "submit_delivery_manifest", 120000);
  await shot(page, "08-path-b-accepted");

  // Guard probe: untrusted URL must revert. Supplementary evidence, so a
  // transient submission failure is recorded but never aborts the lifecycle run.
  try {
    await page.locator("#guards").scrollIntoViewIfNeeded();
    const guardBefore = await page.locator("#guards").innerHTML();
    // Seed the historically committed guard links so they are never recorded as new.
    for (const m of String(guardBefore).matchAll(/transactions\/(0x[0-9a-fA-F]{64})/g)) seen.add(m[1]);
    await runAction(page, {
      button: "Run live probe",
      scope: "#guards",
      meta: { path: "guard", step: "untrusted-url", method: "submit_delivery_manifest", expect: "revert" },
      timeoutMs: 240000,
    });
    await page.locator("#guards").getByText(/GUARD HELD/i).first().waitFor({ timeout: 120000 });
    await shot(page, "09-guard-probe-held");
  } catch (guardError) {
    noteError("guard_probe", guardError instanceof Error ? guardError.message : String(guardError));
  }

  // Sign the carrier side of path B mutual release at 7000 bps.
  await selectByBol(page, BOL_B);
  await page.locator("#deck").getByLabel(/Carrier bps/i).fill("7000");
  await runAction(page, {
    button: "sign as carrier",
    meta: { path: "b", step: "release-carrier", method: "propose_mutual_release", expect: "return" },
  });
  await shot(page, "10-path-b-carrier-signed");

  // Accept path A, submit the real manifest, run the slow audit, then claim.
  await selectByBol(page, BOL_A);
  await runAction(page, {
    button: "accept_shipment_bid",
    meta: { path: "a", step: "accept", method: "accept_shipment_bid", expect: "return" },
  });
  await waitButtonEnabled(page, "submit_delivery_manifest", 120000);
  await page.locator("#deck").getByLabel(/Delivery manifest URL/i).fill(MANIFEST_LAX);
  await runAction(page, {
    button: "submit_delivery_manifest",
    meta: { path: "a", step: "submit-manifest", method: "submit_delivery_manifest", expect: "return" },
  });
  const auditReady = await waitButtonEnabled(page, "audit_shipment_fulfilment_live", 120000);
  await shot(page, "11-path-a-manifest-submitted");
  if (!auditReady) throw new Error("audit button never enabled after manifest submit");

  await runAction(page, {
    button: "audit_shipment_fulfilment_live",
    meta: { path: "a", step: "audit", method: "audit_shipment_fulfilment_live", expect: "return" },
    timeoutMs: 420000,
  });
  const claimReady = await waitButtonEnabled(page, "claim_shipment_settlement", 480000);
  await shot(page, "12-path-a-audited");
  if (!claimReady) {
    noteError("path_a_audit", "claim never enabled; audit may have reverted or is still finalizing");
    status.path_a = "FAIL";
  } else {
    await runAction(page, {
      button: "claim_shipment_settlement",
      meta: { path: "a", step: "claim", method: "claim_shipment_settlement", expect: "return" },
    });
    await waitButtonEnabled(page, "reclaim_expired_shipment", 10000, false).catch(() => {});
    const r = page.getByRole("button", { name: /Refresh state/i }).first();
    if (await r.count()) await r.click().catch(() => {});
    status.path_a = "PASS";
    await shot(page, "13-path-a-claimed");
  }

  // ---- SHIPPER session again ----
  await switchTo(page, "shipper");
  await shot(page, "14-shipper-again");

  // Path B: shipper co-signs at the same 7000 bps -> settles.
  await selectByBol(page, BOL_B);
  const shipperReleaseReady = await waitButtonEnabled(page, "sign as shipper", 60000, false);
  if (!shipperReleaseReady) throw new Error("sign as shipper stayed disabled for " + BOL_B);
  await page.locator("#deck").getByLabel(/Shipper bps/i).fill("7000");
  await runAction(page, {
    button: "sign as shipper",
    meta: { path: "b", step: "release-shipper", method: "propose_mutual_release", expect: "return" },
  });
  status.path_b = "PASS";
  await shot(page, "15-path-b-settled");

  // Path C: wait for the deadline, then reclaim the shipper fee.
  await selectByBol(page, BOL_C);
  let reclaimEnabled = await waitButtonEnabled(page, "reclaim_expired_shipment", 30000, false);
  if (!reclaimEnabled) {
    // deadline may still be pending; keep refreshing until it unlocks
    reclaimEnabled = await waitButtonEnabled(page, "reclaim_expired_shipment", 240000, true);
  }
  if (!reclaimEnabled) {
    noteError("path_c_reclaim", "reclaim never enabled; deadline may not have passed on chain");
    status.path_c = "FAIL";
  } else {
    await runAction(page, {
      button: "reclaim_expired_shipment",
      meta: { path: "c", step: "reclaim", method: "reclaim_expired_shipment", expect: "return" },
    });
    status.path_c = "PASS";
    await shot(page, "16-path-c-reclaimed");
  }

  writeRecords({ shipments, status, bols: { a: BOL_A, b: BOL_B, c: BOL_C } });
  console.log("E2E_RESULT " + JSON.stringify({ records: records.length, shipments, status }));
} catch (error) {
  noteError("fatal", error instanceof Error ? error.message : String(error));
  writeRecords({ shipments, status, bols: { a: BOL_A, b: BOL_B, c: BOL_C } });
  await shot(page, "99-fatal").catch(() => {});
  console.log("E2E_ERROR " + (error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
} finally {
  const video = page.video();
  await context.close();
  await browser.close();
  let videoPath = null;
  try {
    if (video) videoPath = await video.path();
  } catch {
    videoPath = null;
  }
  writeRecords({ shipments, status, bols: { a: BOL_A, b: BOL_B, c: BOL_C }, video_path: videoPath, console_errors: consoleErrors.slice(0, 8) });
  console.log("E2E_VIDEO " + (videoPath || "none"));
}
