# Bot de WhatsApp para recordatorios de citas

Guía de alto nivel sobre el bot de WhatsApp de Sesiona: qué papel cumple, cómo encaja con la app web y qué hace falta para ponerlo en marcha. Para instrucciones detalladas de instalación y despliegue, ver [`bot/README.md`](../bot/README.md).

## Arquitectura

```
   App web (Sesiona)              Bot de WhatsApp (Baileys)
  ┌──────────────────┐           ┌──────────────────────────┐
  │  Agenda, clientes│           │ Recordatorios + lectura   │
  │  y citas         │           │ de respuestas SÍ/NO       │
  └────────┬─────────┘           └────────────┬─────────────┘
           │                                   │
           │            lee / escribe          │
           └──────────────►  Supabase  ◄───────┘
                       (sesiona_clients,
                        sesiona_sessions,
                        sesiona_settings)
```

- **Supabase** es el punto de encuentro: ambos sistemas leen y escriben en las mismas tablas (`sesiona_clients`, `sesiona_sessions`, `sesiona_settings`), de modo que el estado de las citas (programada, confirmada, cancelada…) queda sincronizado.
- El **bot** sólo necesita la URL del proyecto y la clave `service_role` de Supabase, y un número de WhatsApp vinculado, para funcionar de forma totalmente independiente de la app web.

## Importante: estado actual de la agenda (ETAPA 1 vs ETAPA 2)

- **Ahora mismo (Etapa 1):** la agenda de la app web vive en `localStorage` del navegador. El bot trabaja directamente contra Supabase, así que para que el bot pueda enviar recordatorios sobre las citas reales, **esas citas deben existir en las tablas de Supabase** (no sólo en el `localStorage` de la app).
- **Etapa 2 (próximo paso):** migrar la app web para que sincronice su agenda con Supabase (lectura y escritura), de forma que lo que el usuario gestiona en la app y lo que procesa el bot sean exactamente la misma fuente de datos, sin pasos manuales intermedios.

Hasta que se complete la Etapa 2, cualquier cita que deba recordarse por WhatsApp tiene que estar reflejada en `sesiona_sessions` (y su cliente en `sesiona_clients`) en Supabase.

## Variables de entorno del bot

Configuradas en `bot/.env` (a partir de `bot/.env.example`):

| Variable | Para qué sirve |
|---|---|
| `SUPABASE_URL` | URL del proyecto Supabase (`https://jpbvzpqyclowepfziihn.supabase.co`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave secreta `service_role` (Project Settings → API). Nunca debe exponerse en el navegador ni subirse a git |
| `TZ` | Zona horaria para formatear fechas/horas y para el temporizador (`Atlantic/Canary` por defecto) |
| `REMIND_HOURS` | Cuántas horas antes de la cita se envía el recordatorio (24 por defecto) |
| `POLL_CRON` | Frecuencia (formato cron) con la que se revisan citas pendientes de recordatorio |
| `COUNTRY_PREFIX` | Prefijo de país que se añade si el teléfono del cliente tiene 9 dígitos (`34` por defecto) |
| `AUTH_DIR` | Carpeta donde se guarda la sesión vinculada de WhatsApp (debe persistir entre reinicios) |

## Checklist de puesta en marcha

1. [ ] Confirmar que las citas a recordar existen en `sesiona_sessions` / `sesiona_clients` en Supabase (mientras la Etapa 2 no esté lista).
2. [ ] Copiar `bot/.env.example` a `bot/.env` y rellenar `SUPABASE_SERVICE_ROLE_KEY`.
3. [ ] Decidir el número de WhatsApp a vincular (preferiblemente uno dedicado, ver aviso de riesgo en `bot/README.md`).
4. [ ] Instalar dependencias (`npm install`) y arrancar en local (`npm run dev`) para escanear el código QR la primera vez.
5. [ ] Verificar que la carpeta `bot/auth/` se crea y persiste entre reinicios (no debe borrarse ni subirse a git).
6. [ ] Hacer una prueba end-to-end con un cliente y una cita de prueba (ver sección 5 de `bot/README.md`): comprobar que llega el recordatorio y que responder SÍ/NO actualiza la cita en Supabase y dispara la respuesta automática.
7. [ ] Desplegar en el VPS con Docker o pm2, asegurando que el volumen/carpeta `auth/` persiste y que el proceso se reinicia automáticamente (`--restart=always` o `pm2 startup`).
8. [ ] Monitorizar los primeros días: revisar logs (`docker logs -f sesiona-bot` o `pm2 logs sesiona-bot`) para detectar desconexiones o necesidad de re-vincular el QR.
