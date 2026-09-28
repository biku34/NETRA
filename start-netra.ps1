# Starts the whole Netra platform: four services, one address.
#   http://localhost:5173   <- open this
#
#   src/portal       (5173)  platform shell: sign-in, Overview, FIR, Settings
#   src/frontend     (3000)  Hotspots module, served by the shell under /hotspots
#   src/backend      (8000)  Hotspots API
#   src/portal/backend (8001)  FIR API
#
# Usage:  powershell -ExecutionPolicy Bypass -File .\start-netra.ps1
#         add -Stop to stop everything this script started (by port)

param([switch]$Stop)

$root = $PSScriptRoot
$ports = 5173, 3000, 8000, 8001

foreach ($port in $ports) {
    $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($conn) {
        Write-Host "Port $port is in use - stopping process $($conn.OwningProcess)"
        Stop-Process -Id $conn.OwningProcess -Force -Confirm:$false -ErrorAction SilentlyContinue
    }
}
if ($Stop) { Write-Host "Stopped."; return }

function Start-Service-Window($title, $dir, $command) {
    Start-Process powershell -WorkingDirectory $dir -ArgumentList "-NoExit", "-Command", "`$host.UI.RawUI.WindowTitle = '$title'; $command"
}

Start-Service-Window "Netra - Hotspots API (8000)" "$root\src\backend" ".\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000"
Start-Service-Window "Netra - FIR API (8001)" "$root\src\portal" ".\backend\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --port 8001"
Start-Service-Window "Netra - Hotspots module (3000)" "$root\src\frontend" "npm run dev"
Start-Service-Window "Netra - Platform (5173)" "$root\src\portal" "npm run dev"

Write-Host ""
Write-Host "Netra is starting. Open http://localhost:5173 in about 20 seconds."
Write-Host "Development sign-in is in src\portal\backend\.env (NETRA_DEV_USER / NETRA_DEV_PASSWORD)."
