import { ConfigService } from '@nestjs/config';

export function frontendOrigin(config: ConfigService): string {
  return config
    .get<string>('FRONTEND_ORIGIN', 'http://localhost:5173')
    .replace(/\/$/, '');
}

/** Absolute staff-portal URL, e.g. `/portal/orders/:id`. */
export function portalPageUrl(config: ConfigService, path: string): string {
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${frontendOrigin(config)}${suffix}`;
}
