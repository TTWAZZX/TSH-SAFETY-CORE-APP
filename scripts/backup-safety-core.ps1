param(
    [string]$EnvFile = ".\backend\.env",
    [string]$OutputRoot = ".\backups",
    [string]$MysqlDumpPath = ""
)

$ErrorActionPreference = "Stop"

function Read-DotEnv {
    param([string]$Path)
    $values = @{}
    Get-Content -LiteralPath $Path | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith("#")) { return }
        $idx = $line.IndexOf("=")
        if ($idx -lt 1) { return }
        $key = $line.Substring(0, $idx).Trim()
        $value = $line.Substring($idx + 1).Trim().Trim('"').Trim("'")
        $values[$key] = $value
    }
    return $values
}

function Resolve-CommandPath {
    param([string[]]$Candidates)
    foreach ($candidate in $Candidates) {
        if (-not $candidate) { continue }
        if (Test-Path -LiteralPath $candidate) { return (Resolve-Path -LiteralPath $candidate).Path }
        $cmd = Get-Command $candidate -ErrorAction SilentlyContinue
        if ($cmd) { return $cmd.Source }
    }
    throw "mysqldump executable was not found. Pass -MysqlDumpPath or add it to PATH."
}

$repoRoot = (Resolve-Path -LiteralPath ".").Path
$envPath = Resolve-Path -LiteralPath $EnvFile
$env = Read-DotEnv -Path $envPath

foreach ($key in @("DB_HOST", "DB_USER", "DB_NAME")) {
    if (-not $env.ContainsKey($key)) { throw "Missing $key in $EnvFile" }
}

$dbHost = $env["DB_HOST"]
$dbPort = if ($env.ContainsKey("DB_PORT") -and $env["DB_PORT"]) { $env["DB_PORT"] } else { "3306" }
$dbUser = $env["DB_USER"]
$dbPass = if ($env.ContainsKey("DB_PASS")) { $env["DB_PASS"] } else { "" }
$dbName = $env["DB_NAME"]

$dumpExe = Resolve-CommandPath @(
    $MysqlDumpPath,
    "C:\xampp\mysql\bin\mysqldump.exe",
    "mysqldump.exe",
    "mysqldump"
)

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
if (-not (Test-Path -LiteralPath $OutputRoot)) {
    New-Item -ItemType Directory -Path $OutputRoot | Out-Null
}
$backupDir = Join-Path (Resolve-Path -LiteralPath $OutputRoot).Path $timestamp
New-Item -ItemType Directory -Path $backupDir | Out-Null

$dbFile = Join-Path $backupDir "$dbName.sql"
$uploadsZip = Join-Path $backupDir "uploads.zip"
$manifestFile = Join-Path $backupDir "manifest.txt"
$uploadsDir = Join-Path $repoRoot "backend\uploads"

$oldPwd = $env:MYSQL_PWD
try {
    $env:MYSQL_PWD = $dbPass
    & $dumpExe `
        "--host=$dbHost" `
        "--port=$dbPort" `
        "--user=$dbUser" `
        "--single-transaction" `
        "--routines" `
        "--triggers" `
        "--events" `
        "--databases" $dbName `
        "--result-file=$dbFile"

    if ($LASTEXITCODE -ne 0) { throw "mysqldump failed with exit code $LASTEXITCODE" }
} finally {
    $env:MYSQL_PWD = $oldPwd
}

if (-not (Test-Path -LiteralPath $uploadsDir)) {
    New-Item -ItemType Directory -Path $uploadsDir | Out-Null
}

$uploadItems = Get-ChildItem -LiteralPath $uploadsDir -Force
if ($uploadItems.Count) {
    Compress-Archive -Path (Join-Path $uploadsDir "*") -DestinationPath $uploadsZip -Force
} else {
    $emptyMarker = Join-Path $backupDir "uploads-empty.txt"
    "No uploaded files existed at backup time." | Set-Content -LiteralPath $emptyMarker -Encoding UTF8
    Compress-Archive -Path $emptyMarker -DestinationPath $uploadsZip -Force
}

@(
    "TSH Safety Core backup",
    "CreatedAt=$(Get-Date -Format o)",
    "Database=$dbName",
    "DBHost=$dbHost",
    "DBPort=$dbPort",
    "DatabaseDump=$dbFile",
    "UploadsZip=$uploadsZip",
    "UploadsSource=$uploadsDir"
) | Set-Content -LiteralPath $manifestFile -Encoding UTF8

Write-Host "Backup completed:"
Write-Host "  $backupDir"
