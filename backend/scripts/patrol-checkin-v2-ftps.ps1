param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('download', 'upload', 'delete', 'list')]
    [string]$Action,
    [string]$RemotePath = '',
    [string]$LocalPath = ''
)

$ErrorActionPreference = 'Stop'

$envPath = Join-Path $PSScriptRoot '..\.env'
$settings = @{}
Get-Content -LiteralPath $envPath -Encoding UTF8 | ForEach-Object {
    if ($_ -match '^([A-Z0-9_]+)=(.*)$') {
        $settings[$Matches[1]] = $Matches[2].Trim()
    }
}

foreach ($required in @('FTP_HOST', 'FTP_PORT', 'FTP_USER', 'FTP_PASS', 'FTP_PATH')) {
    if (-not $settings.ContainsKey($required) -or [string]::IsNullOrWhiteSpace($settings[$required])) {
        throw "Missing $required in backend/.env"
    }
}

$root = '/' + $settings.FTP_PATH.Trim('/')
$relative = $RemotePath.Replace('\\', '/').TrimStart('/')
$remote = if ($relative) { "$root/$relative" } else { $root }
$url = "ftp://$($settings.FTP_HOST):$($settings.FTP_PORT)$remote"
$credential = "$($settings.FTP_USER):$($settings.FTP_PASS)"
$common = @('--silent', '--show-error', '--fail', '--ftp-ssl-control', '--ftp-skip-pasv-ip', '--insecure', '--user', $credential)

switch ($Action) {
    'download' {
        if ([string]::IsNullOrWhiteSpace($LocalPath)) { throw 'LocalPath is required for download' }
        $parent = Split-Path -Parent $LocalPath
        if ($parent) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
        & curl.exe @common $url '--output' $LocalPath
    }
    'upload' {
        if ([string]::IsNullOrWhiteSpace($LocalPath)) { throw 'LocalPath is required for upload' }
        if (-not (Test-Path -LiteralPath $LocalPath -PathType Leaf)) { throw "Upload source not found: $LocalPath" }
        & curl.exe @common '--ftp-create-dirs' '--upload-file' $LocalPath $url
    }
    'delete' {
        $serverUrl = "ftp://$($settings.FTP_HOST):$($settings.FTP_PORT)/"
        & curl.exe @common '--quote' "DELE $remote" $serverUrl | Out-Null
    }
    'list' {
        & curl.exe @common ($url.TrimEnd('/') + '/')
    }
}

if ($LASTEXITCODE -ne 0) {
    throw "FTPS $Action failed for $RemotePath (curl exit $LASTEXITCODE)"
}
