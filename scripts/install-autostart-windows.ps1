# Install daemon supervisor as Windows Task Scheduler job
# This ensures daemons restart automatically after machine reboot
# Usage: powershell -ExecutionPolicy Bypass -File install-autostart-windows.ps1

$TaskName = "IIAL-Daemons-Supervisor"
$ScriptPath = "E:\Documents\PROYECTOS\IialGrants\scripts\daemon-supervisor.mjs"
$LogPath = "E:\Documents\PROYECTOS\IialGrants\scripts\daemon-supervisor.log"
$User = $env:USERNAME
$Domain = $env:USERDOMAIN

Write-Host "Installing daemon supervisor as Windows Task..."
Write-Host "Task Name: $TaskName"
Write-Host "User: $Domain\$User"
Write-Host "Script: $ScriptPath"
Write-Host ""

# Remove existing task if it exists
try {
  $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if ($existing) {
    Write-Host "Removing existing task '$TaskName'..."
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Start-Sleep -Seconds 1
  }
} catch {
  # Task doesn't exist, that's fine
}

# Create new task
$Action = New-ScheduledTaskAction `
  -Execute "node" `
  -Argument $ScriptPath `
  -WorkingDirectory "E:\Documents\PROYECTOS\IialGrants"

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
  -ExecutionTimeLimit (New-TimeSpan -Hours 24)

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $Action `
  -Trigger $Trigger `
  -Principal $Principal `
  -Settings $Settings `
  -Description "IIAL Grants daemon supervisor - keeps daemons alive 24/7" | Out-Null

Write-Host "✓ Task registered successfully"
Write-Host ""
Write-Host "Verify installation:"
Write-Host "  Get-ScheduledTask -TaskName '$TaskName' | Format-List"
Write-Host ""
Write-Host "View logs:"
Write-Host "  tail -f '$LogPath'"
Write-Host ""
Write-Host "Manual start:"
Write-Host "  Start-ScheduledTask -TaskName '$TaskName'"
Write-Host ""
Write-Host "Uninstall:"
Write-Host "  Unregister-ScheduledTask -TaskName '$TaskName' -Confirm:`$false"
