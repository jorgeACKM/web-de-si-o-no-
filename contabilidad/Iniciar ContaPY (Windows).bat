@echo off
title ContaPY - servidor
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Falta instalar Node.js. Descarguelo de https://nodejs.org (version LTS^),
  echo  instalelo con las opciones por defecto y vuelva a abrir este archivo.
  echo.
  start "" https://nodejs.org
  pause
  exit /b
)
echo.
echo  Iniciando ContaPY... NO cierre esta ventana mientras use el sistema.
echo.
start "" http://localhost:3000
node server\server.js
pause
