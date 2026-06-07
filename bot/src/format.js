import { config } from './config.js';
export function fmtDate(d) {
  return new Intl.DateTimeFormat('es-ES', { timeZone: config.tz, weekday: 'long', day: 'numeric', month: 'long' }).format(d);
}
export function fmtTime(d) {
  return new Intl.DateTimeFormat('es-ES', { timeZone: config.tz, hour: '2-digit', minute: '2-digit' }).format(d);
}
export function normalizePhone(p) { return String(p || '').replace(/\D/g, ''); }
export function last9(p) { return normalizePhone(p).slice(-9); }
