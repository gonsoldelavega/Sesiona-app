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

## 4. Auditoría de testing E2E (2026-07-12 · rama `claude/app-testing-improvements-oe8zsd`)

Simulación completa con navegador real (Playwright + Chromium, TZ `Atlantic/Canary`, viewport móvil):
onboarding, clientes, agenda lista/calendario, facturación auto/manual, cobros, anulación, avisos,
gastos, gestoría, ajustes, demo, foto-agenda sin red, envío PDF sin red, persistencia y PWA.

### Bugs encontrados y CORREGIDOS en esta rama
| ID | Bug | Fix |
|----|-----|-----|
| T1 | **Fechas UTC en calendario**: `shiftCG/shiftCGfrom/addDays/today` usaban `toISOString()` (UTC). En Canarias en verano (UTC+1) el calendario arrancaba en *ayer* y cada ‹/› derivaba un día. También afectaba al fin del filtro "Mes" | Helper `ymd()` con fecha local; suite de tests ahora corre con `TZ=Atlantic/Canary` |
| T2 | La métrica **"Pendiente"** del panel contaba facturas **anuladas** | `metrics().pend` filtra `st!='anulada'` |
| T3 | El **nombre profesional nunca aparecía en la cabecera**: el script inline comprobaba `window.S`, que no existe (`let S` no cuelga de window) | `updateBrand()` en `render()`; script inline eliminado |
| T4 | Escapado HTML incompleto: selects de cliente (cita/factura), hero "Próxima cita", modal factura creada, inputs pref/wa de Ajustes | `esc()` aplicado |
| T5 | Aviso del formulario de cita prometía factura automática aunque el modo por defecto es **manual** | Texto dinámico según `autoBillOn()` |
| T6 | "Crear factura" facturaba a clientes **amigo** / citas *no facturar* sin aviso, con botón destacado | Confirmación previa + botón secundario |
| T7 | Citas fuera de la rejilla 8–21 (p. ej. 23:00) se pintaban en `top:100%` (invisibles) en el calendario | Clamp dentro de la rejilla |
| T8 | Facturas anuladas mostraban "pendiente X €" y ofrecían Cobrar/Anular/WhatsApp; `payForm` las listaba | Ocultas esas acciones; `payForm` filtra anuladas |
| T9 | **Gastos sin editar/borrar**: un error era permanente | `expenseForm(id)`, `saveExpense(id)`, `delExpense(id)` + fecha visible en la lista |
| T10 | Foto-agenda: la entrada manual solo era accesible si el OCR fallaba | Botón "Introducir citas a mano" en la pantalla 1 |
| T11 | Copia de seguridad con nombre legado `consulta-clara-canarias-v9.json`; `clearAll` no limpiaba la clave antigua `ccc` (los datos "resucitaban") | `sesiona-copia-<fecha>.json`; se limpia también `ccc` |
| — | Pretty-print de `app.js` (D1) aplicado con prettier, sin cambios de lógica | Commit propio |

Suite ampliada: 51 → **77 tests** (fechas locales, anuladas, escapado, confirmación amigo, gastos, calendario, copia, foto manual, aviso dinámico).

### Verificado OK en la simulación
Onboarding y wizard · facturación auto (IGIC 7% + IRPF, total exacto) y manual · numeración correlativa por año ·
plantilla profesional de factura · cobros parciales y sello Pagada/Parcial · WhatsApp (wa.me con mensaje y enlaces SÍ/NO) ·
fallback sin red de OCR y de PDF · exportación CSV/JSON · persistencia localStorage · SW + manifest (PWA) · demo `#demo` (3/3/3) y bloqueo de demo con datos.

### Mejoras propuestas → APLICADAS (2026-07-12, misma rama)
| ID | Mejora | Implementación |
|----|--------|----------------|
| M1 | **Importar copia de seguridad** | Botón "Importar copia" en Ajustes: valida el JSON, confirma con recuento (clientes/citas/facturas), sustituye datos y recarga. Verificado el ciclo completo exportar → vaciar → importar en navegador |
| M2 | **Borrar citas, clientes y cobros** | "Eliminar cita" en el formulario de edición (la factura asociada se conserva). "Eliminar cliente" bloqueado si tiene facturas (conservación fiscal); si no, borra también sus citas tras confirmar. "Registrar cobro" lista los cobros de la factura con "Borrar cobro" |
| M3 | **Actualización fiable de la PWA** | `sw.js`: cache `sesiona-v2`; JS/CSS propios pasan a network-first con fallback a cache → un deploy se ve en la siguiente carga (antes: dos cargas por stale-while-revalidate) y offline sigue funcionando |
| M4 | **Aviso IGIC "revisar"** | La factura muestra un aviso destacado ("emitida sin IGIC, confirmar con gestoría") cuando el régimen del cliente es `revisar`; también en el PDF |
| M5 | **Rejilla del calendario dinámica** | Si hay citas antes de las 08:00 o después de las 21:00 en los 3 días visibles, la rejilla se amplía (hasta 00–24) en vez de aplastar los bloques |
| M6 | **Vendorización CDNs (D3)** | `html2pdf` vendorizado en `assets/vendor/` (carga local primero, CDN de respaldo) → el PDF funciona 100 % offline. Tesseract no se vendoriza (worker+wasm+traineddata ≈ decenas de MB); en su lugar el SW cachea en runtime los CDN permitidos (`cdn.jsdelivr.net`, `unpkg.com`, `tessdata.projectnaptha.com`): tras el primer OCR con red, también funciona offline |

Suite: 77 → **99 tests**. Verificación E2E adicional en navegador (import/export con archivo real, borrados, PDF sin red, rejilla, aviso IGIC, SW v2): sin hallazgos.

### Ideas restantes (no bloqueantes)
- Archivar clientes (ocultar sin borrar) para históricos largos.
- Editar cobros in situ (hoy: borrar + volver a registrar).
- Aviso "nueva versión disponible" con botón de recarga (hoy el deploy llega en la siguiente carga; suficiente en la práctica).

## 5. Notas operativas
- Hay **PR #1 abierta** con todo el trabajo previo (agenda nueva, facturas PDF, OCR foto, bot). Decidir si se fusiona antes de empezar sprints (recomendado: fusionar y abrir `mejora/<tema>` desde main).
- Prohibiciones vigentes: sin force-push, sin tocar BD destructivamente, sin merge a main sin aprobación.
- Pendientes de Nando: nº WhatsApp dedicado (más adelante), service_role en `.env` del VPS, decidir S3.
