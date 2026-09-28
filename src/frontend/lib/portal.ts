// This app is the Hotspots module of the Netra platform. The platform shell
// (../portal) serves it on its own origin under /hotspots, and owns sign-in.

/** Origin of the platform shell. Empty = same origin (the normal, proxied setup). */
export const PORTAL_ORIGIN = (process.env.NEXT_PUBLIC_PORTAL_ORIGIN ?? "").replace(/\/$/, "");

/** Address of a page in the platform shell, e.g. portalHref("/fir"). */
export const portalHref = (path: string) => `${PORTAL_ORIGIN}${path}`;

export type ModuleIcon = "home" | "fir" | "map" | "settings";

/** The platform's modules, in the order the shell's navbar lists them.
 *  `href: null` marks this app. Drug Risk is a "Coming Soon" placeholder in the
 *  shell — left out here too until that module is actually built. */
export const MODULES: { label: string; href: string | null; icon: ModuleIcon }[] = [
  { label: "Overview", href: "/", icon: "home" },
  { label: "FIR", href: "/fir", icon: "fir" },
  { label: "Hotspots", href: null, icon: "map" },
  { label: "Settings", href: "/settings", icon: "settings" },
];

// lucide-style outlines, 24x24
export const MODULE_ICON: Record<ModuleIcon, string> = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9.5z",
  fir: "M7 3h7l4 4v14H7V3zm7 0v4h4M10 12h5m-5 4h5",
  map: "M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6 9 4zm0 0v14m6-12v14",
  settings:
    "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm7.4-2.1 1.6 1.2-1.8 3.1-1.9-.7a7 7 0 0 1-1.7 1l-.3 2h-3.6l-.3-2a7 7 0 0 1-1.7-1l-1.9.700-1.800-3.1 1.600-1.200a7 7 0 0 1 0-2l-1.600-1.200 1.800-3.1 1.9.7a7 7 0 0 1 1.7-1l.3-2h3.6l.3 2a7 7 0 0 1 1.7 1l1.9-.7 1.800 3.1-1.600 1.200a7 7 0 0 1 0 2z",
};

/** The shell keeps its session in localStorage under this key (portal/src/state/store.tsx). */
const SESSION_KEY = "netra.state.v3";

/** True when an officer is signed in to the platform in this browser. */
export function signedIn(): boolean {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return !!raw && JSON.parse(raw).signedIn === true;
  } catch {
    return false;
  }
}
