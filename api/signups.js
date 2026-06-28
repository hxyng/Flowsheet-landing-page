/* ===========================================================================
   /api/signups  —  the live early-access counter + readable signup store.

   GET   -> { count }                        current total (public)
   GET   ?token=ADMIN  -> { count, emails }   the list of addresses (admin only)
   POST  { email }  -> { count }             record a signup, return new total

   Storage: Upstash Redis (via its REST API, no npm dependency needed).
     - SET flowsheet:emails  holds just the email addresses, nothing else. It
       deduplicates by address, and its size IS the count. Read it in the
       Upstash console (SMEMBERS flowsheet:emails) or via the token-protected
       admin GET below.
     - Displayed count = SIGNUPS_BASE + number of stored emails.

   Env vars (Vercel → Project → Settings → Environment Variables):
     UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN   (or the KV_REST_API_* pair)
     SIGNUPS_BASE          optional integer added to the live count (default 0)
     SIGNUPS_ADMIN_TOKEN   secret; GET /api/signups?token=THAT returns the email
                           list. Without it, the list is never exposed.
   =========================================================================== */

const REST_URL =
  process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
const REST_TOKEN =
  process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
const BASE = parseInt(process.env.SIGNUPS_BASE || "0", 10) || 0;
const ADMIN_TOKEN = process.env.SIGNUPS_ADMIN_TOKEN || "";
const EMAILS_KEY = "flowsheet:emails"; // SET of email addresses

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

// The live count is just how many emails we hold, plus the optional base.
const liveCount = async () => BASE + ((await redis("SCARD", EMAILS_KEY)) || 0);

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
      // Admin view: with the right secret token, return the addresses.
      const token =
        (req.query && req.query.token) ||
        (() => { try { return new URL(req.url, "http://x").searchParams.get("token"); } catch { return null; } })() ||
        req.headers["x-admin-token"] ||
        "";
      if (ADMIN_TOKEN && token === ADMIN_TOKEN) {
        const emails = ((await redis("SMEMBERS", EMAILS_KEY)) || []).slice().sort();
        return res.status(200).json({ count: BASE + emails.length, total: emails.length, emails });
      }

      return res.status(200).json({ count: await liveCount() });
    }

    if (req.method === "POST") {
      const body = await readBody(req);
      const email = typeof body.email === "string" ? body.email.trim() : "";

      // Honeypot: bots fill the hidden field. Silently ignore, return current.
      if (body._gotcha) {
        return res.status(200).json({ count: await liveCount() });
      }

      if (!EMAIL_RE.test(email)) {
        return res.status(400).json({ count: await liveCount(), error: "invalid email" });
      }

      // Store just the address (lowercased so it dedupes itself).
      await redis("SADD", EMAILS_KEY, email.toLowerCase());
      return res.status(200).json({ count: await liveCount() });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "method not allowed" });
  } catch (e) {
    // Never break the page over a counter; client falls back to its seed.
    return res.status(200).json({ count: null, error: true });
  }
};
