# Etapa 2 — Nube con PocketBase (en tu VPS) + bot de WhatsApp

Backend propio en tu VPS con **PocketBase** (un único binario: base de datos +
cuentas/Auth + API REST). Sin límites de terceros y con los datos aislados por
usuario.

Arquitectura: **app web** (login + sincronización) ⇄ **PocketBase** (en el VPS)
⇄ **bot de WhatsApp** (mismo VPS, accede como admin a la agenda del usuario).

---

## 1) Instalar PocketBase en el VPS
1. Descarga el binario para tu sistema desde https://pocketbase.io/docs/ (Linux x64 normalmente).
2. Colócalo en una carpeta, p.ej. `/opt/pocketbase/`, y descomprímelo.
3. Pruébalo: `./pocketbase serve --http=0.0.0.0:8090`
4. Los datos viven en `./pb_data` — **haz copias de seguridad periódicas de esa carpeta** (ahí está todo).

### Servicio systemd (para que arranque solo)
`/etc/systemd/system/pocketbase.service`:
```ini
[Unit]
Description=PocketBase
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/pocketbase
ExecStart=/opt/pocketbase/pocketbase serve --http=127.0.0.1:8090
Restart=always

[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl daemon-reload && sudo systemctl enable --now pocketbase
```

## 2) HTTPS (necesario) — sin pagar, con un subdominio gratis
La app va por **https** (Vercel) y NO puede llamar a un backend por http, así que
PocketBase necesita HTTPS. Para HTTPS hace falta un **nombre** (no vale una IP
pelada), pero puede ser **gratis**. NO necesitas comprar un dominio.

### Opción A (recomendada, 0 €): subdominio gratis + HTTPS automático de PocketBase
1. Crea un subdominio gratis en **https://www.duckdns.org** (login con Google/GitHub),
   p.ej. `sesiona`, y apúntalo a la **IP pública de tu VPS**. Te queda
   `sesiona.duckdns.org`.
2. Abre los puertos **80 y 443** en el firewall del VPS.
3. Arranca PocketBase pidiéndole certificado automático (Let's Encrypt):
   ```bash
   ./pocketbase serve --https=sesiona.duckdns.org
   ```
   (En el servicio systemd, cambia el ExecStart a `--https=sesiona.duckdns.org`.)
4. Tu URL pública será: **`https://sesiona.duckdns.org`** — gratis y permanente.

### Opción B: reverse proxy con Caddy (si ya usas un dominio/subdominio propio)
`/etc/caddy/Caddyfile`:
```
agenda.tudominio.com {
    reverse_proxy 127.0.0.1:8090
}
```
```bash
sudo systemctl reload caddy
```
Tu URL pública será `https://agenda.tudominio.com`.

### Opción C: Cloudflare Tunnel (0 €, sin abrir puertos)
Útil si no quieres abrir puertos en el VPS. Con un dominio en Cloudflare queda
estable; el túnel "rápido" sin dominio da una URL que cambia al reiniciar (no
recomendable para uso permanente).

> Un dominio propio (~10 €/año) es **opcional**, solo por tener un nombre bonito.

## 3) Primer arranque y colecciones
1. Abre `https://agenda.tudominio.com/_/` y crea la **cuenta de administrador** (contraseña fuerte).
2. Crea las colecciones (Settings → Import collections, sube `pocketbase/pb_schema.json`; si tu versión no lo importa limpio, créalas a mano con la **tabla de campos** de más abajo).
3. En la colección **users** (Auth), activa el login por **email/contraseña** (Options → Email/password).

### Tabla de campos (creación manual, si hiciera falta)
Todas las colecciones son de tipo **Base** y llevan:
- `user` → tipo **Relation** a la colección **users** (Single, requerido).
- `aid` → **Text** (el id propio que genera la app).
- Reglas de API (en cada colección, pestaña **API Rules**), para que cada quien solo vea lo suyo:
  - List/View: `user.id = @request.auth.id`
  - Create: `@request.auth.id != "" && user = @request.auth.id`
  - Update/Delete: `user.id = @request.auth.id`

| Colección | Campos (además de user, aid) |
|---|---|
| `settings`  | `data` (JSON) — un registro por usuario |
| `clients`   | name, sur, nif, phone (Text); price, irpf (Number); type, igicReg (Text); amigo (Bool); notes (Text) |
| `sessions`  | clientAid (Text); start (Text); price (Number); st, notes, inv (Text); rem (Bool); noBill (Bool); reminderSentAt (Text); confirmStatus (Text); confirmAt (Text) |
| `invoices`  | clientAid, num, date, due, concept (Text); base, igic, irpf, total (Number); st, reg (Text); sent (Bool) |
| `payments`  | invAid (Text); date (Text); amount (Number); method (Text) |
| `expenses`  | prov (Text); date (Text); total, igic (Number); cat, ded (Text); doc (Bool) |

## 4) Cuentas de profesional
Tu hermano y tú os **registráis con email + contraseña** desde la propia app
Sesiona (Ajustes → Sincronización → Cuenta), o desde el panel de PocketBase
(colección users → New record).

## 5) Conectar la app web
En Sesiona → **Ajustes → Sincronización en la nube**:
- Pega la **URL** `https://agenda.tudominio.com`.
- Pulsa **Cuenta / Iniciar sesión** y entra con tu email/contraseña.
- A partir de ahí, tus datos se suben y se sincronizan. Sin iniciar sesión, la
  app sigue funcionando en local como hasta ahora (offline-first).

## 6) Bot de WhatsApp (mismo VPS)
En `bot/.env` (ver `bot/README.md`):
```
PB_URL=https://agenda.tudominio.com
PB_ADMIN_EMAIL=...            # admin de PocketBase
PB_ADMIN_PASSWORD=...
SESIONA_USER_ID=...           # id del registro del profesional en la colección users
TZ=Atlantic/Canary
REMIND_HOURS=24
```
El **SESIONA_USER_ID** lo ves en el panel: colección **users** → tu registro → campo `id`.
El bot enviará el recordatorio 24 h antes, leerá el SÍ/NO y actualizará la cita.

## Seguridad / RGPD
- `pb_data` contiene datos personales (NIF, teléfonos). Backups y acceso restringido al VPS.
- Contraseña de admin fuerte; mantén PocketBase actualizado.
- Las reglas de API garantizan que cada usuario solo accede a sus datos; el bot
  usa el admin (acceso total) solo en el servidor.
