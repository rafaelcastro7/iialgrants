# Create a desktop shortcut that launches the daemon system and opens the app
# Usage: powershell -ExecutionPolicy Bypass -File install-desktop-shortcut.ps1

$DesktopPath = [System.Environment]::GetFolderPath("Desktop")
$ShortcutPath = Join-Path $DesktopPath "IIAL Grants.lnk"

# The launcher script will:
# 1. Ensure supervisor is running
# 2. Open the app in the default browser
$LauncherScript = "E:\Documents\PROYECTOS\IialGrants\scripts\launch-system.ps1"

$WshShell = New-Object -ComObject WScript.Shell

# Create shortcut
$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = "powershell.exe"
$Shortcut.Arguments = "-ExecutionPolicy Bypass -File ""$LauncherScript"""
$Shortcut.WorkingDirectory = "E:\Documents\PROYECTOS\IialGrants"
$Shortcut.Description = "IIAL Grants — Start daemon system and open app"
$Shortcut.IconLocation = "E:\Documents\PROYECTOS\IialGrants\public\favicon.ico,0"

# Optional: Set window style to minimized (so PowerShell window closes after launching)
$Shortcut.WindowStyle = 7  # 7 = minimized, 3 = maximized, 1 = normal

$Shortcut.Save()

Write-Host "✓ Desktop shortcut created: $ShortcutPath"
Write-Host ""
Write-Host "When clicked, the shortcut will:"
Write-Host "  1. Ensure daemon supervisor is running"
Write-Host "  2. Open IIAL Grants in your default browser"
Write-Host ""
Write-Host "You can now double-click the shortcut to start the system."
