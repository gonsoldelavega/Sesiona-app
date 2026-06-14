import { pb, ensureAuth } from './pocketbase.js';
import { config } from './config.js';
import { fmtDate, fmtTime, toLocalMinuteString } from './format.js';
import * as M from './messages.js';

export async function sendDueReminders(send) {
  await ensureAuth();
  const now = new Date();
  const horizon = new Date(now.getTime() + config.remindHours * 3600 * 1000);
  // 'start' se guarda como texto 'YYYY-MM-DDTHH:mm' en hora local (config.tz).
  // Comparamos como cadenas usando el mismo formato para que la comparación sea correcta.
  const nowStr = toLocalMinuteString(now);
  const horizonStr = toLocalMinuteString(horizon);

  let sessions;
  try {
    sessions = await pb.collection('sessions').getFullList({
      filter: pb.filter(
        'user = {:u} && st = "programada" && (reminderSentAt = "" || reminderSentAt = null) && start > {:now} && start <= {:horizon}',
        { u: config.userId, now: nowStr, horizon: horizonStr }
      ),
    });
  } catch (e) {
    if (e?.status === 401) {
      try {
        await ensureAuth();
        sessions = await pb.collection('sessions').getFullList({
          filter: pb.filter(
            'user = {:u} && st = "programada" && (reminderSentAt = "" || reminderSentAt = null) && start > {:now} && start <= {:horizon}',
            { u: config.userId, now: nowStr, horizon: horizonStr }
          ),
        });
      } catch (e2) {
        console.error('[reminders] error consultando sesiones:', e2.message);
        return;
      }
    } else {
      console.error('[reminders] error consultando sesiones:', e.message);
      return;
    }
  }

  if (!sessions || !sessions.length) return;

  for (const s of sessions) {
    try {
      if (!s.clientAid) continue;
      let client;
      try {
        client = await pb.collection('clients').getFirstListItem(
          pb.filter('user = {:u} && aid = {:a}', { u: config.userId, a: s.clientAid })
        );
      } catch (e) {
        if (e?.status === 404) {
          console.warn(`[reminders] cliente no encontrado para sesión ${s.id} (clientAid=${s.clientAid})`);
          continue;
        }
        throw e;
      }
      if (!client || !client.phone) continue;

      const d = new Date(s.start);
      await send(client.phone, M.reminder(client.name || '', fmtDate(d), fmtTime(d)));
      const stamp = new Date().toISOString();
      await pb.collection('sessions').update(s.id, {
        reminderSentAt: stamp,
        rem: true,
        confirmStatus: 'pending',
      });
      console.log(`[reminders] enviado a ${client.name} (${client.phone}) cita ${s.start}`);
    } catch (e) {
      console.error('[reminders] error enviando:', e.message);
    }
  }
}
