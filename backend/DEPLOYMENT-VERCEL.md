# Deploying the Chix backend to Vercel (Vercel + Supabase, no Render)

This backend (NestJS) runs on **Vercel serverless functions** instead of an
always-on Render service. The database stays on **Supabase**. This mirrors the
setup already proven on the Daily-smkz project.

> Why this works: the app has **no WebSockets** and **no Redis**, so it is fully
> stateless between requests — exactly what serverless needs. Passwords use
> `bcryptjs` (pure JS) so they work in the serverless runtime.

---

## Two Vercel projects from this one repo

| Vercel project | Root Directory | What it serves |
| -------------- | -------------- | -------------- |
| Frontend       | `frontend`     | The web app (already on Vercel) |
| Backend (API)  | `backend`      | The REST API (this guide) |

---

## Step 1 — Supabase connection strings
From Supabase → Project Settings → Database → Connection string:

1. **Transaction pooler** (port **6543**) → `DATABASE_URL`, append `?pgbouncer=true`.
2. **Session pooler** (port **5432**) → `MIGRATE_DATABASE_URL` (migrations only).

Reuse the same values you gave the Chix service on Render.

---

## Step 2 — Create the backend Vercel project
1. vercel.com → Add New → Project → import `kurtlewis-ui/Chix-Inventory-System`.
2. **Root Directory:** `backend`.
3. **Framework Preset:** Other.

---

## Step 3 — Environment variables (Production)

| Variable | Value |
| -------- | ----- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Supabase 6543 pooler URL (`?pgbouncer=true`) |
| `MIGRATE_DATABASE_URL` | Supabase 5432 session URL |
| `CORS_ORIGIN` | the Chix frontend's exact origin (its custom domain or `chix-inventory-system.vercel.app`), no trailing slash |
| `JWT_SECRET` | strong random string (min 32 chars) |
| `JWT_REFRESH_SECRET` | different strong random string |
| `JWT_EXPIRATION` | `60m` |
| `JWT_REFRESH_EXPIRATION` | `7d` |
| `BCRYPT_ROUNDS` | `12` |
| `SESSION_TIMEOUT` | `28800` |
| `RATE_LIMIT_TTL` | `60` |
| `RATE_LIMIT_MAX` | `100` |
| `API_PREFIX` | `api/v1` |
| `COOKIE_SAMESITE` | `none` |
| `COOKIE_SECURE` | `true` |
| `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET` | optional |

> ⚠️ When pasting values, make sure there's no trailing space/newline (Vercel
> warns about this). The code now trims `COOKIE_SAMESITE`/`COOKIE_SECURE`
> defensively, but clean values are best.

---

## Step 4 — Deploy & test
`npm run vercel-build` runs `prisma generate` + migrations (retry) + seed, then
serves via the `api/index.ts` function (pinned to the `sin1` Singapore region to
sit next to Supabase).

Test: `https://<your-chix-backend>.vercel.app/health` → JSON health response.

---

## Step 5 — Point the frontend at the backend
Chix **frontend** Vercel project → env `NEXT_PUBLIC_API_URL =
https://<your-chix-backend>.vercel.app/api/v1` → redeploy the frontend.

Ensure the backend `CORS_ORIGIN` matches the frontend origin exactly.

---

## Step 6 — Retire Render
Once Chix works end-to-end on Vercel, suspend/delete the Chix Render service.
`render.yaml` is kept only for reference/rollback (re-point
`NEXT_PUBLIC_API_URL` back to Render and redeploy the frontend if ever needed).

---

## What changed in the code (same pattern as Daily-smkz)
- `src/create-app.ts` — shared Nest bootstrap (cookie-parser/helmet loaded via
  require for bundler interop).
- `src/main.ts` — uses createApp(); always-on server still migrates on boot.
- `api/index.ts` — cached serverless handler (app.init, no listen, no boot
  migrations, surfaces real errors).
- `vercel.json` — build command, `outputDirectory: public`, `regions: [sin1]`,
  route all paths to the function, bundle the Prisma client.
- `public/index.html` — non-empty static output dir so Vercel's build check passes.
- `vercel-build` script + `migrate-with-retry.js` honoring `MIGRATE_DATABASE_URL`.
- `schema.prisma` — `rhel-openssl` binaryTargets for the Vercel runtime.
- `bcrypt` → `bcryptjs` everywhere (native addon doesn't load in serverless).
- login page: button no longer shows "Waking the server…".
