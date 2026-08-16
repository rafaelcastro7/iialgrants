# Bring the whole IIAL Grants stack up from cold, then prove it works.
#
# Ordered by dependency: Docker engine -> Supabase containers -> Ollama models
# -> web app -> ingestion daemon -> validation. Each step is idempotent, so
# running this on an already-running system is a no-op plus a health report.
#
# ASCII only, on purpose: Windows PowerShell 5.1 reads .ps1 as ANSI unless the
# file carries a BOM, so any non-ASCII character here becomes a parse error.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-system.ps1
#   ... -NoBrowser      (skip opening the app; used by the boot task)
#
# Exit code 0 only when startup validation passes.

param(
  [switch]$NoBrowser
)

$ErrorActionPreference = "Continue"

# Resolve the repo from this script's own location - never hardcode a path,
# which is what left install-autostart-windows.ps1 pointing at a folder that
# does not exist on this machine.
$IialHome = Split-Path -Parent $PSScriptRoot
$LogPath = Join-Path $IialHome "scripts\start-system.log"
$AppUrl = "http://localhost:8080"
$KongUrl = "http://localhost:15435"
$OllamaUrl = "http://localhost:11434"
$Compose = Join-Path $IialHome "supabase\docker\docker-compose.yml"

function Write-Step($Message, $Color = "Cyan") {
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-ddTHH:mm:ss"), $Message
  Write-Host $line -ForegroundColor $Color
  Add-Content -Path $LogPath -Value $line -Encoding utf8
}

function Test-Url($Url, $TimeoutSec = 3) {
  try {
    Invoke-WebRequest -Uri $Url -TimeoutSec $TimeoutSec -UseBasicParsing -ErrorAction Stop | Out-Null
    return $true
  } catch {
    # Any HTTP response at all (401/404 included) means the port is serving.
    if ($_.Exception.Response) { return $true }
    return $false
  }
}

function Wait-For($Name, $Test, $TimeoutSec = 180) {
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    if (& $Test) {
      Write-Step "$Name is ready" "Green"
      return $true
    }
    Start-Sleep -Seconds 3
  }
  Write-Step "$Name did not become ready within $TimeoutSec s" "Red"
  return $false
}

# Launch a detached background process via cmd.exe with output redirected to a
# log. The whole command line is assembled here as one single-quoted string so
# PowerShell never sees the '>' as its own redirection operator.
function Start-Background($CommandLine, $LogFile) {
  $full = '/c ' + $CommandLine + ' > "' + $LogFile + '" 2>&1'
  Start-Process -FilePath "cmd.exe" -ArgumentList $full -WorkingDirectory $IialHome -WindowStyle Hidden
}

Set-Location $IialHome
Write-Step "IIAL Grants startup - repo: $IialHome"

# --- 1. Docker engine --------------------------------------------------------
docker info *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Step "Docker engine down; launching Docker Desktop..." "Yellow"
  $dd = @(
    "C:\Program Files\Docker\Docker\Docker Desktop.exe",
    "$env:LOCALAPPDATA\Docker\Docker Desktop.exe"
  ) | Where-Object { Test-Path $_ } | Select-Object -First 1
  if ($dd) { Start-Process -FilePath $dd } else { Write-Step "Docker Desktop not found" "Red" }
  Wait-For "Docker engine" { docker info *> $null; $LASTEXITCODE -eq 0 } 300 | Out-Null
} else {
  Write-Step "Docker engine already running" "Green"
}

# --- 2. Supabase stack -------------------------------------------------------
if (Test-Path $Compose) {
  Write-Step "Starting Supabase containers..."
  docker compose -f $Compose up -d *> $null
  Wait-For "Supabase gateway ($KongUrl)" { Test-Url $KongUrl } 240 | Out-Null
} else {
  Write-Step "docker-compose.yml not found at $Compose" "Red"
}

# --- 3. Ollama + embedding model --------------------------------------------
if (-not (Test-Url "$OllamaUrl/api/tags")) {
  Write-Step "Ollama down; starting..." "Yellow"
  $ollamaApp = "$env:LOCALAPPDATA\Programs\Ollama\ollama app.exe"
  if (Test-Path $ollamaApp) {
    Start-Process -FilePath $ollamaApp
  } else {
    Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Hidden
  }
  Wait-For "Ollama" { Test-Url "$OllamaUrl/api/tags" } 120 | Out-Null
} else {
  Write-Step "Ollama already running" "Green"
}

# The embedding model is what keeps search in hybrid mode rather than silently
# degrading to lexical-only, so make sure it is actually present.
# nomic-embed-text keeps search in hybrid mode instead of silently degrading to
# lexical-only; phi4-mini and dolphin3 are what the agents themselves run on,
# and without them every agent quietly falls through to a cloud provider (the
# critic failed with ollama_prewarm_404 and left proposals unreviewable).
$tags = ""
try { $tags = (Invoke-WebRequest -Uri "$OllamaUrl/api/tags" -TimeoutSec 10 -UseBasicParsing).Content } catch {}
foreach ($model in @("nomic-embed-text", "phi4-mini", "dolphin3")) {
  if ($tags -notmatch [regex]::Escape($model)) {
    Write-Step "Pulling $model (first run only)..." "Yellow"
    ollama pull $model *> $null
  }
}

# --- 4. Web app --------------------------------------------------------------
if (-not (Test-Url $AppUrl)) {
  Write-Step "Starting dev server..." "Yellow"
  Start-Background "bun run dev" (Join-Path $IialHome "scripts\dev-server.log")
  Wait-For "Web app ($AppUrl)" { Test-Url $AppUrl } 180 | Out-Null
} else {
  Write-Step "Web app already running" "Green"
}

# --- 5. Continuous ingestion -------------------------------------------------
$daemon = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -match "ingestion-daemon" }
if (-not $daemon) {
  Write-Step "Starting ingestion daemon..." "Yellow"
  Start-Background "node scripts\ingestion-daemon.mjs 360" (Join-Path $IialHome "scripts\ingestion-daemon.out.log")
} else {
  Write-Step "Ingestion daemon already running" "Green"
}

# --- 6. Validate -------------------------------------------------------------
# Retry briefly: the app and PostgREST can accept connections a beat before
# they serve real queries, and a false failure here is worse than waiting.
Write-Step "Running startup validation..."
$validated = $false
for ($attempt = 1; $attempt -le 3; $attempt++) {
  $output = & bun run scripts/startup-validate.ts 2>&1
  $output | ForEach-Object { Write-Host $_ }
  Add-Content -Path $LogPath -Value ($output -join "`n") -Encoding utf8
  if ($LASTEXITCODE -eq 0) { $validated = $true; break }
  if ($attempt -lt 3) {
    Write-Step "Validation attempt $attempt failed; retrying in 20s..." "Yellow"
    Start-Sleep -Seconds 20
  }
}

if ($validated) {
  Write-Step "STARTUP VALIDATED - system is fully operational" "Green"
  if (-not $NoBrowser) { Start-Process "$AppUrl/grants" }
  exit 0
} else {
  Write-Step "STARTUP VALIDATION FAILED - see output above and $LogPath" "Red"
  exit 1
}
