import { useEffect, useRef, useState } from "react";

let turnstileScriptPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.resolve();
  }
  if (window.turnstile) {
    return Promise.resolve();
  }
  if (turnstileScriptPromise) {
    return turnstileScriptPromise;
  }
  turnstileScriptPromise = new Promise((resolve, reject) => {
    const src =
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Turnstile script failed")),
        { once: true },
      );
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Turnstile script failed"));
    document.head.appendChild(script);
  });
  return turnstileScriptPromise;
}

type Props = {
  siteKey: string;
  onTokenChange: (token: string | null) => void;
};

export function TurnstileChallenge({ siteKey, onTokenChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onTokenChangeRef = useRef(onTokenChange);
  onTokenChangeRef.current = onTokenChange;
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let widgetId: string | undefined;
    let cancelled = false;
    setLoadError(null);
    onTokenChangeRef.current(null);

    void (async () => {
      try {
        await loadTurnstileScript();
        if (cancelled || !containerRef.current || !window.turnstile) {
          return;
        }
        widgetId = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme: "light",
          callback: (token: string) => onTokenChangeRef.current(token),
          "expired-callback": () => onTokenChangeRef.current(null),
          "error-callback": () => onTokenChangeRef.current(null),
        });
      } catch {
        if (!cancelled) {
          setLoadError("Could not load verification. Please refresh the page.");
          onTokenChangeRef.current(null);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (widgetId !== undefined && window.turnstile) {
        window.turnstile.remove(widgetId);
      }
    };
  }, [siteKey]);

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-slate-700">Verification</p>
      <div ref={containerRef} className="min-h-[65px]" />
      {loadError && (
        <p className="text-xs text-red-700" role="alert">
          {loadError}
        </p>
      )}
    </div>
  );
}
