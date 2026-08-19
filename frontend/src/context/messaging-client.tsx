import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { StreamChat } from "stream-chat";
import type { Event } from "stream-chat";
import { readApiMessage } from "../components/CreateConversationModal";
import { apiFetch } from "../lib/api";
import { usePortalAuth } from "./portal-auth";

export type MessagingSession = {
  apiKey: string;
  token: string;
  userId: string;
  name: string;
};

type MessagingClientContextValue = {
  client: StreamChat | null;
  session: MessagingSession | null;
  unreadCount: number;
  loading: boolean;
  error: string | null;
};

const MessagingClientContext = createContext<MessagingClientContextValue | null>(
  null,
);

function unreadFromClient(client: StreamChat): number {
  const user = client.user;
  if (
    user &&
    "total_unread_count" in user &&
    typeof user.total_unread_count === "number"
  ) {
    return user.total_unread_count;
  }
  return 0;
}

export function MessagingClientProvider({ children }: { children: ReactNode }) {
  const { token, user, loading: authLoading } = usePortalAuth();
  const [session, setSession] = useState<MessagingSession | null>(null);
  const [client, setClient] = useState<StreamChat | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const canUseMessaging = Boolean(token && user?.employee);

  useEffect(() => {
    if (authLoading || !canUseMessaging || !token) {
      setSession(null);
      setError(null);
      setSessionLoading(false);
      return;
    }
    let cancelled = false;
    setSessionLoading(true);
    setError(null);
    void (async () => {
      try {
        const res = await apiFetch("/api/messaging/token", {}, token);
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          if (!cancelled) {
            setSession(null);
            setError(readApiMessage(body, "Could not connect to messaging"));
          }
          return;
        }
        if (!cancelled) setSession(body as MessagingSession);
      } catch {
        if (!cancelled) {
          setSession(null);
          setError("Could not connect to messaging");
        }
      } finally {
        if (!cancelled) setSessionLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, canUseMessaging, token]);

  useEffect(() => {
    if (!session) {
      setClient(null);
      setUnreadCount(0);
      return;
    }
    const chatClient = new StreamChat(session.apiKey);
    let cancelled = false;
    void chatClient
      .connectUser({ id: session.userId, name: session.name }, session.token)
      .then(() => {
        if (cancelled) return;
        setClient(chatClient);
        setUnreadCount(unreadFromClient(chatClient));
        setError(null);
      })
      .catch(() => {
        if (cancelled) return;
        setClient(null);
        setUnreadCount(0);
        setError("Could not connect to messaging");
      });
    return () => {
      cancelled = true;
      setClient(null);
      setUnreadCount(0);
      void chatClient.disconnectUser();
    };
  }, [session]);

  useEffect(() => {
    if (!client) return;
    const onEvent = (event: Event) => {
      if (typeof event.total_unread_count === "number") {
        setUnreadCount(event.total_unread_count);
        return;
      }
      if (event.type === "connection.recovered") {
        setUnreadCount(unreadFromClient(client));
      }
    };
    const { unsubscribe } = client.on(onEvent);
    return unsubscribe;
  }, [client]);

  const value = useMemo<MessagingClientContextValue>(
    () => ({
      client,
      session,
      unreadCount,
      loading:
        authLoading ||
        sessionLoading ||
        (canUseMessaging && !client && !error && !sessionLoading),
      error,
    }),
    [
      authLoading,
      canUseMessaging,
      client,
      error,
      session,
      sessionLoading,
      unreadCount,
    ],
  );

  return (
    <MessagingClientContext.Provider value={value}>
      {children}
    </MessagingClientContext.Provider>
  );
}

export function useMessagingClient() {
  const ctx = useContext(MessagingClientContext);
  if (!ctx) {
    throw new Error(
      "useMessagingClient must be used within MessagingClientProvider",
    );
  }
  return ctx;
}
