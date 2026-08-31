import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { Channel, LocalMessage } from "stream-chat";
import {
  ContextMenuButton,
  MessageTranslationIndicator as StreamMessageTranslationIndicator,
  useChatContext,
  useContextMenuContext,
  useMessageContext,
  type ContextMenuItemProps,
} from "stream-chat-react";
import {
  canForwardMessage,
  cloneForwardableAttachments,
  conversationTitle,
  forwardedMessagePreview,
} from "../lib/conversation-title";

type ForwardMessageContextValue = {
  requestForward: (message: LocalMessage) => void;
};

const ForwardMessageContext =
  createContext<ForwardMessageContextValue | null>(null);

export function ForwardMessageProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<LocalMessage | null>(null);
  const value = useMemo(
    () => ({ requestForward: setMessage }),
    [],
  );

  return (
    <ForwardMessageContext.Provider value={value}>
      {children}
      <ForwardMessageModal
        open={message != null}
        message={message}
        onClose={() => setMessage(null)}
      />
    </ForwardMessageContext.Provider>
  );
}

function useForwardMessage() {
  const ctx = useContext(ForwardMessageContext);
  if (!ctx) {
    throw new Error(
      "useForwardMessage must be used within ForwardMessageProvider",
    );
  }
  return ctx;
}

export function ForwardMessageAction(props: ContextMenuItemProps) {
  const { message } = useMessageContext();
  const { closeMenu } = useContextMenuContext();
  const { requestForward } = useForwardMessage();

  if (!canForwardMessage(message)) return null;

  return (
    <ContextMenuButton
      {...props}
      Icon={ForwardedIcon}
      className="str-chat__message-actions-list-item-button"
      aria-label="Forward message"
      onClick={(event) => {
        props.onClick?.(event);
        closeMenu();
        requestForward(message);
      }}
    >
      Forward
    </ContextMenuButton>
  );
}

export function ForwardMessageQuickAction() {
  const { message } = useMessageContext();
  const { requestForward } = useForwardMessage();

  if (!canForwardMessage(message)) return null;

  return (
    <button
      type="button"
      aria-label="Forward message"
      className="str-chat__message-reply-in-thread-button"
      onClick={() => requestForward(message)}
    >
      <ForwardedIcon className="str-chat__message-action-icon" />
    </button>
  );
}

function isForwardedMessage(message: LocalMessage): boolean {
  if (message.forwarded) return true;
  const text = message.text?.trim() ?? "";
  return text.startsWith("Forwarded from ") || text.startsWith("Forwarded\n");
}

function forwardedFromName(message: LocalMessage): string | undefined {
  const named = message.forwarded_from_name?.trim();
  if (named) return named;
  const firstLine = message.text?.trim().split("\n")[0] ?? "";
  const match = /^Forwarded from (.+)$/.exec(firstLine);
  return match?.[1]?.trim() || undefined;
}

function ForwardedLabel({ fromName }: { fromName?: string }) {
  return (
    <div className="tbh-messenger-forwarded-label">
      <ForwardedIcon className="tbh-messenger-forwarded-icon" />
      {fromName ? `Forwarded from ${fromName}` : "Forwarded"}
    </div>
  );
}

export function MessagingTranslationIndicator(
  props: ComponentProps<typeof StreamMessageTranslationIndicator>,
) {
  const { message: contextMessage } = useMessageContext();
  const message = props.message ?? contextMessage;
  if (!isForwardedMessage(message)) {
    return <StreamMessageTranslationIndicator {...props} />;
  }
  return (
    <>
      <ForwardedLabel fromName={forwardedFromName(message)} />
      <StreamMessageTranslationIndicator {...props} />
    </>
  );
}

function ForwardedIcon(props: ComponentProps<"svg">) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      aria-hidden
      {...props}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 15l6-6m0 0l-6-6m6 6H9a6 6 0 000 12h3"
      />
    </svg>
  );
}

type ForwardMessageModalProps = {
  open: boolean;
  message: LocalMessage | null;
  onClose: () => void;
};

