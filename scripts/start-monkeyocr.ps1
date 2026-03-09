[CmdletBinding()]
param(
    [string]$RepoPath = "C:\Users\mengl\Documents\Github\MonkeyOCR",
    [string]$BindHost = "0.0.0.0",
    [int]$Port = 8001,
    [switch]$Background
)

$pythonExe = Join-Path $RepoPath ".venv\Scripts\python.exe"

if (-not (Test-Path $RepoPath)) {
    throw "MonkeyOCR repo not found: $RepoPath"
}

if (-not (Test-Path $pythonExe)) {
    throw "MonkeyOCR venv python not found: $pythonExe"
}

if ($Background) {
    $stdoutLog = Join-Path $RepoPath "monkeyocr-api.out.log"
    $stderrLog = Join-Path $RepoPath "monkeyocr-api.err.log"
    Start-Process `
        -FilePath $pythonExe `
        -ArgumentList @("-m", "uvicorn", "api.main:app", "--host", $BindHost, "--port", "$Port") `
        -WorkingDirectory $RepoPath `
        -RedirectStandardOutput $stdoutLog `
        -RedirectStandardError $stderrLog
    Write-Output "MonkeyOCR started in background on http://$BindHost`:$Port"
    Write-Output "Logs: $stdoutLog"
    Write-Output "Logs: $stderrLog"
    exit 0
}

Push-Location $RepoPath
try {
    & $pythonExe -m uvicorn api.main:app --host $BindHost --port $Port
}
finally {
    Pop-Location
}
