/** Staff-portal path stored on system tasks, e.g. `/portal/orders/:id`. */
export function portalPagePath(path: string): string {
  return path.startsWith('/') ? path : `/${path}`;
}
