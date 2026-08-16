# Register IIAL Grants to start with Windows and validate itself on every boot.
#
# The task runs scripts/start-system.ps1, which brings up Docker, the Supabase
# containers, Ollama, the web app and the ingestion daemon, then runs
# scripts/startup-validate.ts and fails loudly if anything is not actually
# working. Check scripts/start-system.log for each boot's report.
#
# ASCII only: Windows PowerShell 5.1 reads .ps1 as ANSI without a BOM.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-autostart-windows.ps1
#   ... -Uninstall

param(
  [switch]$Uninstall
)

# Derive the repo from this script's location. The previous version hardcoded
# E:\Documents\PROYECTOS\IialGrants, a path that does not exist on this machine,
# so the registered task could never have started anything.
$IialHome = Split-Path -Parent $PSScriptRoot
$TaskName = "IIAL-Grants-Startup"
$StartScript = Join-Path $IialHome "scripts\start-system.ps1"
$LogPath = Join-Path $IialHome "scripts\start-system.log"
$User = $env:USERNAME
$Domain = $env:USERDOMAIN

if ($Uninstall) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "Task '$TaskName' removed." -ForegroundColor Yellow
  exit 0
}

if (-not (Test-Path $StartScript)) {
  throw "Startup script not found at $StartScript"
}

$PwshPath = (Get-Command powershell.exe -ErrorAction Stop).Source

Write-Host "Installing IIAL Grants autostart" -ForegroundColor Cyan
Write-Host "  Task:   $TaskName"
Write-Host "  Repo:   $IialHome"
Write-Host "  Script: $StartScript"
Write-Host "  User:   $Domain\$User"
Write-Host ""

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

$Action = New-ScheduledTaskAction `
  -Execute $PwshPath `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$StartScript`" -NoBrowser" `
  -WorkingDirectory $IialHome

# At logon rather than at startup: Docker Desktop and Ollama are per-user
# desktop apps, so they cannot come up before someone is logged in. The delay
# gives Windows time to settle the network and the Docker service.
$Trigger = New-ScheduledTaskTrigger -AtLogOn -User "$Domain\$User"
$Trigger.Delay = "PT45S"

# Limited, not Highest: registering an elevated task needs an elevated shell,
# and nothing in the startup path requires admin - Docker Desktop, Ollama, bun
# and node all run as the logged-in user.
$Principal = New-ScheduledTaskPrincipal `
  -UserID "$Domain\$User" `
  -LogonType Interactive `
  -RunLevel Limited

$Settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -RestartCount 2 `
  -RestartInterval (New-TimeSpan -Minutes 5) `
  -ExecutionTimeLimit (New-TimeSpan -Hours 1)

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $Action `
  -Trigger $Trigger `
  -Principal $Principal `
  -Settings $Settings `
  -Description "Starts the IIAL Grants stack at logon and validates every layer end to end." | Out-Null

# Verify rather than assume: Register-ScheduledTask surfaces permission errors
# as non-terminating, so the previous version printed "Task registered" even
# when registration had been denied.
if (-not (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue)) {
  throw "Registration failed - '$TaskName' is not present in Task Scheduler."
}

Write-Host "Task registered and verified." -ForegroundColor Green
Write-Host ""
Write-Host "Run it now:      Start-ScheduledTask -TaskName '$TaskName'"
Write-Host "Boot report:     Get-Content '$LogPath' -Tail 60"
Write-Host "Validate only:   bun run scripts/startup-validate.ts"
Write-Host "Uninstall:       powershell -File scripts/install-autostart-windows.ps1 -Uninstall"
