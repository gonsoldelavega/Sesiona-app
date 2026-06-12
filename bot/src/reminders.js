import { db } from './supabase.js';
import { config } from './config.js';
import { fmtDate, fmtTime } from './format.js';
import * as M from './messages.js';

export async function sendDueReminders(send) {
  const now = new Date();
  const horizon = new Date(now.getTime() + config.remindHours * 3600 * 1000);
  const { data: sessions, error } = await db.from('sesiona_sessions')
    .select('*')
    .eq('st', 'programada')
    .is('reminder_sent_at', null)
    .gt('start_at', now.toISOString())
    .lte('start_at', horizon.toISOString());
  if (error) { console.error('[reminders] error consultando:', error.message); return; }
  if (!sessions || !sessions.length) return;
  const ids = [...new Set(sessions.map((s) => s.client_id).filter(Boolean))];
  const { data: clients } = await db.from('sesiona_clients').select('*').in('id', ids);
  const byId = Object.fromEntries((clients || []).map((c) => [c.id, c]));
  for (const s of sessions) {
    const c = byId[s.client_id];
    if (!c || !c.phone) continue;
    const d = new Date(s.start_at);
    try {
      await send(c.phone, M.reminder(c.name || '', fmtDate(d), fmtTime(d)));
      const stamp = new Date().toISOString();
      await db.from('sesiona_sessions').update({ reminder_sent_at: stamp, rem: true, confirm_status: 'pending', updated_at: stamp }).eq('id', s.id);
      console.log(`[reminders] enviado a ${c.name} (${c.phone}) cita ${d.toISOString()}`);
    } catch (e) { console.error('[reminders] error enviando:', e.message); }
  }
}
