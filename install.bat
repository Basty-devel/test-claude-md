@echo off
setlocal EnableDelayedExpansion

set "PLUGIN_DIR=%USERPROFILE%\.claude\plugins\cache\@basty\omnifree\1.0.0"
set "SCRIPT_DIR=%~dp0"

echo === OmniFree Installer ===

:: 1. Build
echo [1/4] Building...
cd /d "%SCRIPT_DIR%"
call npm run build
if errorlevel 1 (echo ERROR: build failed & exit /b 1)

:: 2. Install to npm globally
echo [2/4] Installing @basty/omnifree globally...
call npm install -g "@basty/omnifree@latest"

:: 3. Copy plugin files to Claude plugins cache
echo [3/4] Registering plugin with Claude Code...
if not exist "%PLUGIN_DIR%\dist" mkdir "%PLUGIN_DIR%\dist"
if not exist "%PLUGIN_DIR%\skills\use" mkdir "%PLUGIN_DIR%\skills\use"
xcopy /E /Y "%SCRIPT_DIR%dist\*" "%PLUGIN_DIR%\dist\" >nul 2>&1
xcopy /E /Y "%SCRIPT_DIR%skills\use\*" "%PLUGIN_DIR%\skills\use\" >nul 2>&1
copy /Y "%SCRIPT_DIR%.claude-plugin\plugin.json" "%PLUGIN_DIR%\" >nul 2>&1
copy /Y "%SCRIPT_DIR%README.md" "%PLUGIN_DIR%\" >nul 2>&1
copy /Y "%SCRIPT_DIR%LICENSE" "%PLUGIN_DIR%\" >nul 2>&1

:: 4. Register in installed_plugins.json
echo [4/4] Writing plugin registration...
set "INSTALL_JSON=%USERPROFILE%\.claude\plugins\installed_plugins.json"
if exist "%INSTALL_JSON%" (
  node -e "const fs=require('fs');const p='%INSTALL_JSON%';const d=JSON.parse(fs.readFileSync(p,'utf8'));d.plugins['omnifree@basty']=d.plugins['omnifree@basty']||[{scope:'user',installPath:'%PLUGIN_DIR%',version:'1.0.0',installedAt:new Date().toISOString(),lastUpdated:new Date().toISOString()}];fs.writeFileSync(p,JSON.stringify(d,null,2));console.log('Plugin registered.');"
) else (
  echo WARNING: installed_plugins.json not found — run /plugin add @basty/omnifree manually.
)

echo.
echo Done.
echo   npm global : @basty/omnifree
echo   local      : %PLUGIN_DIR%
echo.
echo Next: restart Claude Code, then run:
echo   /use "hello"
