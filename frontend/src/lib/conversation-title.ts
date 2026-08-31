import type { Attachment, Channel, LocalMessage } from "stream-chat";

export function conversationTitle(
  channel: Channel,
  currentUserId: string,
): string {
  if (typeof channel.data?.name === "string" && channel.data.name.trim()) {
    return channel.data.name.trim();
  }
  const names = Object.values(channel.state.members ?? {})
    .map((member) => {
      const id = member.user_id ?? member.user?.id ?? "";
      if (!id || id === currentUserId) return "";
      return member.user?.name?.trim() || "Staff";
    })
    .filter(Boolean);
  return names.length > 0 ? names.join(", ") : "Conversation";
}

export function canForwardMessage(message: LocalMessage): boolean {
  if (message.deleted_at || message.type === "deleted") return false;
  if (
    message.type === "system" ||
    message.type === "error" ||
    message.type === "ephemeral"
  ) {
    return false;
  }
  if (message.poll_id) return false;
  if (message.status === "failed" || message.status === "sending") return false;
  const hasText = Boolean(message.text?.trim());
  const hasAttachments = Boolean(message.attachments?.length);
  return hasText || hasAttachments;
}

export function cloneForwardableAttachments(
  attachments: LocalMessage["attachments"],
): Attachment[] {
  if (!attachments?.length) return [];
  return attachments.map((attachment) => {
    const cloned = { ...attachment };
    delete cloned.actions;
    return cloned;
  });
}

export function forwardedMessagePreview(message: LocalMessage): string {
  const text = message.text?.trim();
  if (text) return text.length > 140 ? `${text.slice(0, 140)}…` : text;
  const count = message.attachments?.length ?? 0;
  if (count === 1) return "1 attachment";
  if (count > 1) return `${count} attachments`;
  return "Message";
}
