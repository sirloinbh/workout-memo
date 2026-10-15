@echo off
setlocal
set "CODEX_HOME=%LOCALAPPDATA%\Codex-Account-B"
for %%I in ("%~dp0..") do set "WORKOUT_PROJECT_ROOT=%%~fI"
if "%~1"=="" goto workout
if /I "%~f1"=="%WORKOUT_PROJECT_ROOT%" goto workout
call code --user-data-dir "%LOCALAPPDATA%\VSCode-Account-B" --new-window %*
exit /b %errorlevel%

:workout
set "GH_CONFIG_DIR=%APPDATA%\GitHub CLI"
set "GH_TOKEN="
set "GITHUB_TOKEN="

if "%~1"=="" (
    call code --user-data-dir "%LOCALAPPDATA%\VSCode-Account-B-workout-memo" --new-window "%WORKOUT_PROJECT_ROOT%"
) else (
    call code --user-data-dir "%LOCALAPPDATA%\VSCode-Account-B-workout-memo" --new-window %*
)
exit /b %errorlevel%
