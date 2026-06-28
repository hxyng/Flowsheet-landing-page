/* ===========================================================================
   /api/signups  —  the live, accurate early-access counter + signup store.

   GET   -> { count }                      current real total (public)
   GET   ?token=ADMIN  -> { count, emails } the actual list (admin only)
   POST  { email }  -> { count }           record a signup, return new total

   Storage: Upstash Redis (via its REST API, no npm dependency needed).
     - SET  flowsheet:signups  holds a salted SHA-256 hash of each email, used
       for the self-deduplicating count.
     - HASH flowsheet:emails   holds the PLAINTEXT address of each signup, so
       you can actually read who joined (in the Upstash console, or via the
       token-protected admin GET below). Only set this if you want emails
       stored here as well as in Formspree.
     - Displayed count = SIGNUPS_BASE (your historical total) + unique signups.

   Required env vars (Vercel → Project → Settings → Environment Variables):
     UPSTASH_REDIS_REST_URL    set automatically by the Upstash integration
     UPSTASH_REDIS_REST_TOKEN  set automatically by the Upstash integration
   Optional:
     SIGNUPS_BASE          integer seed = your current real signup total (default 0)
     SIGNUPS_SALT          any random string; makes the stored hashes unguessable
     SIGNUPS_ADMIN_TOKEN   secret; GET /api/signups?token=THAT returns the email
                           list. Without it, the email list is never exposed.
   =========================================================================== */

const crypto = require("crypto");

const REST_URL =
  process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
const REST_TOKEN =
  process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
const BASE = parseInt(process.env.SIGNUPS_BASE || "0", 10) || 0;
const SALT = process.env.SIGNUPS_SALT || "";
const ADMIN_TOKEN = process.env.SIGNUPS_ADMIN_TOKEN || "";
const KEY = "flowsheet:signups"; // SET of salted email hashes (the count)
const EMAILS_KEY = "flowsheet:emails"; // HASH emailLower -> { email, at } (readable list)

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Run one Redis command through the Upstash REST API.
async function redis(...cmd) {
  const res = await fetch(REST_URL, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + REST_TOKEN,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(cmd),
  });
  if (!res.ok) throw new Error("upstash " + res.status);
  const data = await res.json();
  return data.result;
}

const hashEmail = (email) =>
  crypto.createHash("sha256").update(SALT + email.trim().toLowerCase()).digest("hex");

// Vercel parses JSON bodies, but read the raw stream as a fallback.
async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  return await new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try { resolve(JSON.parse(raw || "{}")); } catch { resolve({}); }
    });
    req.on("error", () => resolve({}));
  });
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  // Not wired up yet → tell the client so it falls back to its seed number.
  if (!REST_URL || !REST_TOKEN) {
    return res.status(200).json({ count: null, configured: false });
  }

  try {
    if (req.method === "GET") {
      const n = (await redis("SCARD", KEY)) || 0;

      // Admin view: with the right secret token, return the actual addresses.
      const token =
        (req.query && req.query.token) ||
        (() => { try { return new URL(req.url, "http://x").searchParams.get("token"); } catch { return null; } })() ||
        req.headers["x-admin-token"] ||
        "";
      if (ADMIN_TOKEN && token === ADMIN_TOKEN) {
        const flat = (await redis("HGETALL", EMAILS_KEY)) || [];
        const emails = [];
        for (let i = 0; i < flat.length; i += 2) {
          let rec;
          try { rec = JSON.parse(flat[i + 1]); } catch { rec = { email: flat[i], at: null }; }
          emails.push(rec);
        }
        emails.sort((a, b) => String(a.at || "").localeCompare(String(b.at || "")));
        return res.status(200).json({ count: BASE + n, total: emails.length, emails });
      }

      return res.status(200).json({ count: BASE + n });
    }

    if (req.method === "POST") {
      const body = await readBody(req);
      const email = typeof body.email === "string" ? body.email.trim() : "";

      // Honeypot: bots fill the hidden field. Silently ignore, return current.
      if (body._gotcha) {
        const n = (await redis("SCARD", KEY)) || 0;
        return res.status(200).json({ count: BASE + n });
      }

      if (!EMAIL_RE.test(email)) {
        const n = (await redis("SCARD", KEY)) || 0;
        return res.status(400).json({ count: BASE + n, error: "invalid email" });
      }

      await redis("SADD", KEY, hashEmail(email)); // dedupes the count by hash
      // Store the plaintext address (keyed by lowercased email, so it dedupes
      // too) so you can actually read who signed up.
      await redis(
        "HSET",
        EMAILS_KEY,
        email.toLowerCase(),
        JSON.stringify({ email, at: new Date().toISOString() })
      );
      const n = (await redis("SCARD", KEY)) || 0;
      return res.status(200).json({ count: BASE + n });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "method not allowed" });
  } catch (e) {
    // Never break the page over a counter; client falls back to its seed.
    return res.status(200).json({ count: null, error: true });
  }
};
