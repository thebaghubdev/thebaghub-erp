/** Normalize host to Shopify shop hostname (adds `.myshopify.com` when omitted). */
export function normalizeShopDomain(raw: string): string {
  let host = raw.trim().toLowerCase();
  host = host.replace(/^https?:\/\//, '');
  host = host.split('/')[0] ?? host;
  host = host.replace(/\.+$/, '');
  if (!host.includes('.')) {
    host = `${host}.myshopify.com`;
  }
  return host;
}
