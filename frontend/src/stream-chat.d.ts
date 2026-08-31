import type {} from "stream-chat";

declare module "stream-chat" {
  interface CustomChannelData {
    name?: string;
    kind?: "direct" | "group";
  }

  interface CustomMessageData {
    forwarded?: boolean;
    forwarded_from_name?: string;
  }
}
