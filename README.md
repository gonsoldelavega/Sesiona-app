# Sesiona

Agenda, facturación, cobros y gestoría para consultas profesionales (orientada a Canarias · IGIC).
App web ligera (HTML + JS vanilla, sin framework), datos en el propio dispositivo (`localStorage`).
Pensada para móvil y desplegable como sitio estático (Vercel).

## Estructura

```
index.html              Punto de entrada, carga los assets locales
assets/
  css/
    app.css             Estilos base de la app
    advisor.css         Estilos de la sección Gestoría
    invoice.css         Plantilla profesional de factura + estilos de impresión/PDF
  js/
    app.js              Núcleo: agenda, clientes, facturas, gastos, ajustes
    advisor.js          Sección Gestoría (KPIs, modelos fiscales orientativos)
    branding.js         Datos fiscales por defecto del emisor
    invoice.js          Plantilla profesional de factura (override de seeInvoice)
    photo-import.js     Importar agenda desde una foto (OCR) con pantalla de revisión
supabase/
  functions/agenda-ocr/ Edge function opcional para lectura con Google Vision (alta precisión)
docs/
  ocr-setup.md          Cómo activar Google Vision (opcional)
```

El orden de carga de los scripts importa: `invoice.js` se carga después de `app.js`/`branding.js`
para sustituir la plantilla de factura, y `photo-import.js` expone `photoImport()`.

## Funcionalidades clave

- **Agenda** como pantalla principal: citas por día/próximas, recordatorios manuales por WhatsApp.
- **Importar agenda desde una foto** (botón ＋ → "Foto agenda"): se fotografía la agenda física,
  se leen las citas (OCR) y se revisan/corrigen antes de guardarlas. Gratis y local por defecto
  (Tesseract.js); opcionalmente más preciso con Google Vision (ver `docs/ocr-setup.md`).
- **Facturación automática salvo amigos**: al finalizar una cita se genera la factura, *excepto*
  para clientes marcados como **amigo / sin factura** o citas marcadas como *no facturar*. El
  comportamiento global se puede cambiar a *manual siempre* en Ajustes. El **envío** por WhatsApp
  es siempre manual.
- **Facturas profesionales**: plantilla cuidada lista para imprimir o guardar como PDF (A4),
  con emisor, cliente, desglose IGIC/IRPF, estado de cobro (PAGADA/pendiente) y pie legal.
- **Gestoría**: KPIs del periodo, estimación orientativa de modelos (420/130/425), incidencias
  accionables y exportación CSV/JSON.

## Desarrollo

Es estático: basta con servirlo. Por ejemplo:

```bash
python3 -m http.server 8080
# abrir http://localhost:8080
```

Para datos de demostración, abrir con `#demo` en la URL o usar el botón *Demo* en Ajustes.

## Despliegue

Sitio estático en Vercel (`vercel.json`). No requiere backend para funcionar; la edge function de
Supabase es opcional y solo para la lectura de fotos con Google Vision.
