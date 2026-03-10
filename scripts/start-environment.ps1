[CmdletBinding()]
param(
    [string]$RepoPath = "",
    [int]$ApiPort = 8000,
    [int]$DashboardPort = 3000,
    [switch]$IncludeMonkeyOCR,
    [switch]$SkipInfra,
    [switch]$SkipApi,
    [switch]$SkipDashboard,
    [switch]$SkipNpmInstall,
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($RepoPath)) {
    $RepoPath = Split-Path -Parent $PSScriptRoot
}

$runtimeDir = Join-Path $RepoPath "tmp\runtime"
$venvPython = Join-Path $RepoPath ".venv\Scripts\python.exe"
$dashboardPath = Join-Path $RepoPath "dashboard"
$npmCmd = Get-Command npm.cmd -ErrorAction SilentlyContinue

function Write-Step {
    param([string]$Message)
    Write-Host "==> $Message"
}

function Assert-CommandExists {
    param(
        [string]$CommandName,
        [string]$InstallHint
    )

    if (-not (Get-Command $CommandName -ErrorAction SilentlyContinue)) {
        throw "Command '$CommandName' not found. $InstallHint"
    }
}

function Test-PortListening {
    param([int]$Port)

    try {
        return $null -ne (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop | Select-Object -First 1)
    }
    catch {
        return $false
    }
}

function Invoke-LoggedCommand {
    param(
        [string]$FilePath,
        [string[]]$ArgumentList,
        [string]$WorkingDirectory,
        [string]$Label
    )

    $commandText = @($FilePath) + $ArgumentList
    Write-Step "$Label -> $($commandText -join ' ')"

    if ($DryRun) {
        return
    }

    & $FilePath @ArgumentList
    if ($LASTEXITCODE -ne 0) {
        throw "$Label failed with exit code $LASTEXITCODE."
    }
}

function Start-ManagedProcess {
    param(
        [string]$Name,
        [string]$FilePath,
        [string[]]$ArgumentList,
        [string]$WorkingDirectory,
        [int]$Port
    )

    $stdoutLog = Join-Path $runtimeDir "$Name.out.log"
    $stderrLog = Join-Path $runtimeDir "$Name.err.log"
    $pidFile = Join-Path $runtimeDir "$Name.pid"
    $commandText = @($FilePath) + $ArgumentList

    if (Test-PortListening -Port $Port) {
        Write-Warning "$Name was not started because port $Port is already in use."
        return
    }

    Write-Step "Starting $Name on port $Port -> $($commandText -join ' ')"

    if ($DryRun) {
        return
    }

    $process = Start-Process `
        -FilePath $FilePath `
        -ArgumentList $ArgumentList `
        -WorkingDirectory $WorkingDirectory `
        -RedirectStandardOutput $stdoutLog `
        -RedirectStandardError $stderrLog `
        -WindowStyle Hidden `
        -PassThru

    Set-Content -Path $pidFile -Value $process.Id
    Write-Host "    pid=$($process.Id)"
    Write-Host "    stdout=$stdoutLog"
    Write-Host "    stderr=$stderrLog"
}

if (-not (Test-Path $RepoPath)) {
    throw "Repository path not found: $RepoPath"
}

New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null

if (-not $SkipInfra) {
    Assert-CommandExists -CommandName "docker" -InstallHint "Install Docker Desktop and ensure 'docker compose' is available."
    Invoke-LoggedCommand `
        -FilePath "docker" `
        -ArgumentList @("compose", "up", "-d") `
        -WorkingDirectory $RepoPath `
        -Label "Starting Docker services"

    if ($IncludeMonkeyOCR) {
        Invoke-LoggedCommand `
            -FilePath "docker" `
            -ArgumentList @("compose", "--profile", "gpu", "up", "monkeyocr", "--build", "-d") `
            -WorkingDirectory $RepoPath `
            -Label "Starting MonkeyOCR"
    }
}

if (-not $SkipApi) {
    if (-not (Test-Path $venvPython)) {
        $venvMessage = "Python venv not found: $venvPython. Run 'python -m venv .venv' and '.\.venv\Scripts\python.exe -m pip install -e .[dev]' from the repo root."
        if ($DryRun) {
            Write-Warning $venvMessage
        }
        else {
            throw $venvMessage
        }
    }
    else {
        Start-ManagedProcess `
            -Name "api-$ApiPort" `
            -FilePath $venvPython `
            -ArgumentList @("-m", "uvicorn", "jira_issue_rag.main:app", "--reload", "--host", "0.0.0.0", "--port", "$ApiPort") `
            -WorkingDirectory $RepoPath `
            -Port $ApiPort
    }
}

if (-not $SkipDashboard) {
    if (-not (Test-Path $dashboardPath)) {
        throw "Dashboard path not found: $dashboardPath"
    }

    if (-not $npmCmd) {
        throw "npm.cmd not found. Install Node.js 20+ and ensure npm is in PATH."
    }

    $nodeModulesPath = Join-Path $dashboardPath "node_modules"
    if ((-not $SkipNpmInstall) -and (-not (Test-Path $nodeModulesPath))) {
        Invoke-LoggedCommand `
            -FilePath $npmCmd.Source `
            -ArgumentList @("install") `
            -WorkingDirectory $dashboardPath `
            -Label "Installing dashboard dependencies"
    }

    Start-ManagedProcess `
        -Name "dashboard-$DashboardPort" `
        -FilePath $npmCmd.Source `
        -ArgumentList @("run", "dev", "--", "--hostname", "0.0.0.0", "--port", "$DashboardPort") `
        -WorkingDirectory $dashboardPath `
        -Port $DashboardPort
}

Write-Host ""
Write-Host "Environment command completed."
Write-Host "API:        http://localhost:$ApiPort"
Write-Host "Dashboard:  http://localhost:$DashboardPort"
if ($IncludeMonkeyOCR) {
    Write-Host "MonkeyOCR:  http://localhost:8001"
}
Write-Host "Runtime dir: $runtimeDir"
