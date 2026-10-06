@echo off
setlocal
set "MAILCHAT_NODE="
for /f "delims=" %%N in ('where node.exe 2^>nul') do if not defined MAILCHAT_NODE set "MAILCHAT_NODE=%%N"
if not defined MAILCHAT_NODE if exist "%ProgramFiles%\nodejs\node.exe" set "MAILCHAT_NODE=%ProgramFiles%\nodejs\node.exe"
if not defined MAILCHAT_NODE (
 echo Installa Node.js LTS da https://nodejs.org/en/download e riprova.
 pause
 exit /b 1
)
"%MAILCHAT_NODE%" "%~dp0scripts\setup.mjs"
if errorlevel 1 (
 pause
 exit /b 1
)
pause
