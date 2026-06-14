import { pb, ensureAuth } from './pocketbase.js';
import { config } from './config.js';
import { last9, fmtDate, fmtTime, toLocalMinuteString } from './format.js';
import * as M from './messages.js';

const NO_RE = /\b(no|nop|nope|cancelar?|anular?|imposible|no\s*puedo|no\s*podr|❌|🚫)\b/i;
const YES_RE = /\b(s[ií]|ok|oka|okay|vale|confirm|asist|voy|ah[ií]\s*estar|perfecto|genial|cuenta\s*conmigo|👍|✅|👌)\b/i;

export function parseIntent(text) {
  const t = String(text || '').trim().toLowerCase();
  if (!t) return 'unknown';
  if (NO_RE.test(t)) return 'no';   // comprobar NO primero ("no puedo" contiene patrones)
  if (YES_RE.test(t)) return 'yes';
  return 'unknown';
}

export async function handleReply(phone, text, send) {
  const key = last9(phone);
  if (key.length < 6) return;

  await ensureAuth();

  let clients;
  try {
    clients = await pb.collection('clients').getFullList({
      filter: pb.filter('user = {:u}', { u: config.userId }),
    });
  } catch (e) {
    if (e?.status === 401) {
      await ensureAuth();
      clients = await pb.collection('clients').getFullList({
        filter: pb.filter('user = {:u}', { u: config.userId }),
      });
    } else {
      console.error('[reply] error consultando clientes:', e.message);
      return;
    }
  }

  const client = (clients || []).find((c) => last9(c.phone) === key);
  if (!client) return; // número desconocido: ignorar

  const nowStr = toLocalMinuteString(new Date());
  let s;
  try {
    s = await pb.collection('sessions').getFirstListItem(
      pb.filter('user = {:u} && clientAid = {:a} && confirmStatus = "pending" && start > {:now}', {
        u: config.userId, a: client.aid, now: nowStr,
      }),
      { sort: '+start' }
    );
  } catch (e) {
    if (e?.status === 404) return; // nada pendiente de confirmar
    console.error('[reply] error consultando sesión pendiente:', e.message);
    return;
  }
  if (!s) return;

  const intent = parseIntent(text);
  const d = new Date(s.start);
  const stamp = new Date().toISOString();

  try {
    if (intent === 'yes') {
      await pb.collection('sessions').update(s.id, { confirmStatus: 'confirmed', confirmAt: stamp });
      await send(client.phone, M.thanksConfirm(client.name || '', fmtDate(d), fmtTime(d)));
      console.log(`[reply] ${client.name} CONFIRMA cita ${s.id}`);
    } else if (intent === 'no') {
      await pb.collection('sessions').update(s.id, { confirmStatus: 'cancelled', st: 'cancelada', confirmAt: stamp });
      await send(client.phone, M.thanksCancel(client.name || ''));
      console.log(`[reply] ${client.name} CANCELA cita ${s.id}`);
    } else {
      await send(client.phone, M.askAgain());
    }
  } catch (e) {
    console.error('[reply] error actualizando sesión:', e.message);
  }
}
