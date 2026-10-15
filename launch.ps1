param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$appRoot = $PSScriptRoot
$appUrl = 'http://127.0.0.1:4173'
$running = $false
try { $health = Invoke-RestMethod "$appUrl/api/health" -TimeoutSec 2; $running = $health.ok -and $health.version -eq '1.0.0' } catch {}
if (-not $running) {
    $nodePath = Join-Path $appRoot 'runtime\node.exe'
    if (-not (Test-Path -LiteralPath $nodePath)) {
        $nodeCommand = Get-Command node.exe -CommandType Application -ErrorAction SilentlyContinue
        if (-not $nodeCommand) { throw 'Node.js 24 or later is required. Install it and make sure node.exe is on PATH.' }
        $nodePath = $nodeCommand.Source
    }
    $nodeMajor = [int]((& $nodePath --version).TrimStart('v').Split('.')[0])
    if ($nodeMajor -lt 24) { throw 'Node.js 24 or later is required.' }
    $dataPath = Join-Path $appRoot 'data'
    New-Item -ItemType Directory -Force -Path $dataPath | Out-Null
    $serverPath = Join-Path $appRoot 'server.mjs'
    # ProcessStartInfo avoids a Windows PowerShell Start-Process defect triggered
    # by environments that expose both PATH and Path.
    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $nodePath
    $startInfo.WorkingDirectory = $appRoot
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    # Arguments is available in both Windows PowerShell 5.1 and newer PowerShell.
    $startInfo.Arguments = '"' + $serverPath + '"'
    $proc = [System.Diagnostics.Process]::Start($startInfo)
    $proc.BeginOutputReadLine()
    $proc.BeginErrorReadLine()
    $proc.Id | Set-Content -LiteralPath (Join-Path $dataPath 'server.pid')
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Milliseconds 200
        try { $health = Invoke-RestMethod "$appUrl/api/health" -TimeoutSec 1; if ($health.ok) { $running = $true; break } } catch {}
    }
    if (-not $running) { throw 'Could not start ReadEase. See data/error.log. Port 4173 may be occupied.' }
}
if (-not $NoBrowser) { Start-Process $appUrl }
