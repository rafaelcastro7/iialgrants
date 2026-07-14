# Install daemon supervisor as a Windows Task Scheduler job.
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-autostart-windows.ps1

$IialHome = "E:\Documents\PROYECTOS\IialGrants"
$TaskName = "IIAL-Daemons-Supervisor"
$ScriptPath = Join-Path $IialHome "scripts\daemon-supervisor.mjs"
$LogPath = Join-Path $IialHome "scripts\daemon-supervisor.log"
$User = $env:USERNAME
$Domain = $env:USERDOMAIN

try {
  $NodePath = (Get-Command node -ErrorAction Stop).Source
} catch {
  throw "node.exe was not found in PATH. Install Node.js or add it to PATH before installing the supervisor."
}

Write-Host "Installing daemon supervisor as a Windows task..."
Write-Host "Task Name: $TaskName"
Write-Host "User: $Domain\$User"
Write-Host "Node: $NodePath"
Write-Host "Script: $ScriptPath"
Write-Host ""

try {
  $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($existing) {
    Write-Host "Removing existing task '$TaskName'..."
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Start-Sleep -Seconds 1
  }
} catch {
  # Task does not exist.
}

$Action = New-ScheduledTaskAction `
  -Execute $NodePath `
  -Argument "`"$ScriptPath`"" `
  -WorkingDirectory $IialHome

$Trigger = New-ScheduledTaskTrigger `
  -AtStartup `
  -RandomDelay (New-TimeSpan -Seconds 30)

$Principal = New-ScheduledTaskPrincipal `
  -UserID "$Domain\$User" `
  -LogonType S4U `
  -RunLevel Highest

$Settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Seconds 0)

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $Action `
  -Trigger $Trigger `
  -Principal $Principal `
  -Settings $Settings `
  -Description "IIAL Grants daemon supervisor - keeps daemons alive 24/7" | Out-Null

Write-Host "Task registered successfully" -ForegroundColor Green
Write-Host ""
Write-Host "Verify installation:"
Write-Host "  Get-ScheduledTask -TaskName '$TaskName' | Format-List"
Write-Host ""
Write-Host "View logs:"
Write-Host "  Get-Content -Path '$LogPath' -Tail 80 -Wait"
Write-Host ""
Write-Host "Manual start:"
Write-Host "  Start-ScheduledTask -TaskName '$TaskName'"
Write-Host ""
Write-Host "Uninstall:"
Write-Host "  Unregister-ScheduledTask -TaskName '$TaskName' -Confirm:`$false"
