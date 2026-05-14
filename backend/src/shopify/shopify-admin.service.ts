import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ShopifyShopSession } from './entities/shopify-shop-session.entity';
import { SHOPIFY_ADMIN_API_VERSION } from './shopify-admin-api.constants';
import { normalizeShopDomain } from './normalize-shop-domain';

const GRAPHQL_TIMEOUT_MS = 30_000;
const CLIENT_CREDENTIALS_TIMEOUT_MS = 25_000;

const COLLECTIONS_QUERY = `#graphql
  query Collections($cursor: String) {
    collections(first: 250, after: $cursor, sortKey: TITLE) {
      edges {
        node {
          id
          title
          handle
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export type ShopifyCollectionRow = {
  id: string;
  title: string;
  handle: string;
};

function readShopifyGraphqlErrors(raw: unknown): string[] {
  if (!raw || typeof raw !== 'object') return [];
  const errs = (raw as Record<string, unknown>).errors;
  if (!Array.isArray(errs)) return [];
  const out: string[] = [];
  for (const item of errs) {
    if (
      item &&
      typeof item === 'object' &&
      typeof (item as Record<string, unknown>).message === 'string'
    ) {
      out.push((item as Record<string, unknown>).message as string);
    }
  }
  return out;
}

function readCollectionsConnection(raw: unknown): {
  edges: Array<{ node: ShopifyCollectionRow }>;
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
} | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = (raw as Record<string, unknown>).data;
  if (!data || typeof data !== 'object') return null;
  const collections = (data as Record<string, unknown>).collections;
  if (!collections || typeof collections !== 'object') return null;
  const c = collections as Record<string, unknown>;
  const edgesRaw = c.edges;
  const pageInfoRaw = c.pageInfo;
  if (
    !Array.isArray(edgesRaw) ||
    !pageInfoRaw ||
    typeof pageInfoRaw !== 'object'
  )
    return null;

  const edges: Array<{ node: ShopifyCollectionRow }> = [];
  for (const edge of edgesRaw) {
    if (!edge || typeof edge !== 'object') continue;
    const node = (edge as Record<string, unknown>).node;
    if (!node || typeof node !== 'object') continue;
    const n = node as Record<string, unknown>;
    const id = n.id;
    const title = n.title;
    if (typeof id !== 'string' || typeof title !== 'string') continue;
    const handle = n.handle;
    edges.push({
      node: {
        id,
        title,
        handle: typeof handle === 'string' ? handle : '',
      },
    });
  }

  const pi = pageInfoRaw as Record<string, unknown>;
  const hasNextPage = pi.hasNextPage === true;
  let endCursor: string | null = null;
  if (typeof pi.endCursor === 'string') endCursor = pi.endCursor;
  else if (pi.endCursor === null) endCursor = null;

  return {
    edges,
    pageInfo: { hasNextPage, endCursor },
  };
}

@Injectable()
export class ShopifyAdminService {
  private readonly logger = new Logger(ShopifyAdminService.name);
  private clientCredentialsCache: {
    token: string;
    expiresAtMs: number;
  } | null = null;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(ShopifyShopSession)
    private readonly sessions: Repository<ShopifyShopSession>,
  ) {}

  /** True if Admin API calls can run (OAuth token in DB or optional env fallback). */
  async adminAccessConfigured(): Promise<boolean> {
    const d = await this.getOAuthConnectionDetail();
    return d.connected;
  }

  async getOAuthConnectionDetail(): Promise<{
    connected: boolean;
    configuredShopDomain: string | null;
    storedSessionForShop: boolean;
    totalSessionsStored: number;
    envTokenOverride: boolean;
    clientCredentialsConfigured: boolean;
  }> {
    const envTok = this.config
      .get<string>('SHOPIFY_ADMIN_ACCESS_TOKEN')
      ?.trim();
    const envTokenOverride = !!envTok;
    const domainRaw = this.config.get<string>('SHOPIFY_STORE_DOMAIN')?.trim();
    const configuredShopDomain = domainRaw
      ? normalizeShopDomain(domainRaw)
      : null;
    const clientCredentialsConfigured =
      !!configuredShopDomain &&
      !!this.config.get<string>('SHOPIFY_CLIENT_ID')?.trim() &&
      !!this.config.get<string>('SHOPIFY_CLIENT_SECRET')?.trim();

    let storedSessionForShop = false;
    let totalSessionsStored = 0;

    if (!envTokenOverride) {
      totalSessionsStored = await this.sessions.count();
      if (configuredShopDomain) {
        const row = await this.sessions.findOne({
          where: { shopDomain: configuredShopDomain },
        });
        storedSessionForShop = !!row?.accessToken?.trim();
      }
    }

    const connected =
      envTokenOverride || storedSessionForShop || clientCredentialsConfigured;

    return {
      connected,
      configuredShopDomain,
      storedSessionForShop,
      totalSessionsStored,
      envTokenOverride,
      clientCredentialsConfigured,
    };
  }

  private async resolveAdminAccessToken(): Promise<{
    shopDomain: string;
    token: string;
  }> {
    const domainRaw = this.config.get<string>('SHOPIFY_STORE_DOMAIN')?.trim();
    if (!domainRaw) {
      throw new HttpException(
        'SHOPIFY_STORE_DOMAIN is not configured.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    const shopDomain = normalizeShopDomain(domainRaw);
    const envTok = this.config
      .get<string>('SHOPIFY_ADMIN_ACCESS_TOKEN')
      ?.trim();
    if (envTok) {
      return { shopDomain, token: envTok };
    }
    const row = await this.sessions.findOne({ where: { shopDomain } });
    const tok = row?.accessToken?.trim();
    if (tok) {
      return { shopDomain, token: tok };
    }

    const clientCredentialsToken =
      await this.fetchClientCredentialsAdminToken(shopDomain);
    if (clientCredentialsToken) {
      return { shopDomain, token: clientCredentialsToken };
    }

    const detail = await this.getOAuthConnectionDetail();
    this.logger.warn(
      `Shopify Admin: no usable Admin API token for "${detail.configuredShopDomain ?? 'unset'}". clientCredentialsConfigured=${detail.clientCredentialsConfigured} storedSessionForShop=${detail.storedSessionForShop} shopify_shop_sessions.rows=${detail.totalSessionsStored} envTokenOverride=${detail.envTokenOverride}`,
    );
    throw new HttpException(
      'Shopify Admin API is not configured. Set SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET, and SHOPIFY_STORE_DOMAIN, then restart the server. Optional fallbacks: SHOPIFY_ADMIN_ACCESS_TOKEN or Partner app OAuth.',
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }

  /**
   * Dev Dashboard / Partner apps can obtain an Admin API token for the configured shop
   * with the client credentials grant, using only client id, client secret, and shop.
   */
  private async fetchClientCredentialsAdminToken(
    shopDomain: string,
  ): Promise<string | null> {
    const cached = this.clientCredentialsCache;
    if (cached && cached.expiresAtMs > Date.now()) {
      return cached.token;
    }

    const clientId = this.config.get<string>('SHOPIFY_CLIENT_ID')?.trim();
    const clientSecret = this.config
      .get<string>('SHOPIFY_CLIENT_SECRET')
      ?.trim();
    if (!clientId || !clientSecret) {
      return null;
    }

    const tokenUrl = `https://${shopDomain}/admin/oauth/access_token`;
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      CLIENT_CREDENTIALS_TIMEOUT_MS,
    );

    try {
      const body = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      });

      const res = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: body.toString(),
        signal: controller.signal,
      });

      let payload: unknown;
      try {
        payload = await res.json();
      } catch {
        payload = null;
      }

      if (!res.ok) {
        const snippet =
          typeof payload === 'object' && payload !== null
            ? JSON.stringify(payload).slice(0, 400)
            : String(payload).slice(0, 400);
        this.logger.error(
          `Shopify client credentials HTTP ${res.status} for "${shopDomain}": ${snippet}`,
        );
        return null;
      }

      if (!payload || typeof payload !== 'object') {
        this.logger.error(
          `Shopify client credentials returned an invalid response for "${shopDomain}".`,
        );
        return null;
      }

      const record = payload as Record<string, unknown>;
      const token = record.access_token;
      if (typeof token !== 'string' || !token.trim()) {
        this.logger.error(
          `Shopify client credentials response for "${shopDomain}" was missing access_token.`,
        );
        return null;
      }

      const expiresIn =
        typeof record.expires_in === 'number' && record.expires_in > 120
          ? record.expires_in
          : 3600;
      this.clientCredentialsCache = {
        token: token.trim(),
        expiresAtMs: Date.now() + (expiresIn - 60) * 1000,
      };
      this.logger.log(
        `Shopify Admin: acquired Admin API token for "${shopDomain}" using client credentials.`,
      );
      return this.clientCredentialsCache.token;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(
        `Shopify client credentials error for "${shopDomain}": ${msg}`,
      );
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async listCollections(): Promise<{ collections: ShopifyCollectionRow[] }> {
    const { shopDomain, token } = await this.resolveAdminAccessToken();
    const url = `https://${shopDomain}/admin/api/${SHOPIFY_ADMIN_API_VERSION}/graphql.json`;

    const collections: ShopifyCollectionRow[] = [];
    let cursor: string | null = null;
    let hasNext = true;

    while (hasNext) {
      const payload = await this.graphqlRequest(url, token, COLLECTIONS_QUERY, {
        cursor,
      });

      const gqlErrors = readShopifyGraphqlErrors(payload);
      if (gqlErrors.length > 0) {
        const msg = gqlErrors.join('; ');
        this.logger.error(`Shopify GraphQL: ${msg}`);
        throw new HttpException(
          msg.length > 400 ? `${msg.slice(0, 400)}…` : msg,
          HttpStatus.BAD_GATEWAY,
        );
      }

      const conn = readCollectionsConnection(payload);
      if (!conn) {
        this.logger.error('Shopify GraphQL: missing collections in response');
        throw new HttpException(
          'Unexpected Shopify response.',
          HttpStatus.BAD_GATEWAY,
        );
      }

      for (const edge of conn.edges) {
        collections.push(edge.node);
      }

      hasNext = conn.pageInfo.hasNextPage;
      cursor = conn.pageInfo.endCursor;
      if (hasNext && !cursor) {
        this.logger.warn(
          'Shopify collections pagination reported more pages but no endCursor; stopping.',
        );
        break;
      }
    }

    return { collections };
  }

  private async graphqlRequest(
    url: string,
    accessToken: string,
    query: string,
    variables: Record<string, unknown>,
  ): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GRAPHQL_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken,
        },
        body: JSON.stringify({ query, variables }),
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
          typeof body === 'object' &&
          body !== null &&
          'errors' in body &&
          Array.isArray((body as { errors: unknown }).errors)
            ? JSON.stringify((body as { errors: unknown }).errors).slice(0, 400)
            : JSON.stringify(body).slice(0, 400);
        this.logger.error(
          `Shopify GraphQL HTTP ${res.status} from ${url}: ${snippet}`,
        );
        throw new HttpException(
          'Shopify Admin API request failed.',
          HttpStatus.BAD_GATEWAY,
        );
      }

      return body;
    } catch (e) {
      if (e instanceof HttpException) throw e;
      const msg = e instanceof Error ? e.message : String(e);
      if (
        e instanceof Error &&
        (e.name === 'AbortError' || msg.includes('abort'))
      ) {
        this.logger.error(
          `Shopify GraphQL timed out after ${GRAPHQL_TIMEOUT_MS}ms`,
        );
        throw new HttpException(
          'Shopify Admin API request timed out.',
          HttpStatus.GATEWAY_TIMEOUT,
        );
      }
      this.logger.error(`Shopify GraphQL error: ${msg}`);
      throw new HttpException(
        'Shopify Admin API request failed.',
        HttpStatus.BAD_GATEWAY,
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
