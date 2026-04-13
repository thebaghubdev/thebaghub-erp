import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { PasswordField } from "../components/PasswordField";
import { useClientAuth } from "../context/client-auth";

export function ClientLoginPage() {
  const { login, token, loading: authLoading } = useClientAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo =
    (location.state as { from?: string } | undefined)?.from ?? "/consignments";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      const target =
        redirectTo.startsWith("/") &&
        redirectTo !== "/login" &&
        redirectTo !== "/create-account"
          ? redirectTo
          : "/consignments";
      navigate(target, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (authLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-slate-50 text-slate-600">
        <p className="text-sm">Loading…</p>
      </div>
    );
  }

  if (token) {
    return <Navigate to="/consignments" replace />;
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-gradient-to-b from-violet-50 to-slate-50 px-4 pb-8 pt-8">
      <div className="w-full max-w-md rounded-2xl border border-slate-200/80 bg-white p-6 shadow-lg sm:p-8">
        <h1 className="mb-1 text-center text-xl font-semibold text-slate-900">
          The Bag Hub
        </h1>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div>
            <label
              htmlFor="client-login-email"
              className="mb-1 block text-xs font-medium text-slate-700"
            >
              Email
            </label>
            <input
              id="client-login-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 outline-none ring-violet-500 focus:ring-2"
              required
            />
          </div>
          <PasswordField
            id="client-login-password"
            label="Password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            required
            labelClassName="mb-1 block text-xs font-medium text-slate-700"
          />

          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="min-h-11 rounded-xl bg-violet-600 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-violet-700 disabled:opacity-50"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-600">
          New here?{" "}
          <Link
            to="/create-account"
            className="font-medium text-violet-700 hover:text-violet-800"
          >
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
