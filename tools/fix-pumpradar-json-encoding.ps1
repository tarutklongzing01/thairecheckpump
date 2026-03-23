param(
  [string]$InputFile = ".\\pumpradar-all-provinces.json",
  [string]$OutFile = ".\\pumpradar-all-provinces.fixed.json"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $InputFile)) {
  throw "Input file not found: $InputFile"
}

$rawText = Get-Content -Path $InputFile -Raw -Encoding UTF8
$fixedText = [System.Text.Encoding]::UTF8.GetString(
  [System.Text.Encoding]::GetEncoding(28591).GetBytes($rawText)
)

$fixedText | Set-Content -Path $OutFile -Encoding UTF8

Write-Host ("Saved fixed JSON to " + (Resolve-Path $OutFile))
