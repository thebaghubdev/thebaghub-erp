import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import type { Request } from 'express';
import querystring from 'querystring';
import { Repository } from 'typeorm';
import { ShopifyShopSession } from './entities/shopify-shop-session.entity';
import { normalizeShopDomain } from './normalize-shop-domain';

const STATE_TTL_SEC = 600;

/** Must match JwtModule default in auth.module.ts when JWT_SECRET is unset (development only). */
const JWT_DEV_FALLBACK = 'dev-insecure-change-me';

/** Parse OAuth redirect query using Node querystring rules (+ → space), avoiding Express quirks vs Shopify HMAC. */
function parseOAuthFlatQuery(originalUrl: string): Record<string, string> {
  const idx = originalUrl.indexOf('?');
  const qsPart =
    idx >= 0 ? (originalUrl.slice(idx + 1).split('#')[0] ?? '') : '';
  const parsed = querystring.parse(qsPart);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (typeof v === 'string') {
      out[k] = v;
      continue;
    }
    if (Array.isArray(v)) {
      const last = v[v.length - 1];
      if (typeof last === 'string') out[k] = last;
    }
  }
  return out;
}

function flattenExpressQuery(q: Request['query']): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(q)) {
    if (typeof v === 'string') out[k] = v;
    else if (Array.isArray(v) && typeof v[0] === 'string') out[k] = v[0];
  }
  return out;
}

