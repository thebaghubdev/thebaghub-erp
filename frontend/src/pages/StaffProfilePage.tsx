import { format, parse } from "date-fns";
import type { ReactNode } from "react";
import { usePortalAuth } from "../context/portal-auth";

function displayOrDash(v: string | null | undefined) {
  const t = v?.trim();
  return t ? t : "—";
}

function formatHireDate(raw: string | undefined) {
  const day = raw?.trim().slice(0, 10);
  if (!day) return "—";
  const parsed = parse(day, "yyyy-MM-dd", new Date());
  if (Number.isNaN(parsed.getTime())) return day;
  return format(parsed, "MMMM d, yyyy");
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-slate-900 dark:text-slate-100">
        {children}
      </dd>
    </div>
  );
}

export function StaffProfilePage() {
  const { user } = usePortalAuth();
  const emp = user?.employee;

  const fullName = emp
    ? `${emp.firstName} ${emp.lastName}`.trim()
    : displayOrDash(user?.username);

  return (
    <div className="mx-auto w-full max-w-xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          Profile
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Your staff account details.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <dl className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">{fullName}</Field>
          <Field label="Username">{displayOrDash(user?.username)}</Field>
          <Field label="Position">{displayOrDash(emp?.position)}</Field>
          <Field label="Role">
            {user?.isAdmin ? "Administrator" : "Staff"}
          </Field>
          <Field label="Email">
            <span className="break-all">{displayOrDash(emp?.email)}</span>
          </Field>
          <Field label="Contact number">
            {displayOrDash(emp?.contactNumber)}
          </Field>
          <Field label="Hire date">{formatHireDate(emp?.hireDate)}</Field>
        </dl>
      </div>
    </div>
  );
}
