import type {} from "stream-chat";

declare module "stream-chat" {
  interface CustomChannelData {
    name?: string;
    kind?: "direct" | "group";
  }
}
