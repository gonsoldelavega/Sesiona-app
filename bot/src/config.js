export const config = {
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  tz: process.env.TZ || 'Atlantic/Canary',
  remindHours: Number(process.env.REMIND_HOURS || 24),
  pollCron: process.env.POLL_CRON || '*/5 * * * *',
  countryPrefix: process.env.COUNTRY_PREFIX || '34',
  authDir: process.env.AUTH_DIR || './auth',
};
if (!config.supabaseUrl || !config.supabaseKey) {
  console.error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno.');
  process.exit(1);
}
