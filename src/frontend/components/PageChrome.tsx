"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "./Logo";
import LangSelector from "./LangSelector";
import { useT } from "@/lib/i18n";
import { MODULES, MODULE_ICON, portalHref } from "@/lib/portal";

// pages inside the Hotspots module (shown under it in the sidebar / as tabs)
const HOTSPOT_PAGES = [
  { href: "/", label: "Hotspot map", match: (p: string) => p === "/" || p.startsWith("/zone") },
  { href: "/accuracy", label: "Prediction accuracy", match: (p: string) => p.startsWith("/accuracy") },
  { href: "/brief", label: "Weekly SHO brief", match: (p: string) => p.startsWith("/brief") },
];

// Decision-support banner is temporarily hidden — flip to true to restore.
const SHOW_BANNER = false;

export const APP_NAME = "Netra";
export const APP_TAGLINE = "Unified Crime Intelligence Platform";

function Icon({ d, size = 20 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0">
      <path d={d} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const ITEM = "flex min-h-11 items-center gap-3 rounded-md px-3 text-[15px] transition-colors";
const IDLE = "text-muted hover:bg-bg hover:text-ink";

/** Platform navbar for the zone and brief pages: the shell's modules. The
 *  Hotspots module's own sub-page list is intentionally left empty for now —
 *  more features land here later (see the Hotspots arm of MODULES.map below).
 *  The map page keeps its full-screen chrome and uses <ModuleTabs /> instead.
 *  Pages using this add `lg:pl-60`. */
export default function PageChrome({
  crumb,
  right,
}: {
  crumb: string;
  right?: React.ReactNode;
}) {
  const t = useT();
  const path = usePathname() ?? "";

  return (
    <>
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-surface lg:flex">
        <a href={portalHref("/")} className="flex items-center gap-3 px-5 py-5">
          <Logo size={32} />
          <div>
            <p className="text-lg font-semibold leading-tight text-ink">{APP_NAME}</p>
            <p className="text-[12.5px] leading-tight text-muted">{APP_TAGLINE}</p>
          </div>
        </a>
        <nav aria-label="Main" className="mt-2 flex flex-col gap-1 px-3">
          {MODULES.map((m) =>
            m.href !== null ? (
              // other modules live in the platform shell: a full page load
              <a key={m.label} href={portalHref(m.href)} className={`${ITEM} ${IDLE}`}>
                <Icon d={MODULE_ICON[m.icon]} />
                {t(m.label)}
              </a>
            ) : (
              <div key={m.label}>
                <Link href="/" className={`${ITEM} bg-accent font-semibold text-white`}>
                  <Icon d={MODULE_ICON[m.icon]} />
                  {t(m.label)}
                </Link>
                <div className="my-1 ml-[22px] flex flex-col gap-0.5 border-l border-line pl-3">
                  {HOTSPOT_PAGES.map((sp) => (
                    <Link
                      key={sp.href}
                      href={sp.href}
                      aria-current={sp.match(path) ? "page" : undefined}
                      className={`flex min-h-9 items-center rounded-md px-2.5 text-[14px] transition-colors ${
                        sp.match(path) ? "bg-accent-soft font-semibold text-accent" : IDLE
                      }`}
                    >
                      {t(sp.label)}
                    </Link>
                  ))}
                </div>
              </div>
            )
          )}
        </nav>
      </aside>

      <div className="sticky top-0 z-20">
        {SHOW_BANNER && (
          <div className="no-print flex items-center justify-center gap-1.5 bg-medium-soft py-[5px] text-[11px] font-medium text-warn">
            <span className="h-1.5 w-1.5 rounded-full bg-warn" />
            Decision support — for SHO review &amp; approval. Not an automated order.
          </div>
        )}
        <header className="flex items-center justify-between gap-3 border-b border-line bg-surface/95 px-4 py-2.5 backdrop-blur sm:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <a href={portalHref("/")} className="flex items-center gap-2.5 lg:hidden">
              <Logo size={28} />
              <span className="text-[15px] font-semibold text-ink">{APP_NAME}</span>
            </a>
            <span className="text-dim lg:hidden">/</span>
            <span className="truncate text-[15px] text-muted">
              <span className="hidden lg:inline">{t("Hotspots")} · </span>
              {t(crumb)}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {right}
            <LangSelector />
            <Link
              href="/"
              className="text-[13.5px] font-semibold text-muted transition-colors hover:text-ink lg:hidden"
            >
              ← {t("Map")}
            </Link>
          </div>
        </header>
      </div>

      <MobileModules />
    </>
  );
}

/** Bottom module bar on small screens, as in the platform shell. */
export function MobileModules() {
  const t = useT();
  return (
    <nav
      aria-label="Main"
      className="no-print fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {MODULES.map((m) => {
        const cls = `flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs ${
          m.href === null ? "font-semibold text-accent" : "text-muted"
        }`;
        const body = (
          <>
            <Icon d={MODULE_ICON[m.icon]} />
            {t(m.label)}
          </>
        );
        return m.href === null ? (
          <Link key={m.label} href="/" aria-current="page" className={cls}>
            {body}
          </Link>
        ) : (
          <a key={m.label} href={portalHref(m.href)} className={cls}>
            {body}
          </a>
        );
      })}
    </nav>
  );
}

/** The platform's modules as tabs, for the full-screen map page's top bar. */
export function ModuleTabs() {
  const t = useT();
  return (
    <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
      {MODULES.map((m) =>
        m.href === null ? (
          <Link
            key={m.label}
            href="/"
            aria-current="page"
            className="flex min-h-9 items-center gap-2 rounded-md bg-accent px-3 text-[14px] font-semibold text-white"
          >
            <Icon d={MODULE_ICON[m.icon]} size={17} />
            {t(m.label)}
          </Link>
        ) : (
          <a
            key={m.label}
            href={portalHref(m.href)}
            className={`flex min-h-9 items-center gap-2 rounded-md px-3 text-[14px] transition-colors ${IDLE}`}
          >
            <Icon d={MODULE_ICON[m.icon]} size={17} />
            {t(m.label)}
          </a>
        )
      )}
    </nav>
  );
}
