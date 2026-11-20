// Captures the README screenshots from the demo-mode dashboard (sample data).
// Usage: start `STAGEDIRECTOR_DEV_LOGIN=demo npx next dev -p 53110` without
// GitHub credentials, then `node scripts/screenshots.mjs [baseUrl]`.
import { chromium } from "@playwright/test";

const BASE = process.argv[2] ?? "http://localhost:53110";
const OUT = "docs/screenshots";
const MP = "/p/netdevs-net~mariasplace";

const shots = [
  ["home", "/"],
  ["project", MP],
  ["review", `${MP}/review`],
  ["live", `${MP}/live`],
  ["history", `${MP}/history`],
  ["toolbox", `${MP}/toolbox`],
  ["banners", "/banners"],
];

const browser = await chromium.launch();
for (const [mode, viewport] of [["", { width: 1440, height: 1000 }], ["-phone", { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, colorScheme: "light" });
  const page = await ctx.newPage();
  // Hide the Next.js dev badge so it does not appear in the pictures.
  await ctx.addInitScript(() => { const s = () => { const st = document.createElement("style"); st.textContent = "nextjs-portal{display:none!important}"; document.head.appendChild(st); }; document.readyState === "loading" ? addEventListener("DOMContentLoaded", s) : s(); });
  for (const [name, path] of shots) {
    await page.goto(BASE + path, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/${name}${mode}.png` });
    console.log("saved", `${name}${mode}.png`);
  }
  // A run in progress: press the button, then show the run window over the project.
  await page.goto(BASE + MP, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Update staging from main/ }).click();
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${OUT}/running${mode}.png` });
  await page.goto(`${BASE}${MP}/updating?stage=staging`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/updating${mode}.png` });
  console.log("saved", `running${mode}.png`, `updating${mode}.png`);
  await ctx.close();
}
await browser.close();
