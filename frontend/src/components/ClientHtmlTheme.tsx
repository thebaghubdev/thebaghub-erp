import { useLayoutEffect } from "react";

/**
 * Client app has no dark mode; keep `<html>` in light theme for this branch.
 */
export function ClientHtmlTheme() {
  useLayoutEffect(() => {
    document.documentElement.classList.remove("dark");
  }, []);

  return null;
}
