# Sesiona WhatsApp Bot

Bot de WhatsApp (basado en [Baileys](https://github.com/WhiskeySockets/Baileys)) que envía recordatorios de citas y gestiona las confirmaciones de los clientes de Sesiona, todo sobre Supabase.

## 1. Qué hace

- Cada cierto tiempo (`POLL_CRON`) revisa en Supabase las citas con estado `programada` cuya hora de inicio está dentro de las próximas `REMIND_HOURS` horas (24h por defecto) y a las que aún no se les ha enviado recordatorio.
- A esas citas les envía por WhatsApp un mensaje recordatorio pidiendo confirmación, y marca la cita como `confirm_status = pending` y `reminder_sent_at` con la fecha de envío.
- Cuando el cliente responde desde ese número de teléfono, el bot interpreta el texto:
  - Si entiende **SÍ** (confirmación, "vale", "ahí estaré", "👍", etc.), marca la cita como `confirmed` y responde con un mensaje de **agradecimiento y confirmación**.
  - Si entiende **NO** (cancelación, "no puedo", "❌", etc.), marca la cita como `cancelled` (y la sesión como `cancelada`) y responde con un mensaje de **agradecimiento por avisar e invitación a buscar una nueva fecha**.
  - Si no entiende la respuesta, pide que conteste de nuevo con SÍ o NO.
- Todo el estado se guarda en las tablas `sesiona_clients` y `sesiona_sessions` de Supabase, para que la app web pueda reflejarlo.

## 2. Requisitos

- **Node.js 20 o superior**.
- Una clave **`service_role`** del proyecto de Supabase (es secreta: nunca debe ir al navegador ni a git).
- Un **número de WhatsApp** disponible para vincular como dispositivo del bot (ver aviso al final).

## 3. Instalación local

1. Copia el archivo de ejemplo de variables de entorno:
   ```bash
   cp .env.example .env
   ```
2. Rellena `SUPABASE_SERVICE_ROLE_KEY` en `.env`. La encuentras en el panel de Supabase: **Project Settings → API → Project API keys → `service_role`**.
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

## 4. Despliegue en VPS

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

## 5. Probar el bot

Inserta un cliente de prueba (por ejemplo, tu hermano) y una cita aproximadamente 24h en el futuro directamente con SQL en el editor SQL de Supabase:

```sql
insert into sesiona_clients (id,name,phone,price) values ('test1','Hermano','34XXXXXXXXX',60);
insert into sesiona_sessions (id,client_id,start_at,price,st) values ('s_test1','test1', now() + interval '23 hours', 60, 'programada');
```

(sustituye `34XXXXXXXXX` por el número real con prefijo de país).

Como la cita está dentro de las próximas 24 horas (`REMIND_HOURS=24` por defecto), al arrancar el bot —o como muy tarde en el siguiente "tick" del temporizador (`POLL_CRON`, cada 5 minutos por defecto)— enviará el recordatorio a ese número de WhatsApp.

Si quieres forzar el envío inmediato, puedes:
- Subir temporalmente `REMIND_HOURS` a un valor más alto, o
- Programar la cita más cerca en el tiempo (p. ej. `now() + interval '5 minutes'`).

Cuando respondas **SÍ** o **NO** desde ese mismo teléfono, el bot:
1. Actualiza la fila correspondiente en `sesiona_sessions` (`confirm_status`, `confirm_at`, y `st` si se cancela).
2. Te envía automáticamente el mensaje de agradecimiento (confirmación) o el de agradecimiento + invitación a reprogramar (cancelación).

## 6. Aviso importante

Este bot usa **Baileys**, una librería **NO oficial** que se conecta a WhatsApp emulando un cliente web. Esto conlleva el **riesgo de que WhatsApp bloquee o restrinja el número** vinculado, especialmente con volúmenes altos de mensajes o patrones poco habituales.

Recomendaciones:
- Úsalo con **volumen bajo** de mensajes.
- Preferiblemente, vincula un **número dedicado** (no el número personal o principal del negocio) para minimizar el impacto de un posible bloqueo.
