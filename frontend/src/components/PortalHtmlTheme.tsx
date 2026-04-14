import { useLayoutEffect } from "react";
import { useApp } from "../context/useApp";

/**
 * Employee portal respects app theme (light/dark). Render once under `/portal/*`.
 */
export function PortalHtmlTheme() {
  const { theme } = useApp();

  useLayoutEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  return null;
}
