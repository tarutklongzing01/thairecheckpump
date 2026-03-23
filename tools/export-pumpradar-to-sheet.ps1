param(
  [string]$InputPath = "..\pumpradar-all-provinces.json",
  [string]$OutputPath = "..\stations-for-google-sheet.csv"
)

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$resolvedInputPath = [System.IO.Path]::GetFullPath((Join-Path $scriptRoot $InputPath))
$resolvedOutputPath = [System.IO.Path]::GetFullPath((Join-Path $scriptRoot $OutputPath))

if (-not (Test-Path $resolvedInputPath)) {
  throw "Input file not found: $resolvedInputPath"
}

function Map-Brand([string]$brandId) {
  if ([string]::IsNullOrWhiteSpace($brandId)) {
    $key = "OTHER"
  } else {
    $key = $brandId.Trim().ToUpperInvariant()
  }
  return $key
}

function Map-Status([string]$status) {
  $normalized = if ($null -eq $status) { "" } else { $status.Trim().ToLowerInvariant() }
  switch ($normalized) {
    "available" { return "high" }
    "limited" { return "medium" }
    "out" { return "empty" }
    default { return "unknown" }
  }
}

function First-NotEmpty {
  param([object[]]$Values)

  foreach ($value in $Values) {
    if ($null -ne $value -and "$value".Trim() -ne "") {
      return $value
    }
  }

  return $null
}

$payload = Get-Content -Raw -Encoding UTF8 $resolvedInputPath | ConvertFrom-Json
$provincePayloads = @($payload.provinces)
$rows = New-Object System.Collections.Generic.List[object]
$seen = @{}

foreach ($provincePayload in $provincePayloads) {
  $provinceName = [string]$provincePayload.province
  $provinceSlug = [string]$provincePayload.provinceSlug

  foreach ($station in @($provincePayload.stations)) {
    $stationId = [string]$station.id
    if ([string]::IsNullOrWhiteSpace($stationId) -or $seen.ContainsKey($stationId)) {
      continue
    }

    $seen[$stationId] = $true
    $latestReport = $station.latestReport

    $fuelDiesel = Map-Status $latestReport.diesel
    $fuelGas91 = Map-Status (First-NotEmpty @($latestReport.benzineG91, $latestReport.benzine91))
    $fuelGas95 = Map-Status (First-NotEmpty @($latestReport.benzineG95, $latestReport.benzine95))
    $fuelE20 = Map-Status (First-NotEmpty @($latestReport.benzineE20, $latestReport.e20))
    $fuelE85 = Map-Status (First-NotEmpty @($latestReport.benzineE85, $latestReport.e85))
    $fuelLpg = Map-Status $latestReport.lpg
    $fuelValues = @($fuelDiesel, $fuelGas91, $fuelGas95, $fuelE20, $fuelE85, $fuelLpg)
    $hasKnownFuel = $fuelValues | Where-Object { $_ -ne "unknown" }
    $updatedAt = First-NotEmpty @($station.reportTime, $latestReport.createdAt, (Get-Date).ToString("o"))
    $area = First-NotEmpty @($station.district, $station.province, $provinceName, "ยังไม่ระบุพื้นที่")

    $rows.Add([pscustomobject]@{
        id = $stationId.Trim()
        name = (First-NotEmpty @($station.name, $stationId)).ToString().Trim()
        brand = Map-Brand $station.brandId
        area = "$area".Trim()
        lat = [double]$station.lat
        lng = [double](First-NotEmpty @($station.lon, $station.lng, 0))
        reportCount = if ($hasKnownFuel) { 1 } else { 0 }
        photoUrl = "$($latestReport.photoUrl)".Trim()
        updatedAt = "$updatedAt".Trim()
        createdAt = "$updatedAt".Trim()
        sourceId = "$($station.sourceId)".Trim()
        importSource = "thaipumpradar"
        importProvince = (First-NotEmpty @($station.province, $provinceName, $provinceSlug)).ToString().Trim()
        lastReportId = "$($latestReport.id)".Trim()
        lastReporter = "PumpRadar"
        fuel_diesel = $fuelDiesel
        fuel_gas91 = $fuelGas91
        fuel_gas95 = $fuelGas95
        fuel_e20 = $fuelE20
        fuel_e85 = $fuelE85
        fuel_lpg = $fuelLpg
      })
  }
}

$outputDir = Split-Path -Parent $resolvedOutputPath
if (-not (Test-Path $outputDir)) {
  New-Item -ItemType Directory -Path $outputDir | Out-Null
}

$rows |
  Sort-Object id |
  Export-Csv -Path $resolvedOutputPath -NoTypeInformation -Encoding UTF8

Write-Host ("Exported {0} stations to {1}" -f $rows.Count, $resolvedOutputPath)
