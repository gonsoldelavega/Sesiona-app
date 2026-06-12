/**
 * Edge Function: agenda-ocr
 * Supabase / Deno — recibe una imagen en base64 y devuelve el texto
 * reconocido por Google Cloud Vision (DOCUMENT_TEXT_DETECTION).
 *
 * Variables de entorno requeridas:
 *   GOOGLE_VISION_API_KEY  — clave de API de Google Cloud Vision
 *
 * Entrada (POST JSON):
 *   { image: "<base64 sin prefijo data:...>" }
 *
 * Salida (JSON):
 *   { text: "..." }          — en caso de éxito
 *   { error: "..." }         — en caso de error
 */

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request): Promise<Response> => {
  // Responder a preflight OPTIONS
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Método no permitido. Usa POST.' }),
      { status: 405, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  }

  // Leer API key de entorno
  const apiKey = Deno.env.get('GOOGLE_VISION_API_KEY');
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'GOOGLE_VISION_API_KEY no está configurada en el servidor.' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  }

  // Parsear body
  let body: { image?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Body JSON inválido.' }),
      { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  }

  const imageBase64 = body.image;
  if (!imageBase64 || typeof imageBase64 !== 'string') {
    return new Response(
      JSON.stringify({ error: 'Falta el campo "image" (base64) en el body.' }),
      { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  }

  // Llamar a Google Cloud Vision
  const visionUrl = `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`;
  const visionBody = {
    requests: [
      {
        image: { content: imageBase64 },
        features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
      },
    ],
  };

  let visionRes: Response;
  try {
    visionRes = await fetch(visionUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(visionBody),
    });
  } catch (fetchErr) {
    const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
    return new Response(
      JSON.stringify({ error: 'Error de red al llamar a Google Vision: ' + msg }),
      { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  }

  if (!visionRes.ok) {
    const errText = await visionRes.text().catch(() => '');
    return new Response(
      JSON.stringify({ error: `Google Vision respondió con estado ${visionRes.status}: ${errText}` }),
      { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  }

  let visionData: {
    responses?: Array<{
      fullTextAnnotation?: { text?: string };
      error?: { message?: string };
    }>;
  };
  try {
    visionData = await visionRes.json();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Respuesta de Google Vision no es JSON válido.' }),
      { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  }

  // Extraer texto
  const firstResponse = visionData.responses?.[0];
  if (firstResponse?.error?.message) {
    return new Response(
      JSON.stringify({ error: 'Google Vision devolvió un error: ' + firstResponse.error.message }),
      { status: 422, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  }

  const text = firstResponse?.fullTextAnnotation?.text ?? '';
  return new Response(
    JSON.stringify({ text }),
    { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
  );
});
