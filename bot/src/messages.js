export function reminder(name, dateStr, timeStr) {
  return `Hola ${name}, te recordamos tu cita el ${dateStr} a las ${timeStr}.\n\n¿Podrás asistir? Responde *SÍ* para confirmar o *NO* si no puedes asistir. ¡Gracias!`;
}
export function thanksConfirm(name, dateStr, timeStr) {
  return `¡Genial${name ? ', ' + name : ''}! Tu cita del ${dateStr} a las ${timeStr} queda confirmada. ¡Te esperamos! 🙌`;
}
export function thanksCancel(name) {
  return `Gracias por avisar${name ? ', ' + name : ''}. Tu cita queda cancelada. Cuando quieras, escríbenos y buscamos una nueva fecha que te venga bien. 🌿`;
}
export function askAgain() {
  return `Perdona, no te he entendido 🙏. Responde *SÍ* para confirmar tu cita o *NO* si no podrás asistir.`;
}
