@echo off
setlocal
set "CODEX_HOME=%LOCALAPPDATA%\Codex-Account-B"
if not exist "%CODEX_HOME%" mkdir "%CODEX_HOME%"
if not exist "%CODEX_HOME%\config.toml" echo cli_auth_credentials_store = "file">"%CODEX_HOME%\config.toml"
for %%I in ("%~dp0..") do set "WORKOUT_PROJECT_ROOT=%%~fI"
if "%~1"=="" goto workout
if /I "%~f1"=="%WORKOUT_PROJECT_ROOT%" goto workout
if /I "%GH_CONFIG_DIR%"=="%LOCALAPPDATA%\gh-workout-memo" set "GH_CONFIG_DIR="
call code --user-data-dir "%LOCALAPPDATA%\VSCode-Account-B" --new-window %*
exit /b %errorlevel%

:workout
set "GH_CONFIG_DIR=%LOCALAPPDATA%\gh-workout-memo"
set "GH_TOKEN="
set "GITHUB_TOKEN="
for /f "delims=" %%T in ('gh auth token --hostname github.com --user sirloinbh 2^>nul') do set "GH_TOKEN=%%T"
if not defined GH_TOKEN (
    echo Authenticate sirloinbh in the project gh configuration first.
    exit /b 1
)

if "%~1"=="" (
    call code --user-data-dir "%LOCALAPPDATA%\VSCode-Account-B-workout-memo" --new-window "%WORKOUT_PROJECT_ROOT%"
) else (
    call code --user-data-dir "%LOCALAPPDATA%\VSCode-Account-B-workout-memo" --new-window %*
)
exit /b %errorlevel%
