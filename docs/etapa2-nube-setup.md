# Etapa 2 — Nube (Supabase) + bot de WhatsApp · Puesta en marcha

Objetivo: que la agenda viva en la nube (con **cuentas** y datos privados por
usuario) para (a) no perder datos si se borra el navegador, (b) usar la app
desde varios dispositivos, y (c) que el **bot de WhatsApp** trabaje con la
agenda real.

Arquitectura: **app web** (login con Supabase Auth, sincroniza) ⇄ **Supabase**
(Postgres con RLS por usuario) ⇄ **bot** (service_role, filtra por usuario).

## Paso 1 — Crear el proyecto dedicado (lo haces tú; a mí me lo bloquea un permiso)
1. Entra en https://supabase.com → **New project**.
2. Organización: la tuya. Nombre: `sesiona`. Región: **eu-west-1** (o la más cercana). Plan **Free**.
3. Guarda la contraseña de base de datos que te pida.
4. Cuando esté "healthy" (~2 min), ve a **Project Settings → API** y copia:
   - **Project URL** (p.ej. `https://xxxx.supabase.co`)
   - **anon / publishable key** (pública; va en la app)
   - **service_role key** (SECRETA; solo en el VPS del bot — nunca en la web ni en git)

> Pásame el **Project URL** y la **anon key** para enchufar la app. La
> **service_role** guárdala tú para el `.env` del bot (no me la pegues en claro
> si no quieres; la pones tú en el VPS).

## Paso 2 — Esquema con seguridad por usuario
Aplico yo (vía migración) `supabase/migrations/0002_sesiona_cloud_auth.sql` en
ese proyecto: crea las tablas `sesiona_*` con `user_id` y **RLS** (cada
profesional solo ve sus datos). El bot, con service_role, las lee filtrando por
usuario.

## Paso 3 — Cuentas
- En **Authentication → Providers** deja activado **Email**. (Opcional: desactiva
  "Confirm email" para pruebas rápidas, o déjalo activado para producción.)
- Tu hermano y tú os registráis con email+contraseña desde la propia app.

## Paso 4 — App web
La app incorporará login y sincronización (opt-in): al iniciar sesión, sube tus
datos locales a la nube y los mantiene sincronizados. Sin iniciar sesión, sigue
funcionando en local como hasta ahora.

## Paso 5 — Bot (en tu VPS)
En `bot/.env`:
```
SUPABASE_URL=https://xxxx.supabase.co        # del proyecto dedicado
SUPABASE_SERVICE_ROLE_KEY=...                # service_role (secreta)
SESIONA_USER_ID=...                          # el id de usuario (uuid) cuya agenda gestiona el bot
TZ=Atlantic/Canary
REMIND_HOURS=24
```
El bot se actualizará para filtrar por `SESIONA_USER_ID` y usar las tablas con
`user_id`. Despliegue: ver `bot/README.md`.

## Seguridad / privacidad (importante)
- La **anon key** es pública pero por sí sola NO da acceso a datos: la RLS exige
  estar autenticado y solo deja ver lo propio.
- La **service_role** omite RLS: solo en el servidor del bot, nunca en el navegador.
- Datos personales de clientes (NIF, teléfono) viajan a la nube: el acceso queda
  restringido por cuenta. Aun así, declara y trata esos datos conforme a RGPD.
