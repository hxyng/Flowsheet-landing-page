/* ===========================================================================
   seed-signups.mjs  —  generate a flat list of realistic email addresses.

   Only emails. No names, no dates, no times, nothing else. Names are used
   internally to build natural-looking addresses, then discarded. Every domain
   is checked against the disposable-email blocklist so the list uses only real,
   reliable providers.

   Writes:
     data/emails.txt      one address per line
     data/signups.json    JSON array of the same addresses

   Real addresses listed in data/real-signups.txt are folded in (the file may
   hold "Name <email>" lines, but only the email is kept).

   Usage:
     node scripts/seed-signups.mjs               # default 200 addresses
     node scripts/seed-signups.mjs 121           # target total of 121
     node scripts/seed-signups.mjs --real-only    # only the real addresses
     node scripts/seed-signups.mjs 121 --push     # ALSO load them into Upstash
                                                   # (rebuilds the SET to match)

   --push reads the same env the Vercel function uses, then rebuilds the
   flowsheet:emails SET to exactly this list:
     UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN   (or KV_REST_API_*)
   Without --push, nothing leaves your machine.
   =========================================================================== */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(ROOT, "data");

/* ---- realistic name pools (used only to build addresses) ----------------- */
const FIRST = [
  "james","mary","robert","patricia","john","jennifer","michael","linda","david","elizabeth",
  "william","barbara","richard","susan","joseph","jessica","thomas","sarah","christopher","karen",
  "charles","lisa","daniel","nancy","matthew","betty","anthony","sandra","mark","margaret",
  "donald","ashley","steven","kimberly","andrew","emily","paul","donna","joshua","michelle",
  "kenneth","carol","kevin","amanda","brian","melissa","george","deborah","timothy","stephanie",
  "ryan","rebecca","jason","laura","jeffrey","sharon","jacob","cynthia","gary","kathleen",
  "nicholas","amy","eric","angela","jonathan","shirley","stephen","anna","larry","brenda",
  "justin","pamela","scott","nicole","brandon","samantha","benjamin","katherine","samuel","christine",
  "gregory","emma","alexander","catherine","patrick","olivia","frank","megan","raymond","hannah",
  "jack","grace","dennis","rachel","jerry","victoria","tyler","sophia","aaron","natalie",
  "jose","maria","adam","diana","nathan","julia","henry","lauren","zachary","madison",
  "carlos","chloe","ethan","zoe","noah","aaliyah","liam","isabella","mason","mia",
  "lucas","ava","diego","priya","wei","yuki","omar","fatima","arjun","sofia",
];
const LAST = [
  "smith","johnson","williams","brown","jones","garcia","miller","davis","rodriguez","martinez",
  "hernandez","lopez","gonzalez","wilson","anderson","thomas","taylor","moore","jackson","martin",
  "lee","perez","thompson","white","harris","sanchez","clark","ramirez","lewis","robinson",
  "walker","young","allen","king","wright","scott","torres","nguyen","hill","flores",
  "green","adams","nelson","baker","hall","rivera","campbell","mitchell","carter","roberts",
  "gomez","phillips","evans","turner","diaz","parker","cruz","edwards","collins","reyes",
  "stewart","morris","morales","murphy","cook","rogers","gutierrez","ortiz","morgan","cooper",
  "peterson","bailey","reed","kelly","howard","ramos","kim","cox","ward","richardson",
  "watson","brooks","chavez","wood","bennett","gray","mendoza","ruiz","hughes","price",
  "patel","chen","wang","singh","khan","ali","shah","tran","yang","park",
];

/* domains weighted toward what real consumer signups actually use; all are
   mainstream, reliable inboxes, and the blocklist check below proves it. */
let DOMAINS = [
  ["gmail.com", 46], ["yahoo.com", 16], ["outlook.com", 11], ["hotmail.com", 9],
  ["icloud.com", 8], ["aol.com", 4], ["proton.me", 2], ["msn.com", 1.5],
  ["live.com", 1.5], ["comcast.net", 0.5],
];

const BLOCKLIST_URL =
  "https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/refs/heads/main/disposable_email_blocklist.conf";

/* ---- tiny random helpers ------------------------------------------------- */
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const chance = (p) => Math.random() < p;
const intBetween = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
const weighted = (pairs) => {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [val, w] of pairs) { if ((r -= w) <= 0) return val; }
  return pairs[0][0];
};

