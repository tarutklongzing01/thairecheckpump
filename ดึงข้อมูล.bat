@echo off
setlocal
cd /d "%~dp0"

echo [1/2] Export CSV from pumpradar-all-provinces.json
powershell -ExecutionPolicy Bypass -File ".\tools\export-pumpradar-to-sheet.ps1"
if errorlevel 1 goto :fail

echo.
echo [2/2] Export stations-public.json
powershell -ExecutionPolicy Bypass -File ".\tools\export-stations-public-json.ps1"
if errorlevel 1 goto :fail

echo.
echo Done
echo - stations-for-google-sheet.csv
echo - stations-public.json
goto :end

:fail
echo.
echo Export failed
exit /b 1

:end
endlocal
