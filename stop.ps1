$pidFile = Join-Path $PSScriptRoot 'data\server.pid'
if (Test-Path -LiteralPath $pidFile) {
    $serverPid = [int](Get-Content -LiteralPath $pidFile)
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$serverPid" -ErrorAction SilentlyContinue
    $serverFile = Join-Path $PSScriptRoot 'server.mjs'
    if ($proc -and $proc.CommandLine.Contains($serverFile)) { Stop-Process -Id $serverPid; Write-Output 'ReadEase stopped.' }
    else { Write-Output 'This copy of ReadEase is not running.' }
} else { Write-Output 'No startup record was found.' }