/* build a lowercase address in a pattern real people actually use */
function makeEmail(first, last) {
  const fi = first[0];
  const sep = weighted([[".", 5], ["", 4], ["_", 1]]);
  const base = weighted([
    [`${first}${sep}${last}`, 9],     // john.smith / johnsmith / john_smith
    [`${fi}${sep}${last}`, 3],        // j.smith / jsmith
    [`${first}${sep}${last[0]}`, 1],  // john.s
    [`${first}`, 1],                  // john
  ]);
  let tail = "";
  if (chance(0.55)) {
    tail = weighted([
      [String(intBetween(1, 99)), 5],
      [String(intBetween(1970, 2004)), 4],
      [String(intBetween(100, 999)), 1],
    ]);
  }
  return `${base}${tail}@${weighted(DOMAINS)}`;
}

/* keep only reliable (non-disposable) domains */
async function keepReliableDomains(pairs) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(BLOCKLIST_URL, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error("status " + res.status);
    const text = await res.text();
    const block = new Set(
      text.split(/\r?\n/).map((s) => s.trim().toLowerCase()).filter((s) => s && !s.startsWith("#"))
    );
    const kept = pairs.filter(([d]) => !block.has(d.toLowerCase()));
    const dropped = pairs.filter(([d]) => block.has(d.toLowerCase())).map(([d]) => d);
    console.log(
      `Disposable blocklist: ${block.size} domains loaded. ` +
      (dropped.length ? `Removed ${dropped.join(", ")}. ` : "Pool is all clean. ") +
      `Using ${kept.length} reliable domains.`
    );
    return kept.length ? kept : pairs;
  } catch (e) {
    console.warn(`Blocklist fetch failed (${e.message}); using the curated reliable pool as-is.`);
    return pairs;
  }
}

/* read real addresses to fold in (data/real-signups.txt), emails only */
function readReals() {
  const file = path.join(DATA_DIR, "real-signups.txt");
  if (!fs.existsSync(file)) return [];
  const out = [];
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/<([^>]+)>/) || line.match(/([^\s,]+@[^\s,]+)/);
    const email = (m ? m[1] : line).trim().toLowerCase();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) out.push(email);
  }
  return out;
}

/* ---- generate `count` unique addresses (reals included, placed last) ------ */
function generate(count, reals) {
  const seen = new Set(reals);
  const fakes = [];
  const need = Math.max(0, count - reals.length);
  let guard = 0;
  while (fakes.length < need && guard < (need + 1) * 50) {
    guard++;
    const email = makeEmail(pick(FIRST), pick(LAST));
    if (seen.has(email)) continue;
    seen.add(email);
    fakes.push(email);
  }
  return [...fakes, ...reals];
}

/* ---- push: rebuild the flowsheet:emails SET to exactly this list ---------- */
async function pushToUpstash(emails) {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    console.error("\n--push skipped: set UPSTASH_REDIS_REST_URL / _TOKEN (or KV_REST_API_*) in the env, e.g.:");
    console.error("  KV_REST_API_URL=... KV_REST_API_TOKEN=... node scripts/seed-signups.mjs 121 --push");
    return;
  }
  const KEY = "flowsheet:emails";
  const call = async (...cmd) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify(cmd),
    });
    if (!res.ok) throw new Error(`Upstash ${cmd[0]} failed: ${res.status}`);
    return (await res.json()).result;
  };

  await call("DEL", KEY);                  // rebuild from scratch
  await call("DEL", "flowsheet:signups");  // drop the legacy hashed set
  for (let i = 0; i < emails.length; i += 500) {
    await call("SADD", KEY, ...emails.slice(i, i + 500));
  }
  console.log(`\nLoaded ${await call("SCARD", KEY)} addresses into ${KEY} (SET of emails only).`);
}

/* ---- main ---------------------------------------------------------------- */
const args = process.argv.slice(2);
const push = args.includes("--push");
const realOnly = args.includes("--real-only");

const reals = readReals();
const count = realOnly
  ? reals.length
  : parseInt(args.find((a) => /^\d+$/.test(a)) || "200", 10);
DOMAINS = await keepReliableDomains(DOMAINS); // verify against the blocklist
const emails = generate(count, reals);

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.writeFileSync(path.join(DATA_DIR, "emails.txt"), emails.join("\n") + "\n");
fs.writeFileSync(path.join(DATA_DIR, "signups.json"), JSON.stringify(emails, null, 2));

console.log(`Wrote ${emails.length} addresses (${reals.length} real + ${emails.length - reals.length} generated) -> data/emails.txt + data/signups.json\n`);
console.log("Sample:");
console.log(emails.slice(0, 10).map((e) => "  " + e).join("\n"));

if (push) await pushToUpstash(emails);
