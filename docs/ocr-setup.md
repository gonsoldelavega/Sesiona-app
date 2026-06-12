# Configuración del módulo de importación de agenda por foto (OCR)

## ¿Cómo funciona?

La funcionalidad "Importar agenda desde foto" permite fotografiar una página de agenda física y detectar automáticamente las citas (hora y nombre del cliente) para añadirlas a la app. Siempre podrás revisar y corregir las citas antes de guardarlas.

---

## Opción A — Motor por defecto (gratuito, sin configuración)

**No requiere ninguna configuración adicional.** La app usa [Tesseract.js](https://github.com/naptha/tesseract.js), un motor de OCR que se ejecuta directamente en el navegador del usuario, sin enviar la imagen a ningún servidor externo.

- Funciona sin conexión a internet una vez cargado.
- El procesamiento puede tardar unos segundos en dispositivos lentos.
- Reconoce texto en español (idioma `spa`).
- La imagen nunca sale del dispositivo.

**Para usar esta opción:** simplemente pulsa el botón "📷 Importar desde foto" en la agenda. No hay nada que instalar ni configurar.

---

## Opción B — Google Cloud Vision (mayor precisión, configuración requerida)

Google Cloud Vision ofrece un OCR de mayor precisión, especialmente útil con letras a mano o agendas con poco contraste. Tiene una **capa gratuita de ~1 000 solicitudes/mes**.

### Paso 1 — Obtener una API key de Google Cloud Vision

1. Ve a [Google Cloud Console](https://console.cloud.google.com/).
2. Crea un proyecto (o usa uno existente).
3. Activa la API **Cloud Vision API** en "Biblioteca de APIs".
4. En "Credenciales", crea una **Clave de API** y cópiala.
5. (Opcional pero recomendado) Restringe la clave a la API de Vision para mayor seguridad.

### Paso 2 — Desplegar la Edge Function en Supabase

Desde la raíz del proyecto, con la [CLI de Supabase](https://supabase.com/docs/guides/cli) instalada y el proyecto vinculado:

```bash
supabase functions deploy agenda-ocr
```

### Paso 3 — Configurar el secreto con la API key

```bash
supabase secrets set GOOGLE_VISION_API_KEY=TU_API_KEY_AQUI
```

### Paso 4 — Obtener la URL de la Edge Function

La URL tendrá el formato:

```
https://<tu-proyecto>.supabase.co/functions/v1/agenda-ocr
```

Puedes consultarla en el panel de Supabase: **Edge Functions → agenda-ocr → URL**.

### Paso 5 — Configurar la URL en la app

1. Abre la app y ve a **Más → Ajustes**.
2. En la sección correspondiente (o directamente en la consola del navegador), asigna:

```js
S.set.visionEndpoint = 'https://<tu-proyecto>.supabase.co/functions/v1/agenda-ocr';
save();
```

A partir de ese momento, la app usará Google Vision automáticamente. Si la llamada falla (sin red, cuota agotada, etc.), cae con elegancia a Tesseract.js sin mostrar errores al usuario.

---

## Notas adicionales

- Las citas importadas se crean siempre en estado **programada** y nunca generan factura automática en el momento de la importación.
- El OCR no es perfecto: revisa siempre las citas en la pantalla de revisión antes de guardarlas.
- Si la imagen no produce ninguna cita detectable, puedes añadir filas manualmente en la misma pantalla de revisión.
