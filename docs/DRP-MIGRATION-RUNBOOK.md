# IIAL Grants DRP & Migration Runbook

Last verified: 2026-07-21  
Scope: local-first rebuild, disaster recovery, and migration to another Windows machine.

This is the single recovery document for the local IIAL Grants stack. It ties
together the repair notes in `docs/local-supabase-dev-repair.md`, the developer
guide in `docs/DEVELOPER-GUIDE.md`, and the daemon operations guide in
`docs/OPERATIONS-24-7.md`.

## What must be recoverable

| Layer                | Source of truth                                        | Recovery method                                |
| -------------------- | ------------------------------------------------------ | ---------------------------------------------- |
| App code             | GitHub `origin/main`                                   | `git clone` / `git pull`                       |
| Schema               | `supabase/migrations`                                  | `node scripts/apply-local-migrations.mjs`      |
| Local demo/auth seed | `scripts/demo-seed.mjs`, `scripts/seed-live-grant.mjs` | rerun seed scripts                             |
| Live local data      | PostgreSQL Docker volume or `pg_dump` backup           | restore dump into local Postgres               |
| Runtime secrets      | `.env`, `env.local`                                    | copy manually from secure backup; never commit |
| Local AI models      | Ollama model cache                                     | `ollama pull ...`                              |
| Daemons/autostart    | scripts + Windows Task Scheduler                       | reinstall supervisor                           |

## Local ports and URLs

Use `localhost`, not `127.0.0.1`, because local Supabase CORS is configured for
the `localhost` origins.

| Service           | URL / port               |
| ----------------- | ------------------------ |
| App dev server    | `http://localhost:8080`  |
| Supabase Kong API | `http://localhost:15435` |
| PostgreSQL        | `localhost:15432`        |
| Auth direct       | `localhost:15433`        |
| PostgREST direct  | `localhost:15434`        |
| Ollama            | `http://localhost:11434` |

## Minimum prerequisites on a new machine

Install:

- Git
- Docker Desktop
- Bun
- Node.js, if not already supplied by Bun/tooling
- Ollama
- Chromium for Playwright: `bunx playwright install chromium`

Recommended local Ollama models:

```powershell
ollama pull phi4-mini:latest
ollama pull dolphin3:latest
ollama pull qwen3:14b
ollama pull nomic-embed-text:latest
```

## Fresh rebuild from Git, no data restore

Use this when the machine is new, containers were deleted, or the database can
be rebuilt from migrations and seed data.

```powershell
git clone https://github.com/rafaelcastro7/iialgrants.git
cd iialgrants
bun install
```

Set up the two-file env split (see "Environment architecture" below for the
rationale). `.env` holds the base/production values; `.env.local` overrides them
to point the dev machine at the local Docker Supabase. Both are gitignored.

```powershell
Copy-Item .env.example .env   # then fill cloud + LLM keys (Supabase Cloud URL, GROQ/CEREBRAS/GOOGLE keys)
```

Create `.env.local` with the LOCAL Docker Supabase values. These anon/service
keys are the JWTs baked into THIS stack's `supabase/docker/volumes/api/kong.yml`
(issuer `supabase`, JWT secret `your-super-secret-and-long-postgres-password`) —
NOT the generic `supabase-demo` keys. Using the wrong keys makes Kong reject
every request with `{"message":"Unauthorized"}` (a 401 at the gateway, before
GoTrue ever sees it). Extract the current keys with:

```powershell
docker exec docker-kong-1 sh -c "cat /home/kong/kong.yml" | Select-String "key:"
```

`.env.local` (local dev DB; cloud LLM keys stay inherited from `.env`):

```text
SUPABASE_URL=http://localhost:15435
SUPABASE_PUBLISHABLE_KEY=<anon JWT from kong.yml>
SUPABASE_SERVICE_ROLE_KEY=<service_role JWT from kong.yml>
SUPABASE_PROJECT_ID=local
VITE_SUPABASE_URL=http://localhost:15435
VITE_SUPABASE_PUBLISHABLE_KEY=<anon JWT from kong.yml>
VITE_SUPABASE_PROJECT_ID=local
```

Do NOT set `DISABLE_CLOUD_LLM` — the LLM stack is now hybrid (cloud-first with a
graceful local fallback when Ollama is reachable). See "LLM architecture" below.

Start local Supabase:

```powershell
cd supabase\docker
docker compose up -d
cd ..\..
```

Apply all migrations:

```powershell
node scripts/apply-local-migrations.mjs
```

Seed demo users and one live grant:

```powershell
node scripts/demo-seed.mjs
bun scripts/seed-live-grant.mjs
```

If the demo login buttons return 401 even with the correct anon key, the seeded
password hash does not match the app's `DEMO_PASSWORD` (`IIAL-Demo-2026!`, in
`src/routes/auth.tsx`). Reset it directly in the local auth DB:

```powershell
docker exec docker-db-1 psql -U postgres -d postgres -c "UPDATE auth.users SET encrypted_password = crypt('IIAL-Demo-2026!', gen_salt('bf')), email_confirmed_at = COALESCE(email_confirmed_at, now()) WHERE email IN ('demo-admin@iial.test','demo-member-a@iial.test','demo-member-b@iial.test');"
```

