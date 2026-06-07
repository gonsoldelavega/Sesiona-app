import cron from 'node-cron';
import { config } from './config.js';
import { startWhatsapp } from './whatsapp.js';
import { sendDueReminders } from './reminders.js';

console.log('Iniciando Sesiona WhatsApp bot…');

let cronStarted = false;
let sendRef = null;

startWhatsapp((send) => {
  sendRef = send;
  sendDueReminders(send).catch((e) => console.error(e));
  if (!cronStarted) {
    cronStarted = true;
    cron.schedule(config.pollCron, () => {
      if (sendRef) sendDueReminders(sendRef).catch((e) => console.error(e));
    }, { timezone: config.tz });
    console.log(`Temporizador activo (${config.pollCron}, TZ ${config.tz}, recordatorio ${config.remindHours}h antes).`);
  }
}).catch((e) => { console.error('Fallo al iniciar:', e); process.exit(1); });
