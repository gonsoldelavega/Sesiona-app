export const config = {
  pbUrl: process.env.PB_URL,
  pbAdminEmail: process.env.PB_ADMIN_EMAIL,
  pbAdminPassword: process.env.PB_ADMIN_PASSWORD,
  userId: process.env.SESIONA_USER_ID,
  tz: process.env.TZ || 'Atlantic/Canary',
  remindHours: Number(process.env.REMIND_HOURS || 24),
  pollCron: process.env.POLL_CRON || '*/5 * * * *',
  countryPrefix: process.env.COUNTRY_PREFIX || '34',
  authDir: process.env.AUTH_DIR || './auth',
};
if (!config.pbUrl || !config.pbAdminEmail || !config.pbAdminPassword || !config.userId) {
  console.error('Faltan PB_URL, PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD o SESIONA_USER_ID en el entorno.');
  process.exit(1);
}
