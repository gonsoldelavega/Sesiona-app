import { config } from './config.js';
export function fmtDate(d) {
  return new Intl.DateTimeFormat('es-ES', { timeZone: config.tz, weekday: 'long', day: 'numeric', month: 'long' }).format(d);
}
export function fmtTime(d) {
  return new Intl.DateTimeFormat('es-ES', { timeZone: config.tz, hour: '2-digit', minute: '2-digit' }).format(d);
}
export function normalizePhone(p) { return String(p || '').replace(/\D/g, ''); }
export function last9(p) { return normalizePhone(p).slice(-9); }

// Devuelve 'YYYY-MM-DDTHH:mm' en la zona horaria configurada (config.tz),
// para poder comparar como cadena con el campo "start" (texto, hora local).
export function toLocalMinuteString(d) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: config.tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}
