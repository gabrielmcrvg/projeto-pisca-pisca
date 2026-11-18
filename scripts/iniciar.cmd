@echo off
setlocal EnableExtensions
title CorollaHUB (codigo-fonte)
rem Este arquivo fica em scripts\; o projeto e a pasta de cima.
set "QUADRA_DIR=%~dp0..\"
if not exist "%QUADRA_DIR%package.json" goto notextracted
if not exist "%QUADRA_DIR%src\main\index.js" goto notextracted
pushd "%QUADRA_DIR%"
if errorlevel 1 goto foldererror
set "ELECTRON_RUN_AS_NODE="
set "ELECTRON_SKIP_BINARY_DOWNLOAD="
set "npm_config_ignore_scripts=false"
if exist "%QUADRA_DIR%node_modules\electron\dist\electron.exe" goto run
echo Preparando o Quadra para o primeiro uso...
echo E necessario estar conectado a internet.
where node.exe >nul 2>nul
if errorlevel 1 (
  echo Instale o Node.js LTS em https://nodejs.org e abra este arquivo novamente.
  start "" "https://nodejs.org/"
  pause
  exit /b 1
)
call npm.cmd install --include=dev --ignore-scripts=false --no-audit --no-fund
if errorlevel 1 (
  echo Nao foi possivel instalar. Confira a internet e tente novamente.
  pause
  exit /b 1
)
if exist "%QUADRA_DIR%node_modules\electron\dist\electron.exe" goto run
echo Completando o download do navegador...
if not exist "%QUADRA_DIR%node_modules\electron\install.js" goto installerror
node.exe "%QUADRA_DIR%node_modules\electron\install.js"
if errorlevel 1 goto installerror
if not exist "%QUADRA_DIR%node_modules\electron\dist\electron.exe" goto installerror
:run
if /i "%~1"=="debug" goto rundebug
start "" "%QUADRA_DIR%node_modules\electron\dist\electron.exe" "%QUADRA_DIR%."
popd
exit /b
:rundebug
echo Abrindo o Quadra em modo de diagnostico...
set "ELECTRON_ENABLE_LOGGING=1"
"%QUADRA_DIR%node_modules\electron\dist\electron.exe" "%QUADRA_DIR%."
echo O Quadra foi fechado (codigo %errorlevel%).
pause
popd
exit /b
:notextracted
echo Extraia a pasta INTEIRA do ZIP antes de abrir o Iniciar.cmd.
echo Clique com o botao direito no ZIP e escolha Extrair Tudo.
pause
exit /b 1
:foldererror
echo Nao foi possivel acessar a pasta do Quadra.
pause
exit /b 1
:installerror
echo O download do navegador nao foi concluido.
echo Confira os erros acima e sua conexao; depois abra o Iniciar.cmd novamente.
pause
popd
exit /b 1
