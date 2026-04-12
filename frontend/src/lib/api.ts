const JSON_HEADERS = { 'Content-Type': 'application/json' }

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
  return fetch(path, { ...init, headers })
}
