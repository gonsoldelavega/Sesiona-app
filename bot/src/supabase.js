import { createClient } from '@supabase/supabase-js';
import { config } from './config.js';
export const db = createClient(config.supabaseUrl, config.supabaseKey, { auth: { persistSession: false } });
