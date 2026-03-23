param(
  [string[]]$Province = @(),
  [string]$OutFile = ".\\pumpradar-all-provinces.json",
  [switch]$All
)

$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Read-PumpRadarPayload {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Url
  )

  $client = New-Object System.Net.WebClient
  $client.Headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) PowerShell PumpRadar Import"

  try {
    $bytes = $client.DownloadData($Url)
    $jsonText = [System.Text.Encoding]::UTF8.GetString($bytes)
    return $jsonText | ConvertFrom-Json
  } finally {
    $client.Dispose()
  }
}

$provinceSlugs = @(
  "amnat-charoen",
  "ang-thong",
  "bangkok",
  "bueng-kan",
  "buriram",
  "chachoengsao",
  "chai-nat",
  "chaiyaphum",
  "chanthaburi",
  "chiang-mai",
  "chiang-rai",
  "chonburi",
  "chumphon",
  "kalasin",
  "kamphaeng-phet",
  "kanchanaburi",
  "khon-kaen",
  "krabi",
  "lampang",
  "lamphun",
  "loei",
  "lopburi",
  "mae-hong-son",
  "maha-sarakham",
  "mukdahan",
  "nakhon-nayok",
  "nakhon-pathom",
  "nakhon-phanom",
  "nakhon-ratchasima",
  "nakhon-sawan",
  "nakhon-si-thammarat",
  "nan",
  "narathiwat",
  "nong-bua-lamphu",
  "nong-khai",
  "nonthaburi",
  "pathum-thani",
  "pattani",
  "phang-nga",
  "phatthalung",
  "phayao",
  "phetchabun",
  "phetchaburi",
  "phichit",
  "phitsanulok",
  "phra-nakhon-si-ayutthaya",
  "phrae",
  "phuket",
  "prachinburi",
  "prachuap-khiri-khan",
  "ranong",
  "ratchaburi",
  "rayong",
  "roi-et",
  "sa-kaeo",
  "sakon-nakhon",
  "samut-prakan",
  "samut-sakhon",
  "samut-songkhram",
  "saraburi",
  "satun",
  "sing-buri",
  "sisaket",
  "songkhla",
  "sukhothai",
  "suphan-buri",
  "surat-thani",
  "surin",
  "tak",
  "trang",
  "trat",
  "ubon-ratchathani",
  "udon-thani",
  "uthai-thani",
  "uttaradit",
  "yala",
  "yasothon"
)

if ($All -or -not $Province.Count) {
  $selected = $provinceSlugs
} else {
  $selected = $Province |
    ForEach-Object { $_.Trim().ToLower() } |
    Where-Object { $_ } |
    Select-Object -Unique
}

$results = New-Object System.Collections.Generic.List[object]
$failures = New-Object System.Collections.Generic.List[object]

foreach ($slug in $selected) {
  $url = "https://thaipumpradar.com/api/provinces/$slug/stations"
  Write-Host "Fetching $slug ..."

  try {
    $payload = Read-PumpRadarPayload -Url $url
    $results.Add([pscustomobject][ordered]@{
      provinceSlug = $slug
      province = $payload.province
      stations = @($payload.stations)
    })
  } catch {
    $failures.Add([pscustomobject][ordered]@{
      provinceSlug = $slug
      error = $_.Exception.Message
    })
    Write-Warning "Failed $slug"
  }
}

$directory = Split-Path -Parent $OutFile
if ($directory -and -not (Test-Path $directory)) {
  New-Item -ItemType Directory -Path $directory | Out-Null
}

$output = [pscustomobject][ordered]@{
  source = "PumpRadar"
  generatedAt = (Get-Date).ToString("o")
  provinceCount = $results.Count
  provinces = @($results.ToArray())
  failures = @($failures.ToArray())
}

$output | ConvertTo-Json -Depth 100 | Set-Content -Path $OutFile -Encoding UTF8

Write-Host ""
Write-Host ("Saved to " + (Resolve-Path $OutFile))
Write-Host ("Province payloads: " + $results.Count)
if ($failures.Count) {
  Write-Warning ("Failed provinces: " + (($failures | ForEach-Object { $_.provinceSlug }) -join ", "))
}
