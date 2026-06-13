# AUDIT.md — Sesiona · Auditoría técnica (Fase 0)

> Fuente de verdad del proyecto. Actualizar aquí hallazgos y backlog; no re-escanear el repo.
> Fecha: 2026-06-12 · Rama de trabajo actual: `claude/app-professionalization-invoices-C4X2K` (PR #1 abierta hacia `main`).

## 1. Mapa del proyecto

**Stack:** web estática vanilla (HTML + JS ES5/6 + CSS, sin framework, sin bundler, sin package.json raíz). Deploy: Vercel (`vercel.json`). Datos: `localStorage` (clave `ccv9`). Bot aparte: Node 20 ESM + Baileys + Supabase (`bot/`, con su propio package.json). BD nube: Supabase compartido con otro negocio, tablas aisladas con prefijo `sesiona_`.

```
index.html                  Entrada. Carga scripts en orden (el orden IMPORTA: overrides)
assets/js/app.js            Núcleo (minificado en pocas líneas): estado S, render por vistas,
                            agenda, clientes, facturas, gastos, ajustes, WhatsApp wa.me
assets/js/advisor.js        Vista Gestoría (KPIs, modelos 420/130/425, CSV)
assets/js/branding.js       Defaults fiscales de Cristina (override de settings)
assets/js/invoice.js        Override de seeInvoice (plantilla pro) + sendInvoice con PDF
                            (html2pdf.js por CDN, Web Share API)
assets/js/photo-import.js   Foto agenda → OCR (Tesseract CDN / Google Vision opcional) → revisión
assets/css/{app,advisor,invoice}.css
bot/                        Bot WhatsApp (recordatorio 24h, SÍ/NO, Supabase). Dockerfile, README
supabase/functions/agenda-ocr/  Edge function opcional (Google Vision)
docs/                       ocr-setup.md, whatsapp-bot-setup.md
```

**Puntos de entrada:** `index.html` (app), `bot/src/index.js` (bot). Sin scripts de build; sin tests en repo (existe smoke test jsdom en /tmp de la sesión, **no versionado** → F7).

## 2. Hallazgos

### Seguridad
| ID | Hallazgo | Impacto | Dificultad | Riesgo del fix |
|----|----------|---------|------------|----------------|
| S1 | **XSS/HTML roto por datos de usuario**: `app.js` concatena `innerHTML` sin escapar (nombre de cliente con comillas/`<` rompe onclick o inyecta HTML). `invoice.js` y `photo-import.js` SÍ escapan; el núcleo no. App monousuario → riesgo real bajo, pero rompe UI con un apóstrofe (p. ej. "O'Brien") | Alto | Media | Bajo |
| S2 | Sin secretos en el repo ✅ (service_role solo en `.env` del VPS, ignorado). Falta **`.gitignore` raíz** (solo existe `bot/.gitignore`) — defensa extra contra subir `.env`/auth por error | Medio | Trivial | Nulo |
| S3 | Supabase **compartido con otro negocio** (tablas `app_*` de nandoplas). RLS activado sin políticas (solo service_role accede) ✅, pero conviene proyecto dedicado antes de la Etapa 2 (sync app↔nube con anon key) | Medio | Baja | Bajo |
| S4 | Bot Baileys = **no oficial** → riesgo de baneo del número (asumido por Nando; usará número dedicado). Documentado en README ✅ | Asumido | — | — |

### Bugs reales
| ID | Hallazgo | Impacto | Dificultad |
|----|----------|---------|------------|
| B1 | **Vista "Avisos" huérfana**: `alerts()` existe y el hero de agenda muestra el contador, pero ningún botón navega a ella (los chips antiguos se sustituyeron). El recordatorio manual por lote quedó inaccesible | Alto | Trivial |
| B2 | **Numeración de facturas frágil**: `num` global que no se reinicia por año; si se anula una factura el número se "pierde"; sin cero-padding configurable. Riesgo fiscal (huecos/duplicados) | Alto | Media |
| B3 | Filtro "Mes" de agenda = próximos **31 días**, no mes natural (etiqueta engañosa) | Bajo | Baja |
| B4 | `hourOptions` limita 07–22; una cita OCR a las 23:00 no se puede editar sin perder la hora | Bajo | Trivial |
| B5 | Filtro "Sin facturar" desapareció de la agenda al rediseñar chips (sigue en Gestoría como aviso, pero sin acceso directo a la lista) | Medio | Trivial |
| B6 | `seed()`/`Demo` puede mezclar datos de prueba con datos reales sin confirmación clara | Medio | Trivial |

### Deuda técnica / código muerto
| ID | Hallazgo | Impacto | Dificultad |
|----|----------|---------|------------|
| D1 | `app.js` **minificado e ilegible** (una línea). Toda edición es quirúrgica y arriesgada. Reformatear (pretty-print) sin cambiar lógica | Alto | Baja |
| D2 | Código muerto: `seeInvoice` y `sendInvoice` originales en `app.js` (siempre sobrescritos por `invoice.js`); `todaySessions/nextSessions` ya casi sin uso; `q()` duplicada con `qOf()` de advisor | Bajo | Baja |
| D3 | Dependencia de **CDNs en runtime** (tesseract, html2pdf): sin red ⇒ OCR y PDF caen. Considerar vendorizar a `assets/vendor/` | Medio | Baja |
| D4 | **Single point of failure: localStorage**. Sin copia automática: limpiar datos del navegador ⇒ pérdida total. Mitigable ya con recordatorio de export; solución real = Etapa 2 (sync Supabase) | **Crítico** | Alta (Etapa 2) |
| D5 | Sin tests versionados ni CI (el smoke test 29/29 vive fuera del repo) | Alto | Baja |

### UI/UX
| ID | Hallazgo | Impacto | Dificultad |
|----|----------|---------|------------|
| U1 | No es **PWA**: sin manifest ni service worker → no se instala como app en el móvil, sin icono, sin shell offline. Para el uso real de Cristina (móvil) es el salto de calidad más visible | Alto | Media |
| U2 | Accesibilidad básica: `<dialog>` sin `aria-label`, botones solo-icono sin texto accesible, contrastes de pills justos | Medio | Baja |
| U3 | Estados de carga/exito mejorables: guardado sin feedback (no hay toast); errores solo `alert()` | Medio | Media |
| U4 | Estados vacíos ✅ (`.empty` existe en todas las listas). Mobile-first ✅. Coherencia visual ✅ (paleta única) | OK | — |

### Arquitectura
- Patrón actual: estado global `S` + render completo por vista (string templates). **Adecuado** al tamaño; no migrar a framework (coste >> beneficio). 
- Separación correcta por capas de carga (core → overrides). Mantener la regla: módulos nuevos = archivo nuevo + override, no tocar core salvo necesidad.
- Escalabilidad de datos: el límite real es localStorage (~5 MB) y un solo dispositivo → **Etapa 2 (sync Supabase)** ya diseñada (esquema creado, bot listo) es la pieza que falta.

## 3. BACKLOG priorizado (sprints pequeños, 1 sprint = 1 cambio testeable)

> ESTADO (act. 2026-06-13): Sprints 1-7 ✅ fusionados a `main`/producción. Pendiente: Etapa 2 (nube + bot) — requiere credenciales/decisiones de Nando.
> - S1 ✅ higiene+tests+CI · S2 ✅ bugs visibles · S3 ✅ robustez (escapado/numeración/backup) · S4 ✅ agenda 3 días + demo · S5 ✅ onboarding configurable · S6 ✅ estética + factura · S7 ✅ PWA instalable.
> - Pretty-print de app.js (D1): pendiente/opcional (no bloqueante). Vendorizar CDNs (D3): pendiente/opcional.


**Sprint 1 — Higiene y red de seguridad** (sin tocar funcionalidad)
1. `.gitignore` raíz (S2) · 2. Versionar smoke test en `tests/` + script de ejecución (D5) · 3. Pretty-print de `app.js` sin cambios de lógica, validado con el smoke test (D1).

**Sprint 2 — Bugs visibles**
4. Recuperar acceso a "Avisos" y a "Sin facturar" (B1, B5) · 5. Confirmación al usar Demo (B6) · 6. Horas 00–23 en formulario (B4) · 7. Etiqueta/lógica del filtro Mes (B3).

**Sprint 3 — Robustez de datos**
8. Escapado HTML central en el core (S1) · 9. Numeración de facturas por año + aviso de huecos (B2) · 10. Recordatorio/automatización de export de copia de seguridad (mitiga D4).

**Sprint 4 — PWA** (U1): manifest + iconos + service worker de shell + vendorizar CDNs (D3).

**Sprint 5 — Etapa 2 nube**: sync app↔Supabase (resuelve D4 de verdad; requiere decidir S3: ¿proyecto Supabase dedicado?) + activación end-to-end del bot.

**Sprint 6 — Pulido UX** (U2, U3): toasts, aria, contrastes.

## 4. Notas operativas
- Hay **PR #1 abierta** con todo el trabajo previo (agenda nueva, facturas PDF, OCR foto, bot). Decidir si se fusiona antes de empezar sprints (recomendado: fusionar y abrir `mejora/<tema>` desde main).
- Prohibiciones vigentes: sin force-push, sin tocar BD destructivamente, sin merge a main sin aprobación.
- Pendientes de Nando: nº WhatsApp dedicado (más adelante), service_role en `.env` del VPS, decidir S3.
