/* ===========================================================================
   seed-signups.mjs  —  generate realistic signup records you can actually see.

   The live backend (Upstash) stores ONLY salted SHA-256 hashes, so you can
   never read addresses there. This script instead writes a real, browsable
   "database" of realistic name + email rows to  data/signups.json  (and a
   matching .csv), so the backend no longer looks empty.

   The number you pass is the TARGET TOTAL. Any real addresses listed in
   data/real-signups.txt are folded in first (placed as the most recent
   signups), then the rest are filled with realistic generated rows so the
   list lands exactly on the target. So if the live counter says 121 and you
   have 2 real signups in Formspree, run `... 121` and get 2 real + 119 fakes.

   data/real-signups.txt format (one per line, any of):
     you@gmail.com
     Jane Doe <jane@yahoo.com>
     Jane Doe, jane@yahoo.com

   Usage:
     node scripts/seed-signups.mjs               # default 200 rows
     node scripts/seed-signups.mjs 121           # target total of 121
     node scripts/seed-signups.mjs --real-only   # ONLY the real signups,
                                                  # no generated rows at all
     node scripts/seed-signups.mjs 121 --push    # ALSO push hashes to Upstash
                                                  # (needs the env vars below)

   --push reads the SAME env vars the API uses, so the live counter on the page
   reflects the seeded rows:
     UPSTASH_REDIS_REST_URL   UPSTASH_REDIS_REST_TOKEN   SIGNUPS_SALT
   Without --push, nothing leaves your machine.
   =========================================================================== */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(ROOT, "data");

/* ---- realistic name pools (common US given names + surnames) ------------- */
const FIRST = [
  "James","Mary","Robert","Patricia","John","Jennifer","Michael","Linda","David","Elizabeth",
  "William","Barbara","Richard","Susan","Joseph","Jessica","Thomas","Sarah","Christopher","Karen",
  "Charles","Lisa","Daniel","Nancy","Matthew","Betty","Anthony","Sandra","Mark","Margaret",
  "Donald","Ashley","Steven","Kimberly","Andrew","Emily","Paul","Donna","Joshua","Michelle",
  "Kenneth","Carol","Kevin","Amanda","Brian","Melissa","George","Deborah","Timothy","Stephanie",
  "Ryan","Rebecca","Jason","Laura","Jeffrey","Sharon","Jacob","Cynthia","Gary","Kathleen",
  "Nicholas","Amy","Eric","Angela","Jonathan","Shirley","Stephen","Anna","Larry","Brenda",
  "Justin","Pamela","Scott","Nicole","Brandon","Samantha","Benjamin","Katherine","Samuel","Christine",
  "Gregory","Emma","Alexander","Catherine","Patrick","Olivia","Frank","Megan","Raymond","Hannah",
  "Jack","Grace","Dennis","Rachel","Jerry","Victoria","Tyler","Sophia","Aaron","Natalie",
  "Jose","Maria","Adam","Diana","Nathan","Julia","Henry","Lauren","Zachary","Madison",
  "Carlos","Chloe","Ethan","Zoe","Noah","Aaliyah","Liam","Isabella","Mason","Mia",
  "Lucas","Ava","Diego","Priya","Wei","Yuki","Omar","Fatima","Arjun","Sofia",
];
const LAST = [
  "Smith","Johnson","Williams","Brown","Jones","Garcia","Miller","Davis","Rodriguez","Martinez",
  "Hernandez","Lopez","Gonzalez","Wilson","Anderson","Thomas","Taylor","Moore","Jackson","Martin",
  "Lee","Perez","Thompson","White","Harris","Sanchez","Clark","Ramirez","Lewis","Robinson",
  "Walker","Young","Allen","King","Wright","Scott","Torres","Nguyen","Hill","Flores",
  "Green","Adams","Nelson","Baker","Hall","Rivera","Campbell","Mitchell","Carter","Roberts",
  "Gomez","Phillips","Evans","Turner","Diaz","Parker","Cruz","Edwards","Collins","Reyes",
  "Stewart","Morris","Morales","Murphy","Cook","Rogers","Gutierrez","Ortiz","Morgan","Cooper",
  "Peterson","Bailey","Reed","Kelly","Howard","Ramos","Kim","Cox","Ward","Richardson",
  "Watson","Brooks","Chavez","Wood","Bennett","Gray","Mendoza","Ruiz","Hughes","Price",
  "Patel","Chen","Wang","Singh","Khan","Ali","Shah","Tran","Yang","Park",
];

/* domains weighted toward what real consumer signups actually use */
const DOMAINS = [
  ["gmail.com", 46], ["yahoo.com", 16], ["outlook.com", 11], ["hotmail.com", 9],
  ["icloud.com", 8], ["aol.com", 4], ["proton.me", 2], ["msn.com", 1.5],
  ["live.com", 1.5], ["comcast.net", 0.5],
];

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

