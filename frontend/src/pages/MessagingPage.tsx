import { useCallback, useEffect, useMemo, useState } from "react";
import type { Channel } from "stream-chat";
import {
  AttachmentSelector,
  Channel as StreamChannel,
  ChannelHeader,
  ChannelList,
  Chat,
  defaultAttachmentSelectorActionSet,
  defaultMessageActionSet,
  MessageActions,
  MessageComposer,
  MessageList,
  Window,
  useChannelStateContext,
  useChatContext,
  WithComponents,
} from "stream-chat-react";
import "stream-chat-react/dist/css/index.css";
import "../styles/messenger.css";
import {
  ConversationMediaPanel,
  SharedMediaIcon,
} from "../components/ConversationMediaPanel";
import { AddGroupMembersModal } from "../components/AddGroupMembersModal";
import {
  CreateConversationModal,
  readApiMessage,
  type CreatedChannelRef,
} from "../components/CreateConversationModal";
import { useMessagingClient } from "../context/messaging-client";
import { usePortalAuth } from "../context/portal-auth";
import { useApp } from "../context/useApp";
import { apiFetch } from "../lib/api";

export function MessagingPage() {
  const { token, user } = usePortalAuth();
  const { theme } = useApp();
  const { client, session, loading, error } = useMessagingClient();

  if (!user?.employee) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-slate-500">
        An employee profile is required to use messaging.
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-red-600 dark:text-red-400">
        {error}
      </div>
    );
  }

  if (loading || !client || !session) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-slate-500">
        Connecting to messages…
      </div>
    );
  }

  return (
    <div className="h-full min-h-0">
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
        <MessagingShell userId={session.userId} accessToken={token ?? ""} />
      </Chat>
    </div>
  );
}

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

const messagingAttachmentSelectorActionSet =
  defaultAttachmentSelectorActionSet.filter(
    (action) => action.type !== "selectCommand",
  );

function HiddenUi() {
  return null;
}

function MessagingMessageActions() {
  return <MessageActions messageActionSet={messagingMessageActionSet} />;
}

function MessagingAttachmentSelector() {
  return (
    <AttachmentSelector
      attachmentSelectorActionSet={messagingAttachmentSelectorActionSet}
    />
  );
}

const messagingComponentOverrides = {
  ChannelListHeader: HiddenUi,
  ChannelListItemActionButtons: HiddenUi,
  MessageActions: MessagingMessageActions,
  MessageRepliesCountButton: HiddenUi,
  AttachmentSelector: MessagingAttachmentSelector,
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

function AddStaffIcon({ className }: { className?: string }) {
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
        d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM3 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 019.374 21c-2.331 0-4.512-.645-6.374-1.766z"
      />
    </svg>
  );
}

function ConversationWorkspace({ accessToken }: { accessToken: string }) {
  const { channel } = useChannelStateContext();
  const [mediaOpen, setMediaOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const isGroup = channel.data?.kind === "group";
  const memberUserIds = Object.keys(channel.state.members ?? {});

  useEffect(() => {
    setAddOpen(false);
    setAddError(null);
    setAddBusy(false);
  }, [channel.cid]);

  const closeAdd = useCallback(() => {
    if (addBusy) return;
    setAddOpen(false);
    setAddError(null);
  }, [addBusy]);

  const onAddMembers = useCallback(
    async (memberUserIdsToAdd: string[]) => {
      const channelId = channel.id;
      if (!channelId) return;
      setAddBusy(true);
      setAddError(null);
      try {
        const res = await apiFetch(
          `/api/messaging/conversations/${encodeURIComponent(channelId)}/members`,
          {
            method: "POST",
            body: JSON.stringify({ memberUserIds: memberUserIdsToAdd }),
          },
          accessToken,
        );
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          setAddError(readApiMessage(body, "Could not add staff"));
          return;
        }
        await channel.query({ state: true, watch: true });
        setAddOpen(false);
      } catch {
        setAddError("Could not add staff");
      } finally {
        setAddBusy(false);
      }
    },
    [accessToken, channel],
  );

  return (
    <>
      <Window>
        <div
          className={
            isGroup
              ? "tbh-messenger-chat-header tbh-messenger-chat-header--with-add"
              : "tbh-messenger-chat-header"
          }
        >
          <ChannelHeader />
          <div className="tbh-messenger-header-actions">
            {isGroup ? (
              <button
                type="button"
                className="tbh-messenger-header-action"
                aria-label="Add staff"
                title="Add staff"
                onClick={() => {
                  setAddError(null);
                  setAddOpen(true);
                }}
              >
                <AddStaffIcon className="h-5 w-5" />
              </button>
            ) : null}
            <button
              type="button"
              className="tbh-messenger-header-action"
              aria-pressed={mediaOpen}
              aria-label={mediaOpen ? "Hide shared media" : "Show shared media"}
              title={mediaOpen ? "Hide shared media" : "Show shared media"}
              onClick={() => setMediaOpen((open) => !open)}
            >
              <SharedMediaIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
        <MessageList />
        <MessageComposer />
      </Window>
      {mediaOpen ? (
        <ConversationMediaPanel
          channel={channel}
          onClose={() => setMediaOpen(false)}
        />
      ) : null}
      {isGroup ? (
        <AddGroupMembersModal
          open={addOpen}
          token={accessToken}
          excludedUserIds={memberUserIds}
          busy={addBusy}
          errorMessage={addError}
          onCancel={closeAdd}
          onAdd={onAddMembers}
        />
      ) : null}
    </>
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
          <ConversationWorkspace accessToken={accessToken} />
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
