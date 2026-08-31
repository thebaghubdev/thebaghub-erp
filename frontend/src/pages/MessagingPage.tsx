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
  useMessageContext,
  WithComponents,
} from "stream-chat-react";
import "stream-chat-react/dist/css/index.css";
import "../styles/messenger.css";
import {
  ConversationMediaPanel,
  SharedMediaIcon,
} from "../components/ConversationMediaPanel";
import {
  ForwardMessageAction,
  ForwardMessageProvider,
  MessagingTranslationIndicator,
} from "../components/ForwardMessageModal";
import { ManageGroupMembersModal } from "../components/ManageGroupMembersModal";
import {
  CreateConversationModal,
  readApiMessage,
  type CreatedChannelRef,
} from "../components/CreateConversationModal";
import { useMessagingClient } from "../context/messaging-client";
import { usePortalAuth } from "../context/portal-auth";
import { useApp } from "../context/useApp";
import { apiFetch } from "../lib/api";
import {
  canForwardMessage,
  conversationTitle,
} from "../lib/conversation-title";

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
  const { message } = useMessageContext();
  const messageActionSet = useMemo(() => {
    if (!canForwardMessage(message)) return messagingMessageActionSet;
    return [
      ...messagingMessageActionSet,
      {
        Component: ForwardMessageAction,
        placement: "dropdown" as const,
        type: "forward",
      },
    ];
  }, [message]);
  return <MessageActions messageActionSet={messageActionSet} />;
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
  MessageTranslationIndicator: MessagingTranslationIndicator,
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

function ManageMembersIcon({ className }: { className?: string }) {
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
        d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z"
      />
    </svg>
  );
}

function ConversationWorkspace({ accessToken }: { accessToken: string }) {
  const { channel } = useChannelStateContext();
  const { client } = useChatContext();
  const [mediaOpen, setMediaOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [manageBusy, setManageBusy] = useState(false);
  const [manageError, setManageError] = useState<string | null>(null);

  const isGroup = channel.data?.kind === "group";
  const currentUserId = client.userID ?? "";
  const currentMembers = useMemo(() => {
    return Object.values(channel.state.members ?? {})
      .map((member) => {
        const userId = member.user_id ?? member.user?.id ?? "";
        const name = member.user?.name?.trim() || "Staff";
        return { userId, name };
      })
      .filter((member) => member.userId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [channel.state.members]);

  useEffect(() => {
    setManageOpen(false);
    setManageError(null);
    setManageBusy(false);
  }, [channel.cid]);

  const closeManage = useCallback(() => {
    if (manageBusy) return;
    setManageOpen(false);
    setManageError(null);
  }, [manageBusy]);

  const onSaveMembers = useCallback(
    async (payload: { addUserIds: string[]; removeUserIds: string[] }) => {
      const channelId = channel.id;
      if (!channelId) return;
      setManageBusy(true);
      setManageError(null);
      try {
        const res = await apiFetch(
          `/api/messaging/conversations/${encodeURIComponent(channelId)}/members`,
          {
            method: "PATCH",
            body: JSON.stringify(payload),
          },
          accessToken,
        );
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          setManageError(readApiMessage(body, "Could not update members"));
          return;
        }
        await channel.query({ state: true, watch: true });
        setManageOpen(false);
      } catch {
        setManageError("Could not update members");
      } finally {
        setManageBusy(false);
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
              ? "tbh-messenger-chat-header tbh-messenger-chat-header--with-manage"
              : "tbh-messenger-chat-header"
          }
        >
          <ChannelHeader />
          <div className="tbh-messenger-header-actions">
            {isGroup ? (
              <button
                type="button"
                className="tbh-messenger-header-action"
                aria-label="Manage members"
                title="Manage members"
                onClick={() => {
                  setManageError(null);
                  setManageOpen(true);
                }}
              >
                <ManageMembersIcon className="h-5 w-5" />
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
        <ManageGroupMembersModal
          open={manageOpen}
          token={accessToken}
          currentUserId={currentUserId}
          members={currentMembers}
          busy={manageBusy}
          errorMessage={manageError}
          onCancel={closeManage}
          onSave={onSaveMembers}
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
        const title = conversationTitle(ch, userId);
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
    <ForwardMessageProvider>
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
    </ForwardMessageProvider>
  );
}
