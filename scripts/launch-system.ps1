# Launch IIAL Grants: ensure daemons are running, start the dev server if
# needed, and open the app in the default browser.

$IialHome = "E:\Documents\PROYECTOS\IialGrants"
$TaskName = "IIAL-Daemons-Supervisor"
$AppUrl = "http://localhost:8080/grants"
$HealthUrl = "http://localhost:8080/"
$DevLog = Join-Path $IialHome "scripts\dev-server.log"

function Test-HttpReady($Url) {
  try {
    $response = Invoke-WebRequest -Uri $Url -Method Get -TimeoutSec 2 -ErrorAction Stop
    return ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500)
  } catch {
    return $false
  }
}

Write-Host "IIAL Grants Startup" -ForegroundColor Cyan
Write-Host ""

Set-Location $IialHome

$TaskExists = $null
try {
  $TaskExists = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
} catch {
  $TaskExists = $null
}

if (-not $TaskExists) {
  Write-Host "Daemon supervisor is not installed. Installing..." -ForegroundColor Yellow
  & powershell -NoProfile -ExecutionPolicy Bypass -File "scripts/install-autostart-windows.ps1"
  Write-Host "Supervisor installed" -ForegroundColor Green
} else {
  Write-Host "Supervisor task found" -ForegroundColor Green
}

$TaskState = (Get-ScheduledTask -TaskName $TaskName).State
if ($TaskState -eq "Running") {
  Write-Host "Daemons already running" -ForegroundColor Green
} else {
  Write-Host "Starting daemons..." -ForegroundColor Yellow
  Start-ScheduledTask -TaskName $TaskName
  Start-Sleep -Seconds 2
  Write-Host "Daemons requested" -ForegroundColor Green
}

Write-Host ""
Write-Host "Checking app server on localhost:8080..." -ForegroundColor Yellow
if (-not (Test-HttpReady $HealthUrl)) {
  Write-Host "App server is not running. Starting 'bun run dev' in the background..." -ForegroundColor Yellow
  $Command = "Set-Location '$IialHome'; bun run dev *> '$DevLog'"
  Start-Process -FilePath "powershell.exe" `
    -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $Command) `
    -WorkingDirectory $IialHome `
    -WindowStyle Hidden
}

$MaxRetries = 40
$Ready = $false
for ($i = 0; $i -lt $MaxRetries; $i++) {
  if (Test-HttpReady $HealthUrl) {
    $Ready = $true
    break
  }
  Start-Sleep -Milliseconds 750
}

if ($Ready) {
  Write-Host "App server ready" -ForegroundColor Green
} else {
  Write-Host "App server did not respond yet; opening browser anyway." -ForegroundColor Yellow
  Write-Host "Check $DevLog for dev-server output." -ForegroundColor Gray
}

Write-Host ""
Write-Host "Opening app..." -ForegroundColor Yellow
Start-Process $AppUrl

Write-Host ""
Write-Host "IIAL Grants is ready." -ForegroundColor Cyan
Write-Host "  Daemons: Task Scheduler supervisor"
Write-Host "  Web app: http://localhost:8080"
Write-Host "  Autonomy: http://localhost:8080/autonomy"

Start-Sleep -Seconds 2
Exit
