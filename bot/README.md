# Sesiona WhatsApp Bot

Bot de WhatsApp (basado en [Baileys](https://github.com/WhiskeySockets/Baileys)) que envía recordatorios de citas y gestiona las confirmaciones de los clientes de Sesiona, todo sobre **PocketBase** (autoalojado).

## 1. Qué hace

- Cada cierto tiempo (`POLL_CRON`) revisa en PocketBase las sesiones (`sessions`) del profesional configurado (`SESIONA_USER_ID`) con estado `programada` cuya hora de inicio (`start`) está dentro de las próximas `REMIND_HOURS` horas (24h por defecto) y a las que aún no se les ha enviado recordatorio (`reminderSentAt` vacío).
- A esas citas les envía por WhatsApp un mensaje recordatorio pidiendo confirmación, y marca la sesión como `confirmStatus = "pending"`, `rem = true` y `reminderSentAt` con la fecha/hora de envío.
- Cuando el cliente responde desde ese número de teléfono, el bot interpreta el texto:
  - Si entiende **SÍ** (confirmación, "vale", "ahí estaré", "👍", etc.), marca la sesión como `confirmStatus = "confirmed"` (con `confirmAt`) y responde con un mensaje de **agradecimiento y confirmación**.
  - Si entiende **NO** (cancelación, "no puedo", "❌", etc.), marca la sesión como `confirmStatus = "cancelled"` y `st = "cancelada"` (con `confirmAt`), y responde con un mensaje de **agradecimiento por avisar e invitación a buscar una nueva fecha**.
  - Si no entiende la respuesta, pide que conteste de nuevo con SÍ o NO.
- Todo el estado se guarda en las colecciones `clients` y `sessions` de PocketBase, para que la app web pueda reflejarlo.

## 2. Requisitos

- **Node.js 20 o superior**.
- Una instancia de **PocketBase autoalojada** (en tu VPS), con las colecciones de Sesiona ya creadas (ver [`docs/etapa2-nube-setup.md`](../docs/etapa2-nube-setup.md) en la raíz del proyecto).
- Credenciales de un **superusuario/admin** de PocketBase (solo para el bot; nunca deben ir al navegador ni a git).
- El **id del registro** del profesional en la colección `users` de PocketBase (el bot gestiona la agenda de ESE usuario).
- Un **número de WhatsApp** disponible para vincular como dispositivo del bot (ver aviso al final).

## 3. Variables de entorno

Copia `.env.example` a `.env` y rellena:

| Variable | Descripción |
| --- | --- |
| `PB_URL` | URL de tu instancia de PocketBase (p. ej. `http://127.0.0.1:8090` o `https://agenda.tudominio.com`). |
| `PB_ADMIN_EMAIL` | Email del superusuario/admin de PocketBase. |
| `PB_ADMIN_PASSWORD` | Contraseña del superusuario/admin de PocketBase. |
| `SESIONA_USER_ID` | Id del registro del profesional en la colección `users` cuya agenda gestiona el bot. |
| `TZ` | Zona horaria para formatear fechas y para el temporizador (p. ej. `Atlantic/Canary`). |
| `REMIND_HOURS` | Horas de antelación con las que se envía el recordatorio (24 por defecto). |
| `POLL_CRON` | Frecuencia (cron) con la que se revisan citas pendientes de recordatorio. |
| `COUNTRY_PREFIX` | Prefijo de país por defecto si el teléfono del cliente tiene 9 dígitos. |
| `AUTH_DIR` | Carpeta donde se guarda la sesión de WhatsApp vinculada (debe persistir entre reinicios). |

## 4. Instalación local

1. Copia el archivo de ejemplo de variables de entorno:
   ```bash
   cp .env.example .env
   ```
2. Rellena `PB_URL`, `PB_ADMIN_EMAIL`, `PB_ADMIN_PASSWORD` y `SESIONA_USER_ID` en `.env`.
3. Instala las dependencias:
   ```bash
   npm install
   ```
4. Arranca el bot en modo desarrollo (carga `.env` automáticamente):
   ```bash
   npm run dev
   ```
5. Aparecerá un **código QR en la terminal**. Escanéalo desde el WhatsApp del número que quieras usar: **Ajustes → Dispositivos vinculados → Vincular un dispositivo**.

La carpeta `auth/` guarda las credenciales de la sesión de WhatsApp vinculada. **No la borres** entre reinicios o tendrás que volver a escanear el QR; ya está incluida en `.gitignore` para no subirla al repositorio.

## 5. Crear las colecciones en PocketBase

El bot necesita que existan las colecciones `clients` y `sessions` (además de la colección de autenticación `users`), con relación `user` (-> `users`) y el campo `aid` (id propio de la app). Sigue la guía completa en [`docs/etapa2-nube-setup.md`](../docs/etapa2-nube-setup.md) para instalar PocketBase en tu VPS, exponerlo con TLS y crear/importar el esquema de colecciones.

Resumen de los campos que usa el bot:

- `clients`: `user`, `aid`, `name`, `sur`, `nif`, `phone`, `price`, `irpf`, `type`, `igicReg`, `amigo` (bool), `notes`.
- `sessions`: `user`, `aid`, `clientAid` (text), `start` (text `YYYY-MM-DDTHH:mm`), `price`, `st`, `notes`, `inv`, `rem` (bool), `noBill` (bool), `reminderSentAt` (text ISO), `confirmStatus` (text: `none`|`pending`|`confirmed`|`cancelled`), `confirmAt` (text ISO).

## 6. Despliegue en VPS

### Opción A: Docker

```bash
docker build -t sesiona-bot .
docker run -d --restart=always --name sesiona-bot \
  --env-file .env \
  -v $PWD/auth:/app/auth \
  sesiona-bot
```

- El volumen `-v $PWD/auth:/app/auth` es importante: hace que la sesión de WhatsApp **persista** aunque el contenedor se reinicie o se actualice la imagen.
- La primera vez (o si hay que volver a vincular), el **código QR aparece en los logs**:
  ```bash
  docker logs -f sesiona-bot
  ```
- Si PocketBase corre en el mismo VPS escuchando en `127.0.0.1`, asegúrate de que `PB_URL` sea accesible desde el contenedor (por ejemplo usando `http://host.docker.internal:8090` o la red de Docker correspondiente, o exponiendo PocketBase en la red interna del host con `--network host`).

### Opción B: pm2

```bash
pm2 start src/index.js --name sesiona-bot --interpreter node --interpreter-args "--env-file=.env"
```

(o exporta las variables de entorno en el shell antes de arrancar y usa simplemente `pm2 start src/index.js --name sesiona-bot`).

Para que pm2 arranque el bot automáticamente al reiniciar el servidor:

```bash
pm2 save
pm2 startup
```

## 7. Probar el bot

Desde el **panel de administración de PocketBase** (`PB_URL/_/`), con el usuario admin:

1. En la colección `clients`, crea un registro de prueba con:
   - `user`: el id del profesional (el mismo que `SESIONA_USER_ID`).
   - `aid`: un identificador único, p. ej. `test1`.
   - `name`: `Hermano` (o el nombre que quieras).
   - `phone`: tu número real con prefijo de país, p. ej. `34XXXXXXXXX`.
   - `price`: `60`.
2. En la colección `sessions`, crea un registro de prueba con:
   - `user`: el mismo id del profesional.
   - `aid`: un identificador único, p. ej. `s_test1`.
   - `clientAid`: `test1` (debe coincidir con el `aid` del cliente anterior).
   - `start`: una fecha/hora ~23 horas en el futuro, en formato `YYYY-MM-DDTHH:mm` (hora local según `TZ`).
   - `price`: `60`.
   - `st`: `programada`.
   - deja `reminderSentAt` y `confirmStatus` vacíos (o `confirmStatus = "none"`).

Como la cita está dentro de las próximas 24 horas (`REMIND_HOURS=24` por defecto), al arrancar el bot —o como muy tarde en el siguiente "tick" del temporizador (`POLL_CRON`, cada 5 minutos por defecto)— enviará el recordatorio a ese número de WhatsApp.

Si quieres forzar el envío inmediato, puedes:
- Subir temporalmente `REMIND_HOURS` a un valor más alto, o
- Programar la cita más cerca en el tiempo (p. ej. dentro de 5-10 minutos).

Cuando respondas **SÍ** o **NO** desde ese mismo teléfono, el bot:
1. Actualiza el registro correspondiente en `sessions` (`confirmStatus`, `confirmAt`, y `st` si se cancela).
2. Te envía automáticamente el mensaje de agradecimiento (confirmación) o el de agradecimiento + invitación a reprogramar (cancelación).

## 8. Aviso importante

Este bot usa **Baileys**, una librería **NO oficial** que se conecta a WhatsApp emulando un cliente web. Esto conlleva el **riesgo de que WhatsApp bloquee o restrinja el número** vinculado, especialmente con volúmenes altos de mensajes o patrones poco habituales.

Recomendaciones:
- Úsalo con **volumen bajo** de mensajes.
- Preferiblemente, vincula un **número dedicado** (no el número personal o principal del negocio) para minimizar el impacto de un posible bloqueo.
