"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { portalHref, signedIn } from "@/lib/portal";

// Set NEXT_PUBLIC_PORTAL_GATE=off to open this module without the platform's sign-in.
const GATE = process.env.NEXT_PUBLIC_PORTAL_GATE !== "off";

/** This module sits behind the platform's sign-in: without a session, go to the
 *  shell's login. A convenience for the officer, not a security boundary. */
function PortalGate({ children }: { children: ReactNode }) {
  const [ok, setOk] = useState(!GATE);
  useEffect(() => {
    if (!GATE) return;
    if (signedIn()) setOk(true);
    else window.location.replace(portalHref("/"));
  }, []);
  return ok ? <>{children}</> : null;
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      <PortalGate>{children}</PortalGate>
    </QueryClientProvider>
  );
}
