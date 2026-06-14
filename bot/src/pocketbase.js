import PocketBase from 'pocketbase';
import { config } from './config.js';

export const pb = new PocketBase(config.pbUrl);

export async function ensureAuth() {
  if (pb.authStore.isValid) return;
  await pb.admins.authWithPassword(config.pbAdminEmail, config.pbAdminPassword);
}
