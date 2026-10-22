// Drives the built FreightPulse frontend in burner mode against studionet and
// captures the real lifecycle transactions plus a guard revert. Reads the funded
// burner key from the gitignored evidence/_e2e_key.txt (never printed). Run:
//   npx playwright ... is not used; run with: node tools/e2e_ui_flow.mjs
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const KEY = readFileSync(resolve(ROOT, "evidence/_e2e_key.txt"), "utf-8").trim();
const APP_URL = process.env.E2E_URL || "http://localhost:4173/freight-pulse/";
const OUT_DIR = resolve(ROOT, "evidence/screenshots");
mkdirSync(OUT_DIR, { recursive: true });

const collected = [];

async function shot(page, name) {
  await page.screenshot({ path: resolve(OUT_DIR, `${name}.png`), fullPage: false });
}

function harvestHashes(html) {
  const matches = [...String(html).matchAll(/transactions\/(0x[0-9a-fA-F]{64})/g)];
  return [...new Set(matches.map((m) => m[1]))];
}

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.E2E_CHROME || undefined,
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
await context.addInitScript(([key]) => {
  try {
    window.localStorage.setItem("fp_burner_key", key);
  } catch {
    /* ignore */
  }
}, [KEY]);

const page = await context.newPage();
const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 160));
});

try {
  await page.goto(APP_URL, { waitUntil: "networkidle", timeout: 60000 });
  await page.getByText("AI-audited cold-chain fulfilment").first().waitFor({ timeout: 30000 });
  await shot(page, "00-initial");

  // Connect the funded burner wallet.
  await page.getByRole("button", { name: /1-click burner wallet/i }).click();
  await page.getByText(/burner session/i).first().waitFor({ timeout: 20000 });
  await shot(page, "01-burner-connected");

  // Faucet write.
  await page.getByRole("button", { name: /Claim 100,000 test FPT/i }).click();
  await page.getByText(/Faucet confirmed/i).first().waitFor({ timeout: 180000 });
  await shot(page, "02-faucet");

  // Create a shipment order through the control deck.
  await page.locator("#deck").scrollIntoViewIfNeeded();
  await page.getByLabel(/Bill of lading reference/i).fill(`BOL-E2E-${Date.now() % 1000000}`);
  await page.getByRole("button", { name: /create_shipment_order/i }).click();
  await page
    .locator("#deck")
    .getByText(/create shipment order/i)
    .first()
    .waitFor({ timeout: 180000 });
  await page.locator("#deck").getByText("FINALIZED").first().waitFor({ timeout: 60000 });
  await shot(page, "03-create-finalized");

  // Guard probe: a real transaction expected to revert.
  await page.locator("#guards").scrollIntoViewIfNeeded();
  const before = await page.locator("#guards").innerHTML();
  await page.getByRole("button", { name: /Run live probe/i }).first().click();
  await page.locator("#guards").getByText(/GUARD HELD/i).first().waitFor({ timeout: 180000 });
  await shot(page, "04-guard-held");
  const guardHtml = await page.locator("#guards").innerHTML();

  const deckHashes = harvestHashes(await page.locator("#deck").innerHTML());
  const guardHashes = harvestHashes(guardHtml).filter((h) => !before.includes(h));
  const faucetHashes = harvestHashes(await page.locator("#wallet").innerHTML());

  const summary = {
    app_url: APP_URL,
    faucet_hashes: faucetHashes,
    create_hashes: deckHashes,
    guard_probe_hashes: guardHashes,
    console_errors: consoleErrors.slice(0, 5),
  };
  writeFileSync(resolve(ROOT, "evidence/_e2e_hashes.json"), JSON.stringify(summary, null, 2));
  collected.push(summary);
  console.log("E2E_RESULT " + JSON.stringify(summary));
} catch (error) {
  await shot(page, "99-error");
  console.log("E2E_ERROR " + (error instanceof Error ? error.message : String(error)));
  console.log("console_errors " + JSON.stringify(consoleErrors.slice(0, 8)));
  process.exitCode = 1;
} finally {
  await browser.close();
}
