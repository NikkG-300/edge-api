# Edge API — Secure, Rate-Limited Serverless API on Vercel Edge Runtime

A low-latency API built on Next.js Edge Runtime, backed by Neon serverless Postgres, protected by distributed rate limiting and CORS enforcement at the edge, deployed via the Vercel CLI.

**Live URL:** https://edge-api-henna.vercel.app

---

## Architecture

```
Client Request
      │
      ▼
┌─────────────────────────┐
│  Edge Middleware         │  ← runs before any route
│  (middleware.ts)         │
│  1. CORS check            │
│  2. Rate limit (Redis)    │
│  3. Security headers      │
└─────────────────────────┘
      │
      ▼
┌─────────────────────────┐
│  Edge Routes              │
│  /api/health  (GET)       │
│  /api/logs    (GET/POST)  │
└─────────────────────────┘
      │
      ▼
┌─────────────────────────┐
│  Neon Serverless Postgres  │  ← TLS-encrypted connection
│  (WebSocket, edge-compatible)│
└─────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js (App Router, TypeScript) |
| Runtime | Vercel Edge Runtime |
| Database | Neon Serverless Postgres (`@neondatabase/serverless`) |
| Rate Limiting | Upstash Redis (`@upstash/redis`) |
| Deployment | Vercel CLI |
| Styling | Tailwind CSS |

## Security Features

- **TLS in transit** — all database connections enforce `sslmode=require`.
- **Distributed rate limiting** — 50 requests per 10-second window per IP, tracked via Redis `INCR`/`EXPIRE`. Requests over the limit return `429` **before** the database is ever queried.
- **CORS enforcement** — requests from unrecognized origins are rejected with `403`.
- **Defensive headers** — `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and `Strict-Transport-Security` are applied to every response.
- **Payload validation** — `/api/logs` POST requests rejects oversized payloads (`413`) based on `Content-Length` before parsing.

## API Endpoints

### `GET /api/health`
Health check confirming the edge node is live.

**Response `200`:**
```json
{ "status": "ok", "timestamp": "2026-07-09T14:02:03.727Z" }
```

### `POST /api/logs`
Inserts a new log entry.

**Request body:**
```json
{ "message": "hello edge" }
```

**Response `201`:**
```json
{ "log": { "id": 2, "message": "hello edge", "created_at": "2026-07-09T14:03:21.656Z" } }
```

**Error responses:**
- `413` — payload exceeds size limit
- `400` — invalid JSON or missing `message` field
- `429` — rate limit exceeded (from middleware, before reaching this route)
- `403` — request from disallowed origin (from middleware)

### `GET /api/logs`
Fetches the most recent log entries.

**Response `200`:**
```json
{
  "count": 2,
  "data": [
    { "id": 2, "message": "hello from prod", "created_at": "2026-07-09T14:03:21.656Z" },
    { "id": 1, "message": "hello edge", "created_at": "2026-07-09T13:45:44.171Z" }
  ]
}
```

## Database Schema

```sql
CREATE TABLE logs (
  id SERIAL PRIMARY KEY,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | Neon pooled Postgres connection string, must include `sslmode=require` |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST auth token |
| `ALLOWED_ORIGIN` | The single origin permitted by CORS (production domain) |

Set locally in `.env.local` (gitignored) and remotely via `vercel env add <NAME> production`.

## Running Locally

```bash
npm install
npm run dev
```

Then test:

```bash
curl http://localhost:3000/api/health
curl -X POST http://localhost:3000/api/logs -H "Content-Type: application/json" -d '{"message":"hello edge"}'
curl http://localhost:3000/api/logs
```

## Deployment

```bash
npm install -g vercel
vercel login
vercel link
vercel env add DATABASE_URL production
vercel env add UPSTASH_REDIS_REST_URL production
vercel env add UPSTASH_REDIS_REST_TOKEN production
vercel env add ALLOWED_ORIGIN production
vercel --prod
```

## Verification Checklist (for reviewers)

All checks below can be run directly against the live URL without any local setup.

1. **Health check** — visit in browser or curl:
   ```
   https://edge-api-henna.vercel.app/api/health
   ```
   Expect `200` with a JSON timestamp.

2. **Rate limiting** — send 55+ rapid GET requests to `/api/logs` (e.g. via Postman Runner or a simple script). Expect the first ~50 to return `200`, and subsequent requests within the same 10-second window to return `429`.

   Example Node script:
   ```javascript
   const url = "https://edge-api-henna.vercel.app/api/logs";
   for (let i = 1; i <= 60; i++) {
     const res = await fetch(url);
     console.log(`${i} -> ${res.status}`);
   }
   ```

3. **Database write** — POST a message:
   ```bash
   curl -X POST https://edge-api-henna.vercel.app/api/logs \
     -H "Content-Type: application/json" \
     -d '{"message":"reviewer test"}'
   ```
   Expect `201` with the inserted row.

4. **Database read** — visit in browser:
   ```
   https://edge-api-henna.vercel.app/api/logs
   ```
   Expect `200` with `count` and a `data` array including the row just inserted.

## Known Trade-offs

- Rate limiting uses a fixed-window counter (`INCR` + `EXPIRE`), not a sliding window. This is a lightweight, low-latency approach suitable for edge middleware, but it can theoretically allow a short burst of up to ~2x the limit right at window boundaries. A sliding-window algorithm (e.g. via `@upstash/ratelimit`) would close this gap if stricter guarantees are needed.
- `ALLOWED_ORIGIN` currently supports a single origin. Extending to multiple allowed origins would require switching to a list/array check in middleware.