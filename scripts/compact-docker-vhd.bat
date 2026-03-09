@echo off
setlocal

set "DEFAULT_VHD=%LOCALAPPDATA%\Docker\wsl\disk\docker_data.vhdx"
set "VHD_PATH=%~1"

if not defined VHD_PATH set "VHD_PATH=%DEFAULT_VHD%"

net session >nul 2>&1
if errorlevel 1 (
  echo Este script precisa ser executado como Administrador.
  echo.
  echo Exemplo:
  echo   powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process cmd -Verb RunAs -ArgumentList '/c ""%~f0""'"
  exit /b 1
)

if not exist "%VHD_PATH%" (
  echo VHD nao encontrado:
  echo   "%VHD_PATH%"
  echo.
  echo Uso:
  echo   %~nx0
  echo   %~nx0 "C:\caminho\para\arquivo.vhdx"
  exit /b 1
)

echo Parando WSL antes da compactacao...
wsl --shutdown >nul 2>&1

echo.
echo Compactando:
echo   "%VHD_PATH%"
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "Import-Module Hyper-V; Optimize-VHD -Path '%VHD_PATH%' -Mode Full"
if errorlevel 1 (
  echo.
  echo Falha ao compactar o VHD.
  echo Verifique se o modulo Hyper-V esta disponivel e se nenhum processo ainda esta usando o arquivo.
  exit /b 1
)

echo.
echo Compactacao concluida.
exit /b 0
