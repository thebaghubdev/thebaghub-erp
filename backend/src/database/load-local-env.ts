import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Load backend/.env for the TypeORM CLI. No-op when DATABASE_URL is already set (Heroku). */
export function loadLocalEnv(): void {
  if (process.env.DATABASE_URL?.trim()) {
    return;
  }
  const envPath = resolve(__dirname, '../../.env');
  if (!existsSync(envPath)) {
    return;
  }
  for (const raw of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const eq = line.indexOf('=');
    if (eq < 1) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }
    process.env[key] = line.slice(eq + 1);
  }
}
