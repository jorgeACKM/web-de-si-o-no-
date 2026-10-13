#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Falta instalar Node.js. Descárguelo de https://nodejs.org (versión LTS) y vuelva a abrir este archivo."
  open https://nodejs.org
  read -p "Presione Enter para salir"
  exit 1
fi
echo "Iniciando ContaPY... NO cierre esta ventana mientras use el sistema."
(sleep 1; open http://localhost:3000) &
node server/server.js
