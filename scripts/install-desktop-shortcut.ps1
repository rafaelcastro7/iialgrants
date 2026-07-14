# Create a desktop shortcut that launches the daemon system and opens the app.
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-desktop-shortcut.ps1

$IialHome = "E:\Documents\PROYECTOS\IialGrants"
$DesktopPath = [System.Environment]::GetFolderPath("Desktop")
$ShortcutPath = Join-Path $DesktopPath "IIAL Grants.lnk"
$LauncherScript = Join-Path $IialHome "scripts\launch-system.ps1"
$IconPath = Join-Path $IialHome "public\favicon.ico"

$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = "powershell.exe"
$Shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File ""$LauncherScript"""
$Shortcut.WorkingDirectory = $IialHome
$Shortcut.Description = "Start IIAL Grants daemons and open the app"
if (Test-Path $IconPath) {
  $Shortcut.IconLocation = "$IconPath,0"
}
$Shortcut.WindowStyle = 7
$Shortcut.Save()

Write-Host "Desktop shortcut created: $ShortcutPath" -ForegroundColor Green
Write-Host ""
Write-Host "When clicked, the shortcut will:"
Write-Host "  1. Ensure the daemon supervisor is installed"
Write-Host "  2. Start the autonomous daemon system"
Write-Host "  3. Start the dev server if needed"
Write-Host "  4. Open http://localhost:8080/grants"
