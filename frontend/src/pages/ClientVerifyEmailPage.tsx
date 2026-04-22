import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

export function ClientVerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";
  const [phase, setPhase] = useState<"loading" | "success" | "error">(
    "loading",
  );
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setPhase("error");
      setMessage(
        "This link is missing the verification token. Open the link from your email, or request a new one from the sign-in page.",
      );
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/auth/verify-client-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const body = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok) {
          const msg = Array.isArray(body?.message)
            ? body.message.join(", ")
            : typeof body?.message === "string"
              ? body.message
              : "Verification failed.";
          setPhase("error");
          setMessage(msg);
          return;
        }
        setPhase("success");
        setMessage(
          body?.alreadyVerified
            ? "This email is already verified. You can sign in."
            : "Your email is verified. You can sign in now.",
        );
      } catch {
        if (!cancelled) {
          setPhase("error");
          setMessage("Something went wrong. Try again or request a new link.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-gradient-to-b from-violet-50 to-slate-50 px-4 pb-8 pt-8">
      <div className="w-full max-w-md rounded-2xl border border-slate-200/80 bg-white p-6 shadow-lg sm:p-8">
        <h1 className="mb-4 text-center text-xl font-semibold text-slate-900">
          Email verification
        </h1>
        {phase === "loading" && (
          <p className="text-center text-sm text-slate-600">Verifying…</p>
        )}
        {(phase === "success" || phase === "error") && (
          <p
            className={
              phase === "success"
                ? "rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
                : "rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
            }
          >
            {message}
          </p>
        )}
        <p className="mt-6 text-center text-sm text-slate-600">
          <Link
            to="/login"
            className="font-medium text-violet-700 hover:text-violet-800"
          >
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
