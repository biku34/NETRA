"use client";

import type { NewsResponse } from "@/lib/types";
import { useUI } from "@/store/ui";

const TYPE_STYLE: Record<string, string> = {
  news: "border-alert/30 bg-alert/10 text-alert",
  festival: "border-aug/30 bg-aug/10 text-aug",
  event: "border-info/30 bg-info/10 text-info",
  advisory: "border-warn/30 bg-warn/10 text-warn",
};

export default function NewsFeed({ data }: { data?: NewsResponse }) {
  const setSelectedHex = useUI((s) => s.setSelectedHex);

  if (!data || !data.available) {
    return (
      <div className="mt-5 card-2 p-3">
        <div className="section-label">
          News &amp; events{" "}
          <span className="ml-1 rounded bg-aug/15 px-1.5 py-0.5 text-[10px] text-aug">
            augmentation
          </span>
        </div>
        <p className="mt-1.5 text-[11px] text-dim">
          Unavailable — core predictions unaffected.
        </p>
      </div>
    );
  }

  const items = data.items.slice(0, 8);

  return (
    <div className="mt-5 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h3 className="section-label">News &amp; events</h3>
        <span className="rounded bg-aug/15 px-1.5 py-0.5 text-[10px] font-medium text-aug">
          {data.gdelt_ok ? "GDELT live" : "calendar"}
        </span>
      </div>
      {items.map((it, i) => {
        const inner = (
          <>
            <span className={`badge shrink-0 ${TYPE_STYLE[it.type] ?? TYPE_STYLE.news}`}>
              {it.type}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] text-ink">{it.title}</span>
              <span className="block truncate text-[11px] text-dim">
                {it.location ?? "—"}
                {it.domain && it.domain !== "calendar" ? ` · ${it.domain}` : ""}
                {it.date ? ` · ${it.date.slice(0, 10)}` : ""}
              </span>
            </span>
          </>
        );
        const cls = "card-interactive flex items-center gap-2.5 p-2.5 text-left";
        return it.url ? (
          <a
            key={i}
            href={it.url}
            target="_blank"
            rel="noopener noreferrer"
            className={cls}
            onClick={() => it.h3_r8 && setSelectedHex(it.h3_r8)}
          >
            {inner}
          </a>
        ) : (
          <button key={i} className={cls} onClick={() => it.h3_r8 && setSelectedHex(it.h3_r8)}>
            {inner}
          </button>
        );
      })}
    </div>
  );
}
