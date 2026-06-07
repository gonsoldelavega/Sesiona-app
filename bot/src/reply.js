import { db } from './supabase.js';
import { last9, fmtDate, fmtTime } from './format.js';
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
  const { data: clients } = await db.from('sesiona_clients').select('*');
  const client = (clients || []).find((c) => last9(c.phone) === key);
  if (!client) return; // número desconocido: ignorar
  const nowIso = new Date().toISOString();
  const { data: sess } = await db.from('sesiona_sessions')
    .select('*')
    .eq('client_id', client.id)
    .eq('confirm_status', 'pending')
    .gt('start_at', nowIso)
    .order('start_at', { ascending: true })
    .limit(1);
  const s = sess && sess[0];
  if (!s) return; // nada pendiente de confirmar
  const intent = parseIntent(text);
  const d = new Date(s.start_at);
  const stamp = new Date().toISOString();
  if (intent === 'yes') {
    await db.from('sesiona_sessions').update({ confirm_status: 'confirmed', confirm_at: stamp, updated_at: stamp }).eq('id', s.id);
    await send(client.phone, M.thanksConfirm(client.name || '', fmtDate(d), fmtTime(d)));
    console.log(`[reply] ${client.name} CONFIRMA cita ${s.id}`);
  } else if (intent === 'no') {
    await db.from('sesiona_sessions').update({ confirm_status: 'cancelled', st: 'cancelada', confirm_at: stamp, updated_at: stamp }).eq('id', s.id);
    await send(client.phone, M.thanksCancel(client.name || ''));
    console.log(`[reply] ${client.name} CANCELA cita ${s.id}`);
  } else {
    await send(client.phone, M.askAgain());
  }
}
