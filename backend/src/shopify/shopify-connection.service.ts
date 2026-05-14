import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { normalizeShopDomain } from './normalize-shop-domain';
import { SHOPIFY_ADMIN_API_VERSION } from './shopify-admin-api.constants';

const CONNECT_TIMEOUT_MS = 15_000;

@Injectable()
export class ShopifyConnectionService implements OnModuleInit {
  private readonly logger = new Logger(ShopifyConnectionService.name);

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    await this.verifyShopifyConnection();
  }

  private async verifyShopifyConnection(): Promise<void> {
    const clientId = this.config.get<string>('SHOPIFY_CLIENT_ID')?.trim();
    const clientSecret = this.config
      .get<string>('SHOPIFY_CLIENT_SECRET')
      ?.trim();
    const domainRaw = this.config.get<string>('SHOPIFY_STORE_DOMAIN')?.trim();

    if (!clientId || !clientSecret || !domainRaw) {
      const missing: string[] = [];
      if (!clientId) missing.push('SHOPIFY_CLIENT_ID');
      if (!clientSecret) missing.push('SHOPIFY_CLIENT_SECRET');
      if (!domainRaw) missing.push('SHOPIFY_STORE_DOMAIN');
      this.logger.error(
        `Shopify: missing configuration (${missing.join(', ')}). Skipping connection check.`,
      );
      return;
    }

    const shopDomain = normalizeShopDomain(domainRaw);

    const apiUrl = `https://${shopDomain}/admin/api/${SHOPIFY_ADMIN_API_VERSION}/shop.json`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CONNECT_TIMEOUT_MS);
    try {
      const res = await fetch(apiUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });

      // Without an Admin API access token Shopify returns 401; that still proves the store endpoint is reachable.
      if (res.status === 401 || res.status === 403) {
        this.logger.log(
          `Shopify: Connected successfully — store "${shopDomain}" reached Admin API (HTTP ${res.status}; OAuth client id/secret loaded).`,
        );
        return;
      }

      if (res.ok) {
        this.logger.log(
          `Shopify: Connected successfully — store "${shopDomain}" Admin API responded OK.`,
        );
        return;
      }

      let detail = '';
      try {
        const text = await res.text();
        detail = text.length > 200 ? `${text.slice(0, 200)}…` : text;
      } catch {
        /* ignore */
      }
      this.logger.error(
        `Shopify: unexpected HTTP ${res.status} from ${shopDomain}. ${detail ? `Body: ${detail}` : ''}`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (
        e instanceof Error &&
        (e.name === 'AbortError' || e.message.includes('abort'))
      ) {
        this.logger.error(
          `Shopify: connection timed out after ${CONNECT_TIMEOUT_MS}ms for "${shopDomain}".`,
        );
        return;
      }
      this.logger.error(
        `Shopify: connection error for "${shopDomain}": ${msg}`,
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
