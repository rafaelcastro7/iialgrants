# 24/7 Operations & Recovery - IIAL Grants

**Status**: production-ready with local validation
**Last updated**: 2026-07-14
**Purpose**: keep the local daemon fleet running continuously and recover after
process crashes or machine restart.

This project runs locally on TanStack Start/Vite at `http://localhost:8080`.
Older notes that mention `5173/app` are stale.

## Quick Start

Install the Windows Task Scheduler supervisor:

```powershell
cd E:\Documents\PROYECTOS\IialGrants
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-autostart-windows.ps1
```

Start it now:

```powershell
Start-ScheduledTask -TaskName "IIAL-Daemons-Supervisor"
```

Create or refresh the desktop shortcut:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-desktop-shortcut.ps1
```

The shortcut runs `scripts/launch-system.ps1`, which:

- ensures the supervisor task exists
- starts the daemon supervisor if it is not running
- starts `bun run dev` in the background if `localhost:8080` is not responding
- opens `http://localhost:8080/grants`

## Daemon Fleet

| Daemon                      | Interval | Purpose                                             | Log                                 |
| --------------------------- | -------: | --------------------------------------------------- | ----------------------------------- |
| `live-audit-daemon.mjs`     |      15m | Process health, code-audit queue, DB anomaly checks | `scripts/live-audit-report.log`     |
| `self-eval-daemon.mjs`      |      30m | Product-quality scorecard and regression flags      | `scripts/self-eval-report.log`      |
| `improvement-daemon.mjs`    |      45m | Evidence-grounded improvement backlog               | `scripts/improvement-report.log`    |
| `self-criticism-daemon.mjs` |      60m | Pipeline criticism and weakness analysis            | `scripts/self-criticism-report.log` |
| `daemon-watchdog.mjs`       |       5m | Repairs dead/hung daemons with restart rate limits  | `scripts/watchdog-report.log`       |

All runtime output is local-only. Logs, PID files, locks, and generated queues
are gitignored.

## Supervisor Contract

`scripts/daemon-supervisor.mjs` is the master process installed by Task
Scheduler.

It:

- reuses already-running daemon PIDs instead of spawning duplicates
- starts missing daemons with their configured interval
- checks daemon PID files every 30 seconds
- restarts dead daemons, capped at 6 restarts per hour per daemon
- writes to `scripts/daemon-supervisor.log`
- leaves children detached so they can keep running if the supervisor exits

The supervisor is deliberately process-only. It never edits app code or grant
data.

## Recovery Scenarios

### A Daemon Dies

The supervisor notices the missing PID within 30 seconds and restarts the
daemon unless the restart cap has been reached.

### A Daemon Hangs

The watchdog cross-checks PID liveness with log freshness. If a daemon is alive
but stale past 3x its interval, the watchdog kills and restarts it.

### The Machine Restarts

Windows Task Scheduler runs `IIAL-Daemons-Supervisor` at startup with a short
random delay. The supervisor starts or reuses the daemon fleet.

## Monitoring

PowerShell examples:

```powershell
Get-ScheduledTask -TaskName "IIAL-Daemons-Supervisor" | Format-List
Get-Content scripts/daemon-supervisor.log -Tail 80 -Wait
Get-Content scripts/live-audit-report.log -Tail 80 -Wait
Get-Content scripts/watchdog-report.log -Tail 80 -Wait
```

App dashboard:

- `http://localhost:8080/autonomy`
- admin-only
- refreshes every 10 seconds
- shows daemon health, self-check verdict, scorecard trend, repair actions,
  improvement backlog, self-criticism findings, memory, lessons, and techniques

## Manual Operations

Start:

```powershell
Start-ScheduledTask -TaskName "IIAL-Daemons-Supervisor"
```

Stop supervisor task:

```powershell
Stop-ScheduledTask -TaskName "IIAL-Daemons-Supervisor"
```

Uninstall:

```powershell
Unregister-ScheduledTask -TaskName "IIAL-Daemons-Supervisor" -Confirm:$false
```

Manual supervisor run:

```powershell
node scripts/daemon-supervisor.mjs
```

## Safety Limits

- Supervisor restart cap: 6 restarts/hour per daemon.
- Watchdog restart cap: 4 restarts/hour per managed daemon.
- GPU work uses the cooperative `scripts/.gpu.lock`.
- Heavy LLM calls back off on proxy `loadTier`, circuit-open, or GPU-lock busy.
- Daemons propose and measure; they do not auto-apply app changes.

## Testing Checklist

- [x] Node syntax check for supervisor and daemon scripts.
- [x] PowerShell launcher scripts exist and use port `8080`.
- [x] Supervisor uses configured daemon intervals.
- [x] Supervisor reuses live PID files instead of duplicating daemons.
- [ ] Reboot test: restart machine and confirm the scheduled task starts.
- [ ] Kill test: terminate one daemon and confirm supervisor/watchdog recovery.
- [ ] 24-hour soak: leave the system running and inspect restart/anomaly logs.

## Troubleshooting

If the scheduled task does not start:

```powershell
where node
Get-ScheduledTask -TaskName "IIAL-Daemons-Supervisor" | Format-List
Get-EventLog System -Source TaskScheduler -Newest 20
```

If the app does not open from the shortcut:

```powershell
Get-Content scripts/dev-server.log -Tail 80
bun run dev
```

If daemons keep restarting:

```powershell
Get-Content scripts/daemon-supervisor.log -Tail 120
Get-Content scripts/watchdog-report.log -Tail 120
Get-Content scripts/improvement-report.log -Tail 120
```

Common causes:

- Ollama is not running on `localhost:11434`.
- The Ollama proxy is not available on `localhost:11435`.
- Local Supabase containers are stopped.
- The GPU lock is stale or the model is timing out.
- Disk is full and logs cannot be written.
