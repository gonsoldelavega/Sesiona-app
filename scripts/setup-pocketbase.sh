#!/usr/bin/env bash
# Sesiona · Instalador de PocketBase con HTTPS gratis (DuckDNS) en un VPS Linux.
# Ejecútalo en el VPS (Ubuntu/Debian) con sudo. Es idempotente (se puede repetir).
#
# Uso:
#   export DUCKDNS_DOMAIN=sesiona.duckdns.org   # tu subdominio DuckDNS completo
#   export DUCKDNS_TOKEN=xxxxxxxx               # token de tu cuenta DuckDNS
#   export PB_ADMIN_EMAIL=admin@tucorreo.com    # admin de PocketBase (elígelo)
#   export PB_ADMIN_PASSWORD='una-clave-fuerte'
#   sudo -E bash scripts/setup-pocketbase.sh
#
# Requisitos previos (solo tú puedes hacerlos):
#   - Cuenta gratis en https://www.duckdns.org y un subdominio apuntando a la IP del VPS.
#   - Puertos 80 y 443 accesibles desde internet.
set -euo pipefail

: "${DUCKDNS_DOMAIN:?Define DUCKDNS_DOMAIN, p.ej. sesiona.duckdns.org}"
: "${DUCKDNS_TOKEN:?Define DUCKDNS_TOKEN (de tu cuenta DuckDNS)}"
: "${PB_ADMIN_EMAIL:?Define PB_ADMIN_EMAIL}"
: "${PB_ADMIN_PASSWORD:?Define PB_ADMIN_PASSWORD}"

SUB="${DUCKDNS_DOMAIN%%.duckdns.org}"
DIR=/opt/pocketbase
DATA="$DIR/pb_data"

echo "==> Dependencias (curl, unzip, cron)"
apt-get update -y >/dev/null 2>&1 || true
apt-get install -y curl unzip cron >/dev/null 2>&1 || true

echo "==> DuckDNS: fijar IP actual y refresco automático cada 5 min"
curl -fsS "https://www.duckdns.org/update?domains=${SUB}&token=${DUCKDNS_TOKEN}&ip=" >/dev/null || true
( crontab -l 2>/dev/null | grep -v 'duckdns.org/update' ; \
  echo "*/5 * * * * curl -fsS 'https://www.duckdns.org/update?domains=${SUB}&token=${DUCKDNS_TOKEN}&ip=' >/dev/null 2>&1" ) | crontab -

echo "==> Descargar PocketBase (última versión)"
mkdir -p "$DIR"
case "$(uname -m)" in
  x86_64) A=amd64;; aarch64|arm64) A=arm64;; armv7l) A=armv7;;
  *) echo "Arquitectura no soportada: $(uname -m)"; exit 1;;
esac
VER="$(curl -fsS https://api.github.com/repos/pocketbase/pocketbase/releases/latest | grep -oE '"tag_name": *"v[^"]+"' | grep -oE 'v[0-9.]+' | head -1 | tr -d v)"
[ -n "$VER" ] || { echo "No pude detectar la versión de PocketBase"; exit 1; }
curl -fL -o /tmp/pocketbase.zip "https://github.com/pocketbase/pocketbase/releases/download/v${VER}/pocketbase_${VER}_linux_${A}.zip"
unzip -o /tmp/pocketbase.zip -d "$DIR" >/dev/null
chmod +x "$DIR/pocketbase"
echo "    PocketBase v${VER} instalado en $DIR"

echo "==> Crear/asegurar la cuenta de administrador"
mkdir -p "$DATA"
# El nombre del comando cambia según versión; probamos las variantes conocidas.
( "$DIR/pocketbase" superuser upsert "$PB_ADMIN_EMAIL" "$PB_ADMIN_PASSWORD" --dir "$DATA" \
  || "$DIR/pocketbase" superuser create "$PB_ADMIN_EMAIL" "$PB_ADMIN_PASSWORD" --dir "$DATA" \
  || "$DIR/pocketbase" admin create "$PB_ADMIN_EMAIL" "$PB_ADMIN_PASSWORD" --dir "$DATA" ) >/dev/null 2>&1 || \
  echo "    (Si falló, crea el admin luego desde el panel web en /_/ )"

echo "==> Servicio systemd (HTTPS automático con Let's Encrypt)"
cat >/etc/systemd/system/pocketbase.service <<EOF
[Unit]
Description=PocketBase (Sesiona)
After=network.target

[Service]
Type=simple
WorkingDirectory=$DIR
ExecStart=$DIR/pocketbase serve --https=$DUCKDNS_DOMAIN --dir=$DATA
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now pocketbase

echo "==> Abrir puertos 80/443 (si usas ufw)"
if command -v ufw >/dev/null 2>&1; then ufw allow 80/tcp >/dev/null 2>&1 || true; ufw allow 443/tcp >/dev/null 2>&1 || true; fi

cat <<FIN

============================================================
 PocketBase en marcha (puede tardar ~1 min en sacar el HTTPS)
 Panel admin:   https://${DUCKDNS_DOMAIN}/_/
 URL para la app y el bot:  https://${DUCKDNS_DOMAIN}

 SIGUIENTE PASO:
 1) Entra al panel /_/ con el admin que definiste.
 2) Settings -> Import collections -> sube pocketbase/pb_schema.json
    (o crea las colecciones con la tabla de docs/etapa2-nube-setup.md).
 3) En la app Sesiona -> Ajustes -> Sincronización: pega la URL y regístrate.
 4) Para el bot: copia tu user id (colección users) al bot/.env.
============================================================
FIN
