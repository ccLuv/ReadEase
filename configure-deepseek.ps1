$ErrorActionPreference = 'Stop'
$configPath = Join-Path $PSScriptRoot 'config\ai-config.json'
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $configPath) | Out-Null
$secureKey = Read-Host 'Enter DeepSeek API Key (input is hidden)' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
try { $apiKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
if ([string]::IsNullOrWhiteSpace($apiKey)) { throw 'API Key cannot be empty.' }
$config = [ordered]@{ provider = 'deepseek'; apiKey = $apiKey; model = 'deepseek-v4-pro' }
$config | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding UTF8
Write-Output 'DeepSeek is configured. Please restart Start.bat.'
