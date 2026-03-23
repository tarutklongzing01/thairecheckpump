param(
  [string]$InputPath = "..\stations-for-google-sheet.csv",
  [string]$OutputPath = "..\stations-public.json"
)

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$resolvedInputPath = [System.IO.Path]::GetFullPath((Join-Path $scriptRoot $InputPath))
$resolvedOutputPath = [System.IO.Path]::GetFullPath((Join-Path $scriptRoot $OutputPath))

if (-not (Test-Path $resolvedInputPath)) {
  throw "Input file not found: $resolvedInputPath"
}

$rows = Import-Csv -Path $resolvedInputPath -Encoding UTF8
$payload = [pscustomobject]@{
  ok = $true
  source = "static-json"
  generatedAt = (Get-Date).ToString("o")
  count = @($rows).Count
  stations = @($rows)
}

$outputDir = Split-Path -Parent $resolvedOutputPath
if (-not (Test-Path $outputDir)) {
  New-Item -ItemType Directory -Path $outputDir | Out-Null
}

$json = $payload | ConvertTo-Json -Depth 6 -Compress
[System.IO.File]::WriteAllText($resolvedOutputPath, $json, [System.Text.UTF8Encoding]::new($false))

Write-Host ("Exported {0} stations to {1}" -f @($rows).Count, $resolvedOutputPath)
