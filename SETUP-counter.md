# Live signup counter — setup

The "Join N+ on the early access list" number on the landing page is real. It is
served by `api/signups.js` (a Vercel serverless function) backed by **Upstash
Redis**. Until you wire up the env vars below, the page safely falls back to the
hardcoded number in `index.html` (`data-signups`), so nothing looks broken.

## How it works

- `GET /api/signups` → returns the current real total (`SIGNUPS_BASE` + unique signups).
- `POST /api/signups` with `{ email }` → records the signup and returns the new total.
- Upstash stores only a **salted SHA-256 hash** of each email in a Redis set, so the
  count deduplicates itself and Upstash never holds a real address. Plaintext emails
  still go to Formspree, which is where you read them.

## One-time setup (about 3 minutes)

1. **Add Upstash Redis** to the project:
   Vercel dashboard → your project → **Storage** → **Marketplace** → **Upstash → Redis**
   → create a free database and connect it to this project. This automatically adds the
   `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` env vars.

2. **Seed the starting number** (so the count reflects people who already signed up):
   Vercel → project → **Settings → Environment Variables** → add
   - `SIGNUPS_BASE` = your current real signup total (check Formspree). Use `0` to start fresh.
   - `SIGNUPS_SALT` = any random string (e.g. a UUID). Makes the stored hashes unguessable.

3. **Redeploy** (push to `main`, or hit Redeploy) so the function picks up the env vars.

That's it. The counter now shows `SIGNUPS_BASE` plus every unique new signup, live.

## Notes

- The counter API is same-origin (`/api/signups`), so the existing CSP already allows it —
  no `vercel.json` change needed.
- Upstash's free tier is far more than this page will ever use.
- Counts are deduplicated by email, so a refresh or a repeat submission won't inflate the number.
