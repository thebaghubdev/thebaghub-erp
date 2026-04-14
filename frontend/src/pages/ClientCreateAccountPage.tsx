import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { PasswordField } from "../components/PasswordField";
import { useClientAuth } from "../context/client-auth";

export function ClientCreateAccountPage() {
  const { token } = useClientAuth();
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (token) {
    return <Navigate to="/consignments" replace />;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/register/client", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          contactNumber: contactNumber.trim(),
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = Array.isArray(body?.message)
          ? body.message.join(", ")
          : typeof body?.message === "string"
            ? body.message
            : `Registration failed (${res.status})`;
        throw new Error(msg);
      }
      setSuccess("Account created. You can sign in now.");
      setPassword("");
      setFirstName("");
      setLastName("");
      setEmail("");
      setContactNumber("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setSubmitting(false);
    }
  }

  const field =
    "w-full min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 outline-none ring-violet-500 focus:ring-2";

  return (
    <div className="min-h-svh bg-gradient-to-b from-violet-50 to-slate-50 px-4 py-8 pb-8">
      <div className="mx-auto w-full max-w-md rounded-2xl border border-slate-200/80 bg-white p-6 shadow-lg sm:p-8">
        <h1 className="mb-1 text-center text-xl font-semibold text-slate-900">
          Create account
        </h1>

        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div>
            <label
              htmlFor="ca-email"
              className="mb-1 block text-xs font-medium text-slate-700"
            >
              Email
            </label>
            <input
              id="ca-email"
              type="email"
              className={field}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
            <p className="mt-1 text-xs text-slate-500">
              Used as your username when you sign in.
            </p>
          </div>
          <PasswordField
            id="ca-pass"
            label="Password"
            value={password}
            onChange={setPassword}
            minLength={8}
            required
            autoComplete="new-password"
            comfortable
            labelClassName="mb-1 block text-xs font-medium text-slate-700"
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="ca-fn"
                className="mb-1 block text-xs font-medium text-slate-700"
              >
                First name
              </label>
              <input
                id="ca-fn"
                className={field}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoComplete="given-name"
                required
              />
            </div>
            <div>
              <label
                htmlFor="ca-ln"
                className="mb-1 block text-xs font-medium text-slate-700"
              >
                Last name
              </label>
              <input
                id="ca-ln"
                className={field}
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                autoComplete="family-name"
                required
              />
            </div>
          </div>
          <div>
            <label
              htmlFor="ca-contact"
              className="mb-1 block text-xs font-medium text-slate-700"
            >
              Contact number
            </label>
            <input
              id="ca-contact"
              className={field}
              value={contactNumber}
              onChange={(e) => setContactNumber(e.target.value)}
              required
            />
          </div>

          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          )}
          {success && (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              {success}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="min-h-11 rounded-xl bg-violet-600 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-violet-700 disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create account"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-600">
          Already have an account?{" "}
          <Link
            to="/login"
            className="font-medium text-violet-700 hover:text-violet-800"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
