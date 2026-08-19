import { NavLink } from "react-router-dom";
import { useMessagingClient } from "../context/messaging-client";
import { usePortalAuth } from "../context/portal-auth";

function ChatIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 01.778-.327 32.16 32.16 0 004.798-.34c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z"
      />
    </svg>
  );
}

export function MessagingButton() {
  const { user, loading, token } = usePortalAuth();
  const { unreadCount } = useMessagingClient();
  if (loading || !token || !user?.employee) return null;

  const unreadLabel =
    unreadCount > 0
      ? `Messages, ${unreadCount > 99 ? "more than 99" : unreadCount} unread`
      : "Messages";

  return (
    <NavLink
      to="/portal/messaging"
      title={unreadLabel}
      aria-label={unreadLabel}
      className={({ isActive }) =>
        [
          "relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border shadow-sm transition-colors",
          isActive
            ? "border-violet-400 bg-violet-50 text-violet-700 dark:border-violet-500 dark:bg-violet-950/50 dark:text-violet-300"
            : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:text-violet-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-violet-300",
        ].join(" ")
      }
    >
      <ChatIcon className="h-5 w-5" />
      {unreadCount > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-[1.1rem] min-w-[1.1rem] items-center justify-center rounded-full bg-rose-600 px-1 text-[0.6rem] font-bold leading-none text-white dark:bg-rose-500">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </NavLink>
  );
}