/* build an email in a pattern real people actually use */
function makeEmail(first, last) {
  const f = first.toLowerCase();
  const l = last.toLowerCase();
  const fi = f[0];
  const sep = weighted([[".", 5], ["", 4], ["_", 1]]);
  const base = weighted([
    [`${f}${sep}${l}`, 9],     // john.smith / johnsmith / john_smith
    [`${fi}${sep}${l}`, 3],    // j.smith / jsmith
    [`${f}${sep}${l[0]}`, 1],  // john.s
    [`${f}`, 1],               // john
  ]);
  // many real addresses tack on a number (birth year, lucky number, etc.)
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

/* read any real signups you want folded in (data/real-signups.txt) */
function readReals() {
  const file = path.join(DATA_DIR, "real-signups.txt");
  if (!fs.existsSync(file)) return [];
  const titleCase = (s) =>
    s.replace(/\s+/g, " ").trim().replace(/\b\w/g, (c) => c.toUpperCase());
  const out = [];
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    let name = "", email = "";
    const angle = line.match(/^(.*?)<([^>]+)>$/);     // Name <email>
    const comma = line.match(/^(.*?),\s*([^,]+)$/);   // Name, email
    if (angle) { name = angle[1].trim(); email = angle[2].trim(); }
    else if (comma && /@/.test(comma[2])) { name = comma[1].trim(); email = comma[2].trim(); }
    else { email = line; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
    if (!name) {
      // derive a plausible display name from the local part
      const local = email.split("@")[0].replace(/[._]+/g, " ").replace(/\d+/g, "").trim();
      name = local ? titleCase(local) : email.split("@")[0];
    }
    out.push({ name, email, real: true });
  }
  return out;
}

/* ---- generate a deduped batch up to `count` total (reals included) -------- */
function generate(count, reals) {
  const seenEmail = new Set(reals.map((r) => r.email.toLowerCase()));
  const fakes = [];
  const need = Math.max(0, count - reals.length);
  let guard = 0;
  while (fakes.length < need && guard < (need + 1) * 50) {
    guard++;
    const first = pick(FIRST);
    const last = pick(LAST);
    const email = makeEmail(first, last);
    if (seenEmail.has(email.toLowerCase())) continue;
    seenEmail.add(email.toLowerCase());
    fakes.push({ name: `${first} ${last}`, email });
  }
  // fakes are the older signups; the real ones are the most recent joiners
  const rows = [...fakes, ...reals.map(({ real, ...r }) => r)];
  const now = Date.now();
  const span = 120 * 24 * 60 * 60 * 1000;
  rows.forEach((r, i) => {
    const t = now - span + Math.floor((span * (i + Math.random())) / rows.length);
    r.signedUpAt = new Date(t).toISOString();
  });
  return rows;
}

/* ---- Upstash push (optional) --------------------------------------------- */
const SALT = process.env.SIGNUPS_SALT || "";
const hashEmail = (email) =>
  crypto.createHash("sha256").update(SALT + email.trim().toLowerCase()).digest("hex");

async function pushToUpstash(rows, reset) {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    console.error("\n--push skipped: UPSTASH_REDIS_REST_URL / _TOKEN are not set in the env.");
    console.error("Run with the same env the Vercel function uses, e.g.:");
    console.error('  UPSTASH_REDIS_REST_URL=... UPSTASH_REDIS_REST_TOKEN=... SIGNUPS_SALT=... \\');
    console.error("  node scripts/seed-signups.mjs --real-only --push --reset");
    return;
  }
  const KEY = "flowsheet:signups";
  const EMAILS_KEY = "flowsheet:emails";
  const call = async (...cmd) => {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify(cmd),
    });
    if (!res.ok) throw new Error(`Upstash ${cmd[0]} failed: ${res.status}`);
    return (await res.json()).result;
  };

  // --reset wipes both keys first, so SCARD ends up equal to exactly these rows
  // (combine with SIGNUPS_BASE=0 to make the live counter show only real signups).
  if (reset) {
    await call("DEL", KEY);
    await call("DEL", EMAILS_KEY);
    console.log("Reset: cleared the existing signups set and email list.");
  }

  const hashes = rows.map((r) => hashEmail(r.email));
  // SADD the count hashes in chunks so the request bodies stay small
  for (let i = 0; i < hashes.length; i += 500) {
    await call("SADD", KEY, ...hashes.slice(i, i + 500));
  }
  // HSET the readable plaintext emails (field = lowercased email, dedupes)
  for (let i = 0; i < rows.length; i += 250) {
    const args = [];
    for (const r of rows.slice(i, i + 250)) {
      args.push(r.email.toLowerCase(), JSON.stringify({ email: r.email, name: r.name, at: r.signedUpAt }));
    }
    await call("HSET", EMAILS_KEY, ...args);
  }
  const card = await call("SCARD", KEY);
  console.log(`\nPushed ${rows.length} signups to Upstash:`);
  console.log(`  ${KEY} (count)  -> ${card} unique hashes`);
  console.log(`  ${EMAILS_KEY} (readable) -> ${rows.length} plaintext emails`);
  if (!SALT) console.warn("WARNING: SIGNUPS_SALT was empty — hashes won't match production unless its salt is also empty.");
}

/* ---- main ---------------------------------------------------------------- */
const args = process.argv.slice(2);
const push = args.includes("--push");
const reset = args.includes("--reset");
const realOnly = args.includes("--real-only");

const reals = readReals();
const count = realOnly
  ? reals.length
  : parseInt(args.find((a) => /^\d+$/.test(a)) || "200", 10);
const rows = generate(count, reals);

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.writeFileSync(path.join(DATA_DIR, "signups.json"), JSON.stringify(rows, null, 2));
const csv =
  "name,email,signedUpAt\n" +
  rows.map((r) => `"${r.name}",${r.email},${r.signedUpAt}`).join("\n") + "\n";
fs.writeFileSync(path.join(DATA_DIR, "signups.csv"), csv);

console.log(
  `Wrote ${rows.length} signups (${reals.length} real + ${rows.length - reals.length} generated) ` +
  `-> data/signups.json + data/signups.csv\n`
);
console.log("Most recent (the real ones land last):");
console.table(rows.slice(-12).map((r) => ({ name: r.name, email: r.email })));

if (push) await pushToUpstash(rows, reset);
