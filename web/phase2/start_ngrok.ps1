# Chạy tunnel ngrok tới Hex Arena Phase 2 (port 5173) đọc cấu hình an toàn từ .env
$envFile = Join-Path $PSScriptRoot ".env"
if (-not (Test-Path $envFile)) {
  Write-Error "Khong tim thay file .env trong $PSScriptRoot. Hay copy tu .env.example va dien NGROK_AUTHTOKEN."
  exit 1
}

Get-Content $envFile | ForEach-Object {
  $line = $_.Trim()
  if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
    $idx = $line.IndexOf("=")
    $key = $line.Substring(0, $idx).Trim()
    $val = $line.Substring($idx + 1).Trim().Trim('"').Trim("'")
    [Environment]::SetEnvironmentVariable($key, $val, "Process")
  }
}

$domain = if ($env:NGROK_DOMAIN) { $env:NGROK_DOMAIN } else { "hexarena.ngrok.app" }
if (-not $env:NGROK_AUTHTOKEN -or $env:NGROK_AUTHTOKEN -eq "your_ngrok_authtoken_here") {
  Write-Error "NGROK_AUTHTOKEN trong .env chua duoc dien!"
  exit 1
}

Write-Host "Dang mo tunnel https://$domain -> http://localhost:5173 (doc token tu .env) ..." -ForegroundColor Cyan
ngrok http --url=$domain 5173
