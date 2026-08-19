import { useEffect, useState } from "react";
import type { Channel } from "stream-chat";
import { Prompt } from "stream-chat-react";
import {
  ChannelDetailProvider,
  ChannelFilesView,
  ChannelMediaView,
} from "stream-chat-react/channel-detail";
import "stream-chat-react/dist/css/channel-detail.css";

type MediaTab = "media" | "files";

function CloseIcon({ className }: { className?: string }) {
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
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  );
}

export function SharedMediaIcon({ className }: { className?: string }) {
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
        d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Z"
      />
    </svg>
  );
}

export function ConversationMediaPanel({
  channel,
  onClose,
}: {
  channel: Channel;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<MediaTab>("media");

  useEffect(() => {
    setTab("media");
  }, [channel.cid]);

  return (
    <aside className="tbh-messenger-media" aria-label="Shared media">
      <div className="tbh-messenger-media-header">
        <h2 className="tbh-messenger-media-title">Shared media</h2>
        <button
          type="button"
          className="tbh-messenger-media-close"
          onClick={onClose}
          aria-label="Hide shared media"
          title="Hide shared media"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>
      <div className="tbh-messenger-media-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          id="shared-media-tab-media"
          aria-controls="shared-media-panel-media"
          aria-selected={tab === "media"}
          className={
            tab === "media"
              ? "tbh-messenger-media-tab tbh-messenger-media-tab--active"
              : "tbh-messenger-media-tab"
          }
          onClick={() => setTab("media")}
        >
          Photos & videos
        </button>
        <button
          type="button"
          role="tab"
          id="shared-media-tab-files"
          aria-controls="shared-media-panel-files"
          aria-selected={tab === "files"}
          className={
            tab === "files"
              ? "tbh-messenger-media-tab tbh-messenger-media-tab--active"
              : "tbh-messenger-media-tab"
          }
          onClick={() => setTab("files")}
        >
          Files
        </button>
      </div>
      <div
        className="tbh-messenger-media-body"
        role="tabpanel"
        id={
          tab === "media"
            ? "shared-media-panel-media"
            : "shared-media-panel-files"
        }
        aria-labelledby={
          tab === "media" ? "shared-media-tab-media" : "shared-media-tab-files"
        }
      >
        <ChannelDetailProvider key={channel.cid} channel={channel}>
          <Prompt.Root className="str-chat__channel-detail tbh-messenger-channel-detail">
            {tab === "media" ? (
              <ChannelMediaView layout="tabs" />
            ) : (
              <ChannelFilesView layout="tabs" />
            )}
          </Prompt.Root>
        </ChannelDetailProvider>
      </div>
    </aside>
  );
}
