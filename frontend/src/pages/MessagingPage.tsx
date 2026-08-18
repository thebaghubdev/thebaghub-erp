import { useCallback, useEffect, useMemo, useState } from "react";
import type { Channel } from "stream-chat";
import {
  Channel as StreamChannel,
  ChannelHeader,
  ChannelList,
  Chat,
  defaultMessageActionSet,
  MessageActions,
  MessageComposer,
  MessageList,
  Window,
  useChatContext,
  useCreateChatClient,
  WithComponents,
} from "stream-chat-react";
import "stream-chat-react/dist/css/index.css";
import "../styles/messenger.css";
import {
  CreateConversationModal,
  readApiMessage,
  type CreatedChannelRef,
} from "../components/CreateConversationModal";
import { usePortalAuth } from "../context/portal-auth";
import { useApp } from "../context/useApp";
import { apiFetch } from "../lib/api";

type TokenResponse = {
  apiKey: string;
  token: string;
  userId: string;
  name: string;
};

const HIDDEN_MESSAGE_ACTIONS = new Set([
  "reply",
  "flag",
  "markUnread",
  "mute",
  "blockUser",
]);

const messagingMessageActionSet = defaultMessageActionSet.filter((action) => {
  if (!("type" in action)) return true;
  return !HIDDEN_MESSAGE_ACTIONS.has(action.type);
});

function HiddenUi() {
  return null;
}

function MessagingMessageActions() {
  return <MessageActions messageActionSet={messagingMessageActionSet} />;
}

const messagingComponentOverrides = {
  ChannelListHeader: HiddenUi,
  ChannelListItemActionButtons: HiddenUi,
  MessageActions: MessagingMessageActions,
  MessageRepliesCountButton: HiddenUi,
};

function EmptyChannelPlaceholder() {
  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-2 bg-white px-6 text-center dark:bg-slate-950">
      <p className="text-lg font-semibold text-slate-800 dark:text-slate-100">
        Your messages
      </p>
      <p className="max-w-sm text-sm text-slate-500 dark:text-slate-400">
        Select a conversation from the list, or create a new one to start
        chatting with staff.
      </p>
    </div>
  );
}

export function MessagingPage() {
  const { token, user } = usePortalAuth();
  const [session, setSession] = useState<TokenResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const res = await apiFetch("/api/messaging/token", {}, token);
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          if (!cancelled) {
            setError(readApiMessage(body, "Could not connect to messaging"));
          }
          return;
        }
        if (!cancelled) setSession(body as TokenResponse);
      } catch {
        if (!cancelled) setError("Could not connect to messaging");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (!user?.employee) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-slate-500">
        An employee profile is required to use messaging.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-slate-500">
        Connecting to messages…
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-red-600 dark:text-red-400">
        {error ?? "Could not connect to messaging"}
      </div>
    );
  }

  return (
    <div className="h-full min-h-0">
      <MessagingSession
        apiKey={session.apiKey}
        token={session.token}
        userId={session.userId}
        name={session.name}
        accessToken={token ?? ""}
      />
    </div>
  );
}

function MessagingSession({
  apiKey,
  token,
  userId,
  name,
  accessToken,
}: TokenResponse & { accessToken: string }) {
  const { theme } = useApp();
  const client = useCreateChatClient({
    apiKey,
    tokenOrProvider: token,
    userData: { id: userId, name },
  });

  if (!client) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-slate-500">
        Connecting to messages…
      </div>
    );
  }

  return (
    <Chat
      client={client}
      theme={
        theme === "dark" ? "str-chat__theme-dark" : "str-chat__theme-light"
      }
      customClasses={{
        chat: "str-chat tbh-messenger-chat",
        channelList: "str-chat__channel-list tbh-messenger-channel-list",
        channel: "str-chat__channel tbh-messenger-channel",
      }}
    >
      <MessagingShell userId={userId} accessToken={accessToken} />
    </Chat>
  );
}

