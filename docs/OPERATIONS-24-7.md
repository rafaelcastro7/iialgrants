# 24/7 Operations & Recovery — IIAL Grants Autonomous System

**Status**: ✅ Production-ready  
**Last Updated**: 2026-07-13  
**Purpose**: Ensure daemons run continuously and auto-recover from machine restart

## Quick Start (First Install)

### 1. Install Supervisor as Windows Task

Open **PowerShell as Administrator** and run:

```powershell
cd E:\Documents\PROYECTOS\IialGrants
powershell -ExecutionPolicy Bypass -File scripts/install-autostart-windows.ps1
```

**Expected output:**
```
✓ Task registered successfully
```

**Verify installation:**
```powershell
Get-ScheduledTask -TaskName "IIAL-Daemons-Supervisor" | Format-List
```

### 2. Start the Supervisor Now (or wait for next reboot)

**Manual start:**
```powershell
Start-ScheduledTask -TaskName "IIAL-Daemons-Supervisor"
```

**Monitor logs in real-time:**
```bash
cd E:\Documents\PROYECTOS\IialGrants
tail -f scripts/daemon-supervisor.log
```

**Expected logs:**
```
[2026-07-13T12:00:01.234Z] Supervisor started (pid 8492). Monitoring 5 daemons.
[2026-07-13T12:00:02.456Z] Started audit (pid 8500)
[2026-07-13T12:00:02.567Z] Started self-eval (pid 8512)
[2026-07-13T12:00:02.678Z] Started improvement (pid 8524)
[2026-07-13T12:00:02.789Z] Started self-criticism (pid 8536)
[2026-07-13T12:00:02.890Z] Started watchdog (pid 8548)
```

---

## Architecture

### Daemon Fleet (5 processes)

| Daemon | Interval | Purpose | PID File |
|--------|----------|---------|----------|
| **audit** | 15m | Detect data/code/DB anomalies | `scripts/.pids/audit.pid` |
| **self-eval** | 30m | Measure data completeness & grounding | `scripts/.pids/self-eval.pid` |
| **improvement** | 45m | Propose backlog fixes (evidence-based) | `scripts/.pids/improvement.pid` |
| **self-criticism** | 60m | Analyze weaknesses & failure patterns | `scripts/.pids/self-criticism.pid` |
| **watchdog** | 5m | Monitor & repair other daemons | `scripts/.pids/watchdog.pid` |

### Supervisor (master process)

**Process**: `daemon-supervisor.mjs`  
**Responsibility**:
- Starts all 5 daemons on first run
- Checks daemon health every 30 seconds
- Restarts dead daemons (max 6 restarts/hour per daemon)
- Writes detailed logs to `scripts/daemon-supervisor.log`
- Runs as detached child processes (survives supervisor restart)

**Key file**:
- `scripts/.supervisor.pid` — Supervisor's own PID (informational)

---

## Automatic Recovery Flow

### Scenario 1: A single daemon crashes

```
[12:30:00] Supervisor detects audit daemon is DEAD (was pid 8500)
[12:30:01] Supervisor restarts audit daemon (new pid 8512)
[12:30:02] Audit daemon starts polling again
→ Zero downtime, no manual intervention needed
```

### Scenario 2: Machine restarts

```
[08:00:00] Windows shutdown
[08:00:30] Machine boots up
[08:01:00] Task Scheduler auto-triggers "IIAL-Daemons-Supervisor"
[08:01:05] Supervisor starts all 5 daemons
[08:01:10] Logs show: "Supervisor started (pid 3344). Monitoring 5 daemons."
→ All daemons running again, no manual action needed
```

### Scenario 3: Supervisor crashes (very rare)

```
[12:45:00] Supervisor crashes (e.g., OOM, disk full)
[12:45:30] All 5 child daemons continue running (they're detached)
→ System keeps working for hours until next restart
[Next reboot] Task Scheduler restarts supervisor, which finds old daemons
→ System re-synchronized
```

---

## Monitoring & Troubleshooting

### Check Daemon Status

```bash
# View supervisor log
tail -f scripts/daemon-supervisor.log

# View specific daemon log
tail -f scripts/audit-daemon.log
tail -f scripts/self-eval-daemon.log
tail -f scripts/improvement-daemon.log
tail -f scripts/self-criticism-daemon.log
tail -f scripts/daemon-watchdog.log
```

### View Recent Health Events

```bash
# Last 20 lines of any daemon
tail -20 scripts/audit-daemon.log

# Count restarts today
grep "Restarted" scripts/daemon-supervisor.log | wc -l

# Find errors
grep "ERROR\|FATAL" scripts/daemon-supervisor.log
```

### Manual Restart (if needed)

```powershell
# Restart supervisor (kills all daemons, then respawns them)
Start-ScheduledTask -TaskName "IIAL-Daemons-Supervisor"

# Stop all daemons (they will stay stopped, no auto-restart)
Stop-ScheduledTask -TaskName "IIAL-Daemons-Supervisor"

# Check if running
Get-ScheduledTask -TaskName "IIAL-Daemons-Supervisor" | Select-Object -ExpandProperty State
# Output: Running or Ready (Ready = not currently executing but will fire again)
```

### Uninstall (remove from autostart)

```powershell
Unregister-ScheduledTask -TaskName "IIAL-Daemons-Supervisor" -Confirm:$false
```

