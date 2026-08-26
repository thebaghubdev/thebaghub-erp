const JSON_HEADERS = { 'Content-Type': 'application/json' }

/**
 * Prefix API paths with `VITE_API_URL` on Heroku. Leave relative in local
 * Vite so `/api` still goes through the dev proxy.
 */
export function apiUrl(path: string): string {
  const base = import.meta.env.VITE_API_URL?.trim().replace(/\/$/, '') ?? ''
  return `${base}${path}`
}

export async function apiFetch(
  path: string,
  init: RequestInit = {},
  accessToken: string | null,
): Promise<Response> {
  const headers = new Headers(init.headers)
  if (!headers.has('Content-Type') && init.body && !(init.body instanceof FormData)) {
    Object.entries(JSON_HEADERS).forEach(([k, v]) => headers.set(k, v))
  }
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`)
  }
  return fetch(apiUrl(path), { ...init, headers })
}
