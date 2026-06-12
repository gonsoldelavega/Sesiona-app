import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import { config } from './config.js';
import { handleReply } from './reply.js';

const logger = pino({ level: 'warn' });

function jidFor(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  const full = d.length <= 9 ? config.countryPrefix + d : d;
  return full + '@s.whatsapp.net';
}
function textOf(m) {
  const msg = m.message || {};
  return msg.conversation
    || msg.extendedTextMessage?.text
    || msg.imageMessage?.caption
    || msg.buttonsResponseMessage?.selectedDisplayText
    || msg.listResponseMessage?.title
    || '';
}

export async function startWhatsapp(onReady) {
  const { state, saveCreds } = await useMultiFileAuthState(config.authDir);
  const { version } = await fetchLatestBaileysVersion();
  const sock = makeWASocket({ version, auth: state, logger, browser: ['Sesiona', 'Chrome', '1.0'] });

  async function send(phone, text) { await sock.sendMessage(jidFor(phone), { text }); }

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (u) => {
    const { connection, lastDisconnect, qr } = u;
    if (qr) {
      console.log('\nEscanea este QR con WhatsApp (Ajustes -> Dispositivos vinculados -> Vincular un dispositivo):\n');
      qrcode.generate(qr, { small: true });
    }
    if (connection === 'open') {
      console.log('✅ Bot conectado a WhatsApp.');
      if (onReady) onReady(send);
    }
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      if (loggedOut) {
        console.log('Sesión cerrada. Borra la carpeta de auth y reinicia para volver a escanear el QR.');
      } else {
        console.log('Conexión cerrada, reconectando…');
        startWhatsapp(onReady);
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const m of messages) {
      if (!m.message || m.key.fromMe) continue;
      const jid = m.key.remoteJid || '';
      if (jid.endsWith('@g.us') || jid === 'status@broadcast') continue;
      const phone = jid.split('@')[0];
      const text = textOf(m);
      try { await handleReply(phone, text, send); }
      catch (e) { console.error('[whatsapp] error procesando respuesta:', e.message); }
    }
  });

  return sock;
}