---

## Safety Limits

### Restart Rate Limiting

To prevent infinite restart loops, each daemon has:
- **Max 6 restarts per hour** per daemon
- **After 6 restarts**: Give up until the hour rolls over
- **Restart attempt counter**: Resets when daemon runs for >5 minutes without crashing

**Example**: If `improvement` daemon crashes 6 times in 1 hour, supervisor logs:
```
[13:15:30] improvement: TOO MANY RESTARTS this hour (6). Giving up until next hour.
```

Supervisor will try again at 14:15.

### Resource Limits

All daemons inherit from OS:
- **CPU**: No explicit limit (uses what's available)
- **RAM**: Process-specific limits if needed (edit daemon script)
- **GPU**: Cooperative lock (`scripts/.gpu.lock`, 6min timeout) prevents thrashing

---

## Daemon Output & Artifacts

Each daemon writes:
- **Logs**: `scripts/{daemon-name}-daemon.log` (append-only, rotate manually or via cron)
- **Results**: Task-specific files (e.g., `scripts/self-eval-metrics.jsonl`)
- **PID file**: `scripts/.pids/{daemon-name}.pid` (used by supervisor for health check)

**Storage note**: Logs accumulate over time. Consider:
- Weekly rotate: `mv scripts/audit-daemon.log scripts/audit-daemon.log.$(date +%Y-%m-%d)`
- Archive: Move old logs to `scripts/.archive/`
- Monitor disk: Logs ~10 MB/daemon per week at current verbosity

---

## Observability via Dashboard

All daemon activity is visible in the app:

- **Route**: `http://localhost:5173/app/autonomy` (admin-only)
- **Refresh**: Every 10 seconds
- **Displays**:
  - Daemon health (Operational / Degraded / Down)
  - Latest metrics from each daemon
  - Audit findings, lessons, techniques
  - Memory/Obsidian integration
  - Improvement backlog

**Note**: Dashboard is read-only. To adjust daemon behavior, edit script files and restart via Task Scheduler.

---

## Maintenance Tasks

### Daily
- Check supervisor log for errors: `grep ERROR scripts/daemon-supervisor.log`
- Check restart count: `grep Restarted scripts/daemon-supervisor.log | wc -l` (should be <2)

### Weekly
- Archive old logs (keep last 7 days)
- Review lessons learned (memory/lessons directory)
- Check database size (audit logs table)

### Monthly
- Review daemon output (metrics, backlog) and act on recommendations
- Test recovery: Kill a daemon and verify supervisor restarts it
- Test startup: Reboot machine and verify all daemons come back

---

## Troubleshooting Guide

### Issue: Supervisor won't start

**Symptom**: Task Scheduler shows "Ready" but no log appears

**Steps**:
1. Check if node.exe is in PATH: `where node`
2. Manually run supervisor: `node scripts/daemon-supervisor.mjs`
3. Check PowerShell error: `Get-EventLog System -Source TaskScheduler | tail -5`

**Common causes**:
- Node.js not installed
- Node not in system PATH
- Insufficient permissions

### Issue: Daemons keep restarting

**Symptom**: Logs show "Restarted X daemon" every 30s

**Steps**:
1. Check individual daemon log: `tail -50 scripts/audit-daemon.log`
2. Look for error messages (permission denied, port in use, out of memory)
3. Check GPU status: `nvidia-smi` (if using CUDA)
4. Check disk space: `disk usage`

**Common causes**:
- Ollama not running
- PostgreSQL unavailable
- Out of disk space
- Timeout issues (increase headersTimeout in daemon code)

### Issue: Machine rebooted but daemons didn't restart

**Symptom**: Supervisor doesn't appear in logs

**Steps**:
1. Check Task Scheduler: `Get-ScheduledTask -TaskName "IIAL-Daemons-Supervisor"`
2. Check Event Viewer: Windows Logs > System > look for Task Scheduler events
3. Try manual start: `Start-ScheduledTask -TaskName "IIAL-Daemons-Supervisor"`
4. Check permissions: Verify user has rights to run scripts in that directory

**Common causes**:
- Task was accidentally disabled
- User changed or lost permission
- Windows didn't complete startup sequence yet

---

## Testing Checklist

Use this checklist to verify 24/7 operation:

- [ ] **Install**: Run install script, verify no errors
- [ ] **Manual start**: Task starts all 5 daemons, logs show "Supervisor started"
- [ ] **Daemon health**: Check each daemon log shows it's working (no errors)
- [ ] **Kill test**: Kill a daemon (e.g., `taskkill /PID 8500`), verify supervisor restarts it within 30s
- [ ] **Reboot test**: Restart machine, verify supervisor auto-starts and all daemons appear
- [ ] **Continuous run**: Leave running for 24 hours, check logs for anomalies
- [ ] **Dashboard**: Verify `/app/autonomy` shows all daemons as Operational

---

## Support

For issues or questions:
1. Check logs: `scripts/daemon-supervisor.log` and individual daemon logs
2. Review this document (OPERATIONS-24-7.md)
3. Check `/app/autonomy` dashboard for daemon health status
4. Manual restart via `Start-ScheduledTask`

---

**Last tested**: 2026-07-13  
**Supervisor version**: daemon-supervisor.mjs  
**Node.js minimum**: v18.0.0
