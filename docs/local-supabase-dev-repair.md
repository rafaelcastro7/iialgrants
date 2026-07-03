# Local Supabase / Docker Repair Notes

Last verified: 2026-07-03

## Local git status

This project already has a local git repository on branch `main` and a configured
`origin` remote. Keep commits small and working because the connected Lovable
branch syncs pushed commits back to the editor.

## Local ports

- Kong / Supabase API gateway: `http://localhost:15435`
- Postgres: `localhost:15432`
- Dev app: `http://localhost:8080`
- Ollama: `http://localhost:11434`

## Local LLM settings

The live local smoke path uses Ollama. On this workstation, `qwen3:14b` can
exceed the default 60s agent timeout and leave Ollama slow for later calls. The
local `.env` therefore pins:

- `OLLAMA_MODEL=phi4-mini:latest`
- `OLLAMA_TIMEOUT_MS=120000`

If Ollama starts timing out even for small prompts, restart the local Ollama
process and confirm `http://localhost:11434/api/ps` is empty before rerunning
the live pipeline smoke.

## Health check

Run this after local Docker or Supabase changes:

```bash
bun run check:local
```

The check validates:

- local git repository and remote
- Docker Compose services: `db`, `auth`, `rest`, `kong`
- Postgres TCP on `localhost:15432`
- dev server on `http://localhost:8080`
- Kong CORS preflight from the dev origin
- PostgREST reachability through Kong

## Symptoms seen

- Browser login or data fetches fail against local Supabase with CORS/preflight errors.
- Browser console shows missing `Access-Control-Allow-Origin` or rejected headers such as:
  - `x-retry-count`
  - `accept-profile`
  - `content-profile`
- After recreating the DB container, auth can return `500` with stale DB connections (`broken pipe`).

## Verified fix

The local Kong config now includes a global CORS plugin in
[`supabase/docker/volumes/kong/kong.yml`](../supabase/docker/volumes/kong/kong.yml)
for the common local dev origins:

- `http://localhost:8080`
- `http://localhost:5173`
- `http://localhost:3000`

Allowed headers currently include the Supabase JS + PostgREST headers used by the app:

- `apikey`
- `x-client-info`
- `x-supabase-api-version`
- `x-retry-count`
- `Prefer`
- `Range`
- `Range-Unit`
- `accept-profile`
- `content-profile`

## Recovery steps

1. Recreate Kong after editing `supabase/docker/volumes/kong/kong.yml`.
2. If the database container was recreated, restart `auth` and `rest` too so they reconnect cleanly.
3. If the frontend was already running, restart the dev server and clear stale Vite optimize cache if needed.
4. Run `bun run check:local` to confirm the local stack is healthy.

## What this does and does not prove

- Verified: local browser traffic can reach local Supabase through Kong with CORS enabled.
- Verified: local dev server responds on `:8080`.
- Not proven by this fix alone: the full agent pipeline or Ollama-backed proposal flow end-to-end.