Start the app:

```powershell
bun run dev
```

Open:

```text
http://localhost:8080/auth
```

Use the demo buttons on the auth page, then verify `/grants` can search for
`IRAP`.

## Full validation checklist

Run these before declaring the system healthy:

```powershell
bun run check:local
bun run lint
bun run build
bunx vitest run
bun run test:e2e -- --reporter=list
```

Expected healthy results as of 2026-07-21:

- `check:local`: all PASS
- `lint`: exits 0
- `build`: exits 0
- Vitest: 279 passing, 4 skipped
- Playwright: 36 passing

## Backup procedure

Use this before risky Docker work, a machine migration, or any major schema
change.

Create a backup folder:

```powershell
New-Item -ItemType Directory -Force backups
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
```

Find the database container:

```powershell
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}" | Select-String "db"
```

The usual container name is `docker-db-1`. If your name differs, replace
`docker-db-1` below.

Create a compressed PostgreSQL dump inside the container and copy it out:

```powershell
docker exec docker-db-1 pg_dump -U postgres -d postgres -F c -f /tmp/iialgrants.dump
docker cp docker-db-1:/tmp/iialgrants.dump "backups\iialgrants-$stamp.dump"
docker exec docker-db-1 rm -f /tmp/iialgrants.dump
```

Also back up secrets outside git:

```powershell
Copy-Item .env "backups\.env-$stamp"
Copy-Item env.local "backups\env.local-$stamp"
```

Never commit backup dumps or env files.

## Restore procedure from backup

Use this when migrating real local data to another machine or recovering after
data loss.

1. Clone the repo and install dependencies.
2. Restore `.env` and `env.local` from your secure backup.
3. Start the Docker stack.
4. Copy the dump into the database container.
5. Restore with `pg_restore`.

Commands:

```powershell
cd supabase\docker
docker compose up -d
cd ..\..
```

Replace the dump path with your backup file:

```powershell
docker cp "backups\iialgrants-YYYYMMDD-HHMMSS.dump" docker-db-1:/tmp/iialgrants.dump
docker exec docker-db-1 pg_restore -U postgres -d postgres --clean --if-exists /tmp/iialgrants.dump
docker exec docker-db-1 rm -f /tmp/iialgrants.dump
```

Restart API services so Auth and PostgREST reconnect cleanly:

```powershell
cd supabase\docker
docker compose restart auth rest kong meta
cd ..\..
```

Validate:

```powershell
bun run check:local
bun run dev
```

Then browse to `http://localhost:8080/auth`, log in, and verify grants/search.

## Repair procedure after containers were deleted

This is the quick path used when Docker containers disappear but the repo still
exists.

```powershell
cd E:\Documents\PROYECTOS\IialGrants
cd supabase\docker
docker compose up -d
cd ..\..
node scripts/apply-local-migrations.mjs
node scripts/demo-seed.mjs
bun scripts/seed-live-grant.mjs
bun run check:local
bun run dev
```

If browser requests fail with CORS errors:

```powershell
cd supabase\docker
docker compose up -d --force-recreate kong
docker compose restart auth rest
cd ..\..
bun run check:local
```

## Common failure symptoms

| Symptom                             | Likely cause                        | Fix                                      |
| ----------------------------------- | ----------------------------------- | ---------------------------------------- |
| `/auth` loads but login fails       | Supabase Auth/REST stale connection | `docker compose restart auth rest`       |
| CORS/preflight error                | wrong origin or stale Kong config   | use `localhost:8080`; recreate Kong      |
| `check:local` cannot reach Postgres | DB container stopped/deleted        | `docker compose up -d db` or full stack  |
| grants list empty                   | seed not run or data not restored   | `bun scripts/seed-live-grant.mjs`        |
| Ollama requests timeout             | model cold/stale/too large          | restart Ollama; use `phi4-mini:latest`   |
| Playwright cannot run               | browser missing                     | `bunx playwright install chromium`       |
| admin links do not click            | layout/sidebar regression           | run `tests/e2e/navigation-audit.spec.ts` |

## Daemon/autostart recovery

After a machine migration, reinstall the local supervisor:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-autostart-windows.ps1
Start-ScheduledTask -TaskName "IIAL-Daemons-Supervisor"
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-desktop-shortcut.ps1
```

Monitor:

```powershell
Get-ScheduledTask -TaskName "IIAL-Daemons-Supervisor" | Format-List
Get-Content scripts\daemon-supervisor.log -Tail 80 -Wait
Get-Content scripts\watchdog-report.log -Tail 80 -Wait
```

## Git and Lovable safety

This project is connected to Lovable. Do not rewrite published history:

- no force push
- no rebase/amend/squash of pushed commits
- keep `main` in a working state

Safe publish flow:

```powershell
git status --short
git add <specific-files>
git commit -m "Clear, small message"
git push origin main
```

## Evidence of health

For each recovery/migration, record:

- date and machine name
- commit hash: `git log -1 --oneline`
- `bun run check:local` output
- `bun run build` result
- `bunx vitest run` result
- `bun run test:e2e -- --reporter=list` result
- whether browser search for `IRAP` worked on `/grants`