function MessagingShell({
  userId,
  accessToken,
}: {
  userId: string;
  accessToken: string;
}) {
  const { client, setActiveChannel } = useChatContext();
  const [createOpen, setCreateOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [listKey, setListKey] = useState(0);
  const [pendingChannelId, setPendingChannelId] = useState<string | undefined>();

  const filters = useMemo(
    () => ({
      type: "messaging" as const,
      members: { $in: [userId] },
    }),
    [userId],
  );

  const sort = useMemo(() => ({ last_message_at: -1 as const }), []);
  const options = useMemo(
    () => ({ state: true, presence: true, limit: 30 }),
    [],
  );

  const channelRenderFilterFn = useCallback(
    (channels: Channel[]) => {
      const q = search.trim().toLowerCase();
      if (!q) return channels;
      return channels.filter((ch) => {
        const title = typeof ch.data?.name === "string" ? ch.data.name : "";
        const members = Object.values(ch.state.members)
          .map((m) => m.user?.name ?? m.user_id ?? "")
          .join(" ");
        return `${title} ${members}`.toLowerCase().includes(q);
      });
    },
    [search],
  );

  const closeCreate = useCallback(() => {
    if (createBusy) return;
    setCreateOpen(false);
    setCreateError(null);
  }, [createBusy]);

  const onCreate = useCallback(
    async (payload: {
      kind: "direct" | "group";
      memberUserIds: string[];
      name?: string;
    }) => {
      setCreateBusy(true);
      setCreateError(null);
      try {
        const res = await apiFetch(
          "/api/messaging/conversations",
          {
            method: "POST",
            body: JSON.stringify(payload),
          },
          accessToken,
        );
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          setCreateError(readApiMessage(body, "Could not create conversation"));
          return;
        }
        const created = body as CreatedChannelRef;
        const channel = client.channel(created.channelType, created.channelId);
        await channel.watch();
        setActiveChannel(channel);
        setPendingChannelId(created.channelId);
        setListKey((k) => k + 1);
        setCreateOpen(false);
      } catch {
        setCreateError("Could not create conversation");
      } finally {
        setCreateBusy(false);
      }
    },
    [accessToken, client, setActiveChannel],
  );

  return (
    <div className="tbh-messenger-layout">
      <WithComponents overrides={messagingComponentOverrides}>
        <aside className="tbh-messenger-sidebar">
          <div className="tbh-messenger-sidebar-header">
            <div className="flex items-center justify-between gap-2">
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                Chats
              </h1>
              <button
                type="button"
                onClick={() => {
                  setCreateError(null);
                  setCreateOpen(true);
                }}
                className="rounded-full bg-[#0084ff] px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-[#0073e6]"
              >
                Create conversation
              </button>
            </div>
            <label className="sr-only" htmlFor="conversation-search">
              Search conversations
            </label>
            <input
              id="conversation-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations"
              className="mt-3 h-9 w-full rounded-full border-0 bg-slate-100 px-3 text-sm text-slate-800 outline-none ring-0 placeholder:text-slate-400 focus:bg-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:bg-slate-700"
            />
          </div>
          <ChannelList
            key={listKey}
            filters={filters}
            sort={sort}
            options={options}
            channelRenderFilterFn={channelRenderFilterFn}
            customActiveChannel={pendingChannelId}
            EmptyStateIndicator={() => (
              <p className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                {search.trim()
                  ? "No conversations match your search."
                  : "No conversations yet. Create one to get started."}
              </p>
            )}
          />
        </aside>
        <StreamChannel EmptyPlaceholder={<EmptyChannelPlaceholder />}>
          <Window>
            <ChannelHeader />
            <MessageList />
            <MessageComposer />
          </Window>
        </StreamChannel>
      </WithComponents>
      <CreateConversationModal
        open={createOpen}
        token={accessToken}
        busy={createBusy}
        errorMessage={createError}
        onCancel={closeCreate}
        onCreate={onCreate}
      />
    </div>
  );
}
