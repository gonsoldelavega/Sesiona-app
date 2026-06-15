#!/usr/bin/env bash
# Sesiona · Arranque del bot de WhatsApp en el VPS (tras configurar PocketBase).
# Instala dependencias y deja el bot como servicio con pm2.
#
# Uso (desde la carpeta bot/ del repo clonado en el VPS):
#   cd bot
#   cp .env.example .env   # y edítalo con PB_URL, PB_ADMIN_*, SESIONA_USER_ID
#   bash ../scripts/setup-bot.sh
#
# La primera vez, el bot mostrará un QR en los logs: escanéalo con el WhatsApp
# del número del bot (Ajustes -> Dispositivos vinculados).
set -euo pipefail

HERE="$(cd "$(dirname "$0")/../bot" && pwd)"
cd "$HERE"

[ -f .env ] || { echo "Falta bot/.env. Copia .env.example a .env y rellénalo primero."; exit 1; }

echo "==> Node.js"
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - >/dev/null 2>&1 || true
  sudo apt-get install -y nodejs >/dev/null 2>&1 || true
fi
node -v || { echo "Instala Node.js 20+ y reintenta."; exit 1; }

echo "==> Dependencias del bot"
npm install --omit=dev

echo "==> pm2 (gestor de procesos)"
command -v pm2 >/dev/null 2>&1 || sudo npm install -g pm2 >/dev/null 2>&1 || npm install -g pm2

echo "==> Arrancar el bot"
pm2 delete sesiona-bot >/dev/null 2>&1 || true
pm2 start src/index.js --name sesiona-bot --node-args="--env-file=.env"
pm2 save
pm2 startup >/dev/null 2>&1 || true

cat <<FIN

============================================================
 Bot iniciado con pm2 (sesiona-bot).
 Ver el QR / logs:   pm2 logs sesiona-bot
 Escanea el QR con el WhatsApp del bot la primera vez.
 Reiniciar:          pm2 restart sesiona-bot
============================================================
FIN