function ForwardMessageModal({
  open,
  message,
  onClose,
}: ForwardMessageModalProps) {
  const titleId = useId();
  const { client, channel: activeChannel } = useChatContext();
  const currentUserId = client.userID ?? "";
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedCids, setSelectedCids] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setChannels([]);
      setSelectedCids([]);
      setSearch("");
      setComment("");
      setErrorMessage(null);
      setBusy(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErrorMessage(null);
    void (async () => {
      try {
        const results = await client.queryChannels(
          {
            type: "messaging",
            members: { $in: [currentUserId] },
          },
          { last_message_at: -1 },
          { limit: 100, state: true, watch: false },
        );
        if (!cancelled) {
          setChannels(
            results.filter((channel) => channel.cid !== activeChannel?.cid),
          );
        }
      } catch {
        if (!cancelled) {
          setErrorMessage("Could not load conversations");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeChannel?.cid, client, currentUserId, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose, open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return channels;
    return channels.filter((channel) => {
      const title = conversationTitle(channel, currentUserId);
      const members = Object.values(channel.state.members ?? {})
        .map((member) => member.user?.name ?? member.user_id ?? "")
        .join(" ");
      return `${title} ${members}`.toLowerCase().includes(q);
    });
  }, [channels, currentUserId, search]);

  const toggleCid = useCallback((cid: string) => {
    setSelectedCids((current) =>
      current.includes(cid)
        ? current.filter((id) => id !== cid)
        : [...current, cid],
    );
  }, []);

  const onForward = useCallback(async () => {
    if (!message || selectedCids.length === 0) return;
    setBusy(true);
    setErrorMessage(null);
    const note = comment.trim();
    const originalText = message.text?.trim() ?? "";
    const fromName = message.user?.name?.trim();
    const text = [note, originalText].filter(Boolean).join("\n\n");
    const attachments = cloneForwardableAttachments(message.attachments);
    const failed: string[] = [];
    for (const cid of selectedCids) {
      const dest = channels.find((channel) => channel.cid === cid);
      if (!dest) {
        failed.push("a conversation");
        continue;
      }
      try {
        await sendForwardedMessage(dest, { text, attachments, fromName });
      } catch {
        failed.push(conversationTitle(dest, currentUserId));
      }
    }
    if (failed.length > 0) {
      setErrorMessage(
        failed.length === selectedCids.length
          ? "Could not forward this message"
          : `Could not forward to ${failed.join(", ")}`,
      );
      setBusy(false);
      return;
    }
    setBusy(false);
    onClose();
  }, [
    channels,
    comment,
    currentUserId,
    message,
    onClose,
    selectedCids,
  ]);

  if (!open || !message || typeof document === "undefined") return null;

  const canSubmit = !busy && !loading && selectedCids.length > 0;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50"
        aria-label="Dismiss"
        disabled={busy}
        onClick={() => !busy && onClose()}
      />
      <div className="relative z-10 flex max-h-[min(36rem,calc(100vh-2rem))] w-full max-w-lg flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <h2
          id={titleId}
          className="text-base font-semibold text-slate-900 dark:text-slate-100"
        >
          Forward message
        </h2>
        <p className="mt-1 line-clamp-2 text-sm text-slate-600 dark:text-slate-400">
          {forwardedMessagePreview(message)}
        </p>

        <label className="sr-only" htmlFor="forward-conversation-search">
          Search conversations
        </label>
        <input
          id="forward-conversation-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          disabled={busy || loading}
          placeholder="Search conversations"
          className="mt-4 box-border h-10 min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-0 text-sm leading-5 text-slate-900 outline-none ring-violet-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
        />

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <p className="px-1 py-6 text-sm text-slate-500">
              Loading conversations…
            </p>
          ) : filtered.length === 0 ? (
            <p className="px-1 py-6 text-sm text-slate-500 dark:text-slate-400">
              {channels.length === 0
                ? "No other conversations to forward to."
                : "No conversations match your search."}
            </p>
          ) : (
            <ul className="space-y-1">
              {filtered.map((channel) => {
                const cid = channel.cid;
                const selected = selectedCids.includes(cid);
                const title = conversationTitle(channel, currentUserId);
                const kind =
                  channel.data?.kind === "group"
                    ? "Group"
                    : "Direct message";
                return (
                  <li key={cid}>
                    <label
                      className={[
                        "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm",
                        selected
                          ? "border-violet-400 bg-violet-50 text-violet-900 dark:border-violet-500 dark:bg-violet-950/40 dark:text-violet-100"
                          : "border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800",
                      ].join(" ")}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                        checked={selected}
                        disabled={busy}
                        onChange={() => toggleCid(cid)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          {title}
                        </span>
                        <span className="block text-xs text-slate-500 dark:text-slate-400">
                          {kind}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <label
          htmlFor="forward-comment"
          className="mt-4 mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400"
        >
          Add a message (optional)
        </label>
        <textarea
          id="forward-comment"
          rows={2}
          maxLength={1000}
          disabled={busy}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Write something to send with this message"
          className="box-border w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm leading-5 text-slate-900 outline-none ring-violet-500 focus:ring-2 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
        />

        {errorMessage ? (
          <p
            role="alert"
            className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
          >
            {errorMessage}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => void onForward()}
            className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-violet-700 disabled:opacity-50 dark:bg-violet-600 dark:hover:bg-violet-500"
          >
            {busy ? "Please wait…" : "Forward"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

async function sendForwardedMessage(
  dest: Channel,
  params: {
    text: string;
    attachments: ReturnType<typeof cloneForwardableAttachments>;
    fromName?: string;
  },
) {
  const base = {
    ...(params.text ? { text: params.text } : {}),
    ...(params.attachments.length > 0
      ? { attachments: params.attachments }
      : {}),
  };
  try {
    await dest.sendMessage({
      ...base,
      forwarded: true,
      forwarded_from_name: params.fromName,
    });
  } catch {
    const fallbackText = [
      params.fromName ? `Forwarded from ${params.fromName}` : "Forwarded",
      params.text,
    ]
      .filter(Boolean)
      .join("\n\n");
    await dest.sendMessage({
      ...base,
      text: fallbackText || "Forwarded",
    });
  }
}
