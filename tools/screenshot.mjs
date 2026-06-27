/* Screenshot harness: serves the static site and captures full-page PNGs
   at desktop + mobile widths so I can review and iterate visually.

   Usage:
     node tools/screenshot.mjs                 # desktop + mobile, full page
     node tools/screenshot.mjs --w 1440        # custom width
     node tools/screenshot.mjs --tag draft1    # filename tag
*/
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(__dirname, "shots");
fs.mkdirSync(OUT, { recursive: true });

const args = process.argv.slice(2);
const getArg = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : def;
};
const tag = getArg("tag", "current");
const customW = getArg("w", null);

const MIME = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let urlPath = decodeURIComponent(req.url.split("?")[0]);
      if (urlPath === "/") urlPath = "/index.html";
      const filePath = path.join(ROOT, urlPath);
      if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath)) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
      fs.createReadStream(filePath).pipe(res);
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let y = 0;
      const step = () => {
        const max = document.body.scrollHeight;
        y += Math.max(400, window.innerHeight * 0.8);
        window.scrollTo(0, y);
        if (y >= max) {
          window.scrollTo(0, 0);
          setTimeout(resolve, 350);
        } else {
          setTimeout(step, 90);
        }
      };
      step();
    });
  });
}

async function shoot(browser, base, { width, height, label }) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  await page.goto(base, { waitUntil: "networkidle", timeout: 60000 });
  try {
    await page.evaluate(() => document.fonts && document.fonts.ready);
  } catch {}
  await autoScroll(page);
  // Force the final, fully-revealed state so the capture shows the real design
  // rather than mid-animation opacity:0 sections.
  await page.evaluate(() => {
    document.querySelectorAll(".reveal").forEach((el) => el.classList.add("is-in"));
    const card = document.querySelector("[data-prov]");
    if (card) card.classList.add("is-shown");
  });
  await page.waitForTimeout(700);
  const file = path.join(OUT, `${label}-${tag}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log("saved", file);
  await ctx.close();
}

const server = await startServer();
const port = server.address().port;
const base = `http://127.0.0.1:${port}/index.html`;
const browser = await chromium.launch();

const sel = getArg("sel", null);
if (sel) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(base, { waitUntil: "networkidle", timeout: 60000 });
  try { await page.evaluate(() => document.fonts && document.fonts.ready); } catch {}
  await page.evaluate(() => {
    document.querySelectorAll(".reveal").forEach((el) => el.classList.add("is-in"));
    const card = document.querySelector("[data-prov]");
    if (card) card.classList.add("is-shown");
  });
  await page.waitForTimeout(500);
  const el = await page.$(sel);
  const file = path.join(OUT, `sel-${tag}.png`);
  await el.screenshot({ path: file });
  console.log("saved", file);
  await ctx.close();
} else if (customW) {
  await shoot(browser, base, { width: Number(customW), height: 900, label: `w${customW}` });
} else {
  await shoot(browser, base, { width: 1440, height: 900, label: "desktop" });
  await shoot(browser, base, { width: 390, height: 844, label: "mobile" });
}

await browser.close();
server.close();
console.log("done");
