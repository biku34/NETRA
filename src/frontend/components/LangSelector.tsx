"use client";

import { LANGS, useLang } from "@/lib/i18n";

export default function LangSelector() {
  const lang = useLang((s) => s.lang);
  const setLang = useLang((s) => s.setLang);

  return (
    <div
      className="flex items-center gap-0.5 rounded-lg border border-line bg-surface-2 p-0.5"
      role="group"
      aria-label="Language"
      title="Language"
    >
      {LANGS.map((l) => (
        <button
          key={l.code}
          onClick={() => setLang(l.code)}
          aria-pressed={lang === l.code}
          className={`rounded-md px-2 py-1 text-[12px] font-semibold transition ${
            lang === l.code
              ? "bg-core text-white shadow-card"
              : "text-muted hover:text-ink"
          }`}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
