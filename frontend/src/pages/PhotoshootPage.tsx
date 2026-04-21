import { useState } from "react";

type PhotoshootTab = "calendar" | "scheduling";

export function PhotoshootPage() {
  const [tab, setTab] = useState<PhotoshootTab>("calendar");

  const tabBtn =
    "-mb-px border-b-2 border-transparent px-4 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:ring-2 focus-visible:ring-violet-500";

  return (
    <div className="w-full min-w-0">
      <div
        className="mb-6 flex items-end gap-2 border-b border-slate-200 dark:border-slate-800"
        role="tablist"
        aria-label="Photoshoot sections"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "calendar"}
          id="tab-photoshoot-calendar"
          aria-controls="panel-photoshoot-calendar"
          className={`${tabBtn} ${
            tab === "calendar"
              ? "border-violet-600 text-violet-700 dark:text-violet-300"
              : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          }`}
          onClick={() => setTab("calendar")}
        >
          Photoshoot Calendar
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "scheduling"}
          id="tab-photoshoot-scheduling"
          aria-controls="panel-photoshoot-scheduling"
          className={`${tabBtn} ${
            tab === "scheduling"
              ? "border-violet-600 text-violet-700 dark:text-violet-300"
              : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          }`}
          onClick={() => setTab("scheduling")}
        >
          Scheduling
        </button>
      </div>

      {tab === "calendar" && (
        <section
          id="panel-photoshoot-calendar"
          role="tabpanel"
          aria-labelledby="tab-photoshoot-calendar"
          className="min-h-[12rem]"
        />
      )}

      {tab === "scheduling" && (
        <section
          id="panel-photoshoot-scheduling"
          role="tabpanel"
          aria-labelledby="tab-photoshoot-scheduling"
          className="min-h-[12rem]"
        />
      )}
    </div>
  );
}
