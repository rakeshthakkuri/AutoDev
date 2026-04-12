# Deploying the backend on Fly.io

## App name

`fly.toml` contains a placeholder `app` name. Create or reuse an app:

```bash
fly apps create your-backend-name
```

Set `app = 'your-backend-name'` in `fly.toml`, or run `fly deploy` from a directory where the app is already linked (`fly apps list`).

## Build context

Deploy from the `backend` directory so `Dockerfile` and `fly.toml` are used together:

```bash
cd backend
fly deploy
```

### `fly launch` (first-time)

**Do not use Fly Managed Postgres** — use **Supabase** and `DATABASE_URL` (see below). From `backend/`, run:

```bash
npm run fly:launch
```

That runs `fly launch --no-db --copy-config`, which **skips database provisioning** and **reuses this repo’s `fly.toml`** (`--copy-config`).

This repo’s `fly.toml` sets **`[build] dockerfile = "Dockerfile"`** so `fly launch` uses the Dockerfile build strategy and **does not run the Node.js source scanner** that triggers Managed Postgres prompts. Plain `fly launch` should no longer ask about MPG regions for that reason.

If you remove the `dockerfile` line from `[build]`, use **`fly launch --no-db`** (or `npm run fly:launch`) again. Then set `fly secrets set DATABASE_URL=...` from Supabase.

## Environment and secrets

**Database is optional for deploy:** `fly.toml` does **not** run migrations on deploy. You can ship the API with only LLM/auth secrets, then add `DATABASE_URL` and run migrations when ready (see **PostgreSQL (Supabase)** below).

Set secrets (not committed to git):

```bash
fly secrets set \
  DATABASE_URL="postgresql://..." \
  GEMINI_API_KEY="..." \
  JWT_SECRET="..." \
  JWT_REFRESH_SECRET="..." \
  CORS_ORIGINS="https://your-frontend.example,https://www.your-frontend.example"
```

When you use Postgres, set **`DATABASE_URL`** to the URI from Supabase (see below). Until then, omit it — the app uses in-memory fallbacks where implemented. Remote hosts use TLS in [backend/src/db/index.js](backend/src/db/index.js).

- **CORS:** In production, allowed origins come from `CORS_ORIGINS` (comma-separated) or a single `FRONTEND_URL`. Wildcard `*` is not used when `NODE_ENV=production`.
- **LLM:** Use `GEMINI_API_KEY` or `GOOGLE_API_KEY`.
- **Optional — S3:** For durable generated artifacts, use `STORAGE_PROVIDER=s3` plus `S3_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and related settings. The default local `generated/` directory is **ephemeral** on Fly Machines.

Other useful variables: `LOG_TO_FILES=1` (enable rotating log files inside the container; default in production is stdout-only JSON logs), `TRUST_PROXY` (override trust-proxy hops; production defaults to `1`).

## PostgreSQL (Supabase)

1. In [Supabase](https://supabase.com), create a project and open **Project Settings** → **Database**. Copy the **connection string** (URI). Use **Session mode** or the **direct** connection if your workload needs long-lived sessions; the **Transaction pooler** (port `6543`) is optional for the API when compatible with your `pg` usage.

2. Set it on Fly:

   ```bash
   fly secrets set DATABASE_URL="postgresql://..."
   ```

   Nothing in this repo assumes Fly-managed Postgres—only a reachable Postgres URL.

3. **Migrations** are **not** run automatically on deploy. After `DATABASE_URL` is set, apply schema once (or after schema changes):

   ```bash
   fly ssh console -a your-app-name -C "npm run db:migrate"
   ```

   Or temporarily add to `fly.toml`: `[deploy] release_command = 'npm run db:migrate'` and remove it again if you prefer deploys without a DB requirement.

### Troubleshooting `getaddrinfo ENOTFOUND` on deploy

That error means **the hostname in `DATABASE_URL` is not a real DNS name** (or is mistyped). Common causes:

- Using a **placeholder** like `postgresql://...` from docs instead of the **exact** string from Supabase.
- **Wrong quoting** when running `fly secrets set` so the URL was truncated or mangled.
- Password still **`[YOUR-PASSWORD]`** instead of the actual DB password.

In Supabase: **Project Settings** → **Database** → copy **URI**, substitute the password, then:

`fly secrets set DATABASE_URL='postgresql://postgres.xxx:YOUR_PASSWORD@db.xxx.supabase.co:5432/postgres'`  
(use your project’s host and user; pooler URIs use a different host/port).

Verify the secret is set: `fly secrets list` (values are hidden). Redeploy with `fly deploy`.

**Password special characters:** If the DB password contains `@`, `#`, `:`, `/`, `?`, or spaces, the URI breaks unless the password is **URL-encoded** in the connection string (only that segment). Supabase’s “copy URI” often uses a placeholder; paste into a password manager, encode if needed, then build `postgresql://USER:ENCODED_PASSWORD@HOST:PORT/db`.

## Processes: API vs worker

`fly.toml` defines two process groups:

- **`app`** — HTTP API (`npm start`). Receives traffic via `[http_service]` on port **5001** (must match `PORT` and `internal_port`).
- **`worker`** — Background jobs (`npm run worker`). **Requires `DATABASE_URL`**; without it the worker exits. Until Postgres is configured, keep workers off:

```bash
fly scale count app=1 worker=0
```

After `DATABASE_URL` is set:

```bash
fly scale count app=1 worker=1
```

Without a worker, queued generation jobs may not run.

## Cold starts

`min_machines_running = 0` allows Machines to stop when idle (lower cost, slower first request). Set `min_machines_running = 1` under `[http_service]` in `fly.toml` if you want at least one API Machine always running.

## Health checks

Fly checks `GET /health` on the app process. Ensure the app listens on `PORT` (default **5001** in `[env]`).

## Trust proxy

Behind Fly’s edge, the API sets `trust proxy` so `express-rate-limit` and `req.ip` reflect the client. Override with `TRUST_PROXY` if you add another proxy layer.
