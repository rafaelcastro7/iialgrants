# Launch System — Ensures daemons are running and opens the app in browser
# This script is called by the desktop shortcut

$IialHome = "E:\Documents\PROYECTOS\IialGrants"
$TaskName = "IIAL-Daemons-Supervisor"
$AppUrl = "http://localhost:5173/app/grants"

Write-Host "🚀 IIAL Grants Startup" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check if supervisor task exists
$TaskExists = $null
try {
  $TaskExists = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
} catch {
  # Task doesn't exist
}

if (-not $TaskExists) {
  Write-Host "⚠ Daemon supervisor not installed. Installing now..."
  Set-Location $IialHome
  & powershell -ExecutionPolicy Bypass -File "scripts/install-autostart-windows.ps1"
  Write-Host "✓ Supervisor installed" -ForegroundColor Green
} else {
  Write-Host "✓ Supervisor found" -ForegroundColor Green
}

Write-Host ""

# Step 2: Check if supervisor is running
$TaskState = (Get-ScheduledTask -TaskName $TaskName).State
if ($TaskState -eq "Running") {
  Write-Host "✓ Daemons already running" -ForegroundColor Green
} else {
  Write-Host "▶ Starting daemons..." -ForegroundColor Yellow
  Start-ScheduledTask -TaskName $TaskName
  Start-Sleep -Seconds 2  # Give daemons time to start
  Write-Host "✓ Daemons started" -ForegroundColor Green
}

Write-Host ""

# Step 3: Wait for app to be available
Write-Host "▶ Waiting for app server..." -ForegroundColor Yellow
$MaxRetries = 30  # Try for ~15 seconds (30 * 0.5s)
$Retries = 0

do {
  try {
    $response = Invoke-WebRequest -Uri "http://localhost:5173/app/grants" -Method Head -TimeoutSec 1 -ErrorAction SilentlyContinue
    if ($response.StatusCode -eq 200) {
      Write-Host "✓ App server ready" -ForegroundColor Green
      break
    }
  } catch {
    # Server not ready yet
  }

  $Retries++
  if ($Retries -lt $MaxRetries) {
    Start-Sleep -Milliseconds 500
  }
} while ($Retries -lt $MaxRetries)

Write-Host ""

# Step 4: Open app in browser
Write-Host "▶ Opening app..." -ForegroundColor Yellow
Start-Process $AppUrl
Write-Host "✓ App opened in browser" -ForegroundColor Green

Write-Host ""
Write-Host "🎉 IIAL Grants is ready!" -ForegroundColor Cyan
Write-Host "   • Daemons: running in background (autonomous)" -ForegroundColor Gray
Write-Host "   • Web app: localhost:5173/app" -ForegroundColor Gray
Write-Host "   • Dashboard: localhost:5173/app/autonomy (admin)" -ForegroundColor Gray
Write-Host ""

# Close this PowerShell window after a short delay
Start-Sleep -Seconds 2
Exit