/** Shopify OAuth authorize/install URL builder + callback handling (Partner app flow). */
@Injectable()
export class ShopifyOAuthService {
  private readonly logger = new Logger(ShopifyOAuthService.name);

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(ShopifyShopSession)
    private readonly sessions: Repository<ShopifyShopSession>,
  ) {}

  /** Signed OAuth state for CSRF protection (same secret family as JWT_SECRET). */
  private encodeState(): string {
    const secret = this.getOAuthStateSecret();
    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + STATE_TTL_SEC;
    const nonce = randomBytes(16).toString('hex');
    const payload = `${iat}.${exp}.${nonce}`;
    const sig = createHmac('sha256', secret).update(payload).digest('hex');
    return Buffer.from(`${payload}.${sig}`, 'utf8').toString('base64url');
  }

  private verifyState(state: string): boolean {
    const secret = this.getOAuthStateSecret();
    try {
      const raw = Buffer.from(state, 'base64url').toString('utf8');
      const parts = raw.split('.');
      if (parts.length !== 4) return false;
      const iatStr = parts[0];
      const expStr = parts[1];
      const nonce = parts[2];
      const sig = parts[3];
      const payload = `${iatStr}.${expStr}.${nonce}`;
      const expected = createHmac('sha256', secret)
        .update(payload)
        .digest('hex');
      const a = Buffer.from(sig, 'hex');
      const b = Buffer.from(expected, 'hex');
      if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
      const exp = Number(expStr);
      if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000))
        return false;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Uses JWT_SECRET when set; otherwise the same development default as JwtModule (non-production only).
   */
  private getOAuthStateSecret(): string {
    const trimmed = this.config.get<string>('JWT_SECRET')?.trim();
    if (trimmed) return trimmed;

    if (this.config.get<string>('NODE_ENV', 'development') === 'production') {
      throw new HttpException(
        'JWT_SECRET must be set in production for Shopify OAuth.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    return JWT_DEV_FALLBACK;
  }

  /**
   * Shopify validates OAuth callbacks using HMAC-SHA256(hex) over sorted query params (excluding `hmac`).
   * @see https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/authorization-code-grant
   */
  verifyOAuthHmac(query: Record<string, string>): boolean {
    const skip = this.config
      .get<string>('SHOPIFY_OAUTH_INSECURE_SKIP_HMAC_VERIFY')
      ?.trim()
      .toLowerCase();
    if (skip === 'true' || skip === '1') {
      this.logger.warn(
        'Shopify OAuth HMAC verification skipped (SHOPIFY_OAUTH_INSECURE_SKIP_HMAC_VERIFY). Remove this in production.',
      );
      return true;
    }

    const hmac = query.hmac;
    const secret = this.config.get<string>('SHOPIFY_CLIENT_SECRET')?.trim();
    if (!hmac || !secret) return false;

    const pairs = Object.entries(query).filter(([k]) => k !== 'hmac');
    pairs.sort(([a], [b]) => a.localeCompare(b, 'en'));
    const message = pairs.map(([k, v]) => `${k}=${v}`).join('&');
    const generated = createHmac('sha256', secret)
      .update(message)
      .digest('hex');

    try {
      const g = Buffer.from(generated, 'hex');
      const h = Buffer.from(hmac, 'hex');
      return g.length === h.length && timingSafeEqual(g, h);
    } catch {
      return false;
    }
  }

  buildAuthorizeUrl(): string {
    const clientId = this.config.get<string>('SHOPIFY_CLIENT_ID')?.trim();
    const domainRaw = this.config.get<string>('SHOPIFY_STORE_DOMAIN')?.trim();
    const redirectUri = this.config
      .get<string>('SHOPIFY_OAUTH_REDIRECT_URI')
      ?.trim();
    const scopesRaw =
      this.config.get<string>('SHOPIFY_OAUTH_SCOPES')?.trim() ??
      'read_products';

    if (!clientId || !domainRaw || !redirectUri) {
      throw new HttpException(
        'Shopify OAuth is not configured. Set SHOPIFY_CLIENT_ID, SHOPIFY_STORE_DOMAIN, and SHOPIFY_OAUTH_REDIRECT_URI.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const shopDomain = normalizeShopDomain(domainRaw);
    const scopes = scopesRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .join(',');
    const state = this.encodeState();

    const qs = new URLSearchParams({
      client_id: clientId,
      scope: scopes,
      redirect_uri: redirectUri,
      state,
    });

    return `https://${shopDomain}/admin/oauth/authorize?${qs.toString()}`;
  }

  /**
   * Browser redirect target after Shopify OAuth (success or error message for Settings UI).
   */
  async finishOAuthRedirect(req: Request): Promise<string> {
    const rawUrl = req.originalUrl ?? req.url ?? '';
    const fromRaw = parseOAuthFlatQuery(rawUrl);
    const query =
      Object.keys(fromRaw).length > 0
        ? fromRaw
        : flattenExpressQuery(req.query);

    const frontend = (
      this.config.get<string>('FRONTEND_ORIGIN') ?? 'http://localhost:5173'
    ).replace(/\/$/, '');
    const baseSettings = `${frontend}/portal/settings`;

    const fail = (msg: string) =>
      `${baseSettings}?shopify_oauth=error&shopify_oauth_msg=${encodeURIComponent(msg)}`;

    const oauthErr = query.error;
    if (oauthErr) {
      const desc = query.error_description ?? oauthErr;
      return fail(desc.length > 400 ? `${desc.slice(0, 400)}…` : desc);
    }

    const code = query.code;
    const shop = query.shop;
    const state = query.state;

    if (!code || !shop || !state) {
      return fail('Missing OAuth parameters from Shopify.');
    }

    if (!this.verifyOAuthHmac(query)) {
      this.logger.warn('Shopify OAuth callback failed HMAC verification');
      return fail('OAuth verification failed.');
    }

    if (!this.verifyState(state)) {
      this.logger.warn('Shopify OAuth callback had invalid or expired state');
      return fail('OAuth session expired. Try connecting again.');
    }

    const normalizedShop = normalizeShopDomain(shop);
    const configuredRaw = this.config
      .get<string>('SHOPIFY_STORE_DOMAIN')
      ?.trim();
    if (!configuredRaw) {
      return fail('SHOPIFY_STORE_DOMAIN is not configured on the server.');
    }
    const configuredShop = normalizeShopDomain(configuredRaw);
    if (normalizedShop !== configuredShop) {
      this.logger.warn(
        `Shopify OAuth shop mismatch: got "${normalizedShop}", expected "${configuredShop}"`,
      );
      return fail(
        'Store does not match SHOPIFY_STORE_DOMAIN configured on the server.',
      );
    }

    try {
      await this.exchangeAndPersist(normalizedShop, code);
    } catch (e: unknown) {
      const msg =
        e instanceof HttpException
          ? String(e.message ?? 'Token exchange failed.')
          : e instanceof Error
            ? e.message
            : 'Token exchange failed.';
      this.logger.error(`Shopify OAuth token exchange failed: ${msg}`);
      return fail(msg.length > 240 ? `${msg.slice(0, 240)}…` : msg);
    }

    return `${baseSettings}?shopify_oauth=success`;
  }

  /**
   * Exchange authorization code for offline Admin API token and persist per shop.
   */
  async exchangeAndPersist(shopDomain: string, code: string): Promise<void> {
    const clientId = this.config.get<string>('SHOPIFY_CLIENT_ID')?.trim();
    const clientSecret = this.config
      .get<string>('SHOPIFY_CLIENT_SECRET')
      ?.trim();

    if (!clientId || !clientSecret) {
      throw new HttpException(
        'SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET are required.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const tokenUrl = `https://${shopDomain}/admin/oauth/access_token`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25_000);

    try {
      const formBody = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      });

      const res = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: formBody.toString(),
        signal: controller.signal,
      });

      let body: unknown;
      try {
        body = await res.json();
      } catch {
        body = null;
      }

      if (!res.ok) {
        const snippet =
          typeof body === 'object' && body !== null
            ? JSON.stringify(body).slice(0, 400)
            : String(body).slice(0, 400);
        this.logger.error(
          `Shopify token exchange HTTP ${res.status} for "${shopDomain}": ${snippet}`,
        );
        throw new HttpException(
          'Shopify refused the OAuth token exchange.',
          HttpStatus.BAD_GATEWAY,
        );
      }

      if (!body || typeof body !== 'object') {
        throw new HttpException(
          'Invalid token response from Shopify.',
          HttpStatus.BAD_GATEWAY,
        );
      }

      const record = body as Record<string, unknown>;
      const accessToken = record.access_token;
      const scope = record.scope;

      if (typeof accessToken !== 'string' || !accessToken.trim()) {
        throw new HttpException(
          'Shopify token response missing access_token.',
          HttpStatus.BAD_GATEWAY,
        );
      }

      let row = await this.sessions.findOne({
        where: { shopDomain },
      });
      if (!row) {
        row = this.sessions.create({
          shopDomain,
          accessToken: accessToken.trim(),
          scope: typeof scope === 'string' ? scope : null,
        });
      } else {
        row.accessToken = accessToken.trim();
        row.scope = typeof scope === 'string' ? scope : row.scope;
      }
      await this.sessions.save(row);
      this.logger.log(
        `Shopify OAuth: stored Admin API token for "${shopDomain}".`,
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
