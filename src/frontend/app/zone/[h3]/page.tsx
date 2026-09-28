"use client";

import { useParams } from "next/navigation";
import { useZone } from "@/hooks/usePredictions";
import ZoneDetail from "@/components/ZoneDetail";
import PageChrome from "@/components/PageChrome";

export default function ZonePage() {
  const params = useParams<{ h3: string }>();
  const h3 = params?.h3 ?? null;
  const { data, isLoading, error } = useZone(h3);

  return (
    <div className="min-h-screen pb-16 lg:pb-0 lg:pl-60">
      <PageChrome crumb="Zone intelligence" />
      {isLoading && (
        <div className="mx-auto w-full max-w-[1920px] px-5 py-5">
          <div className="skeleton h-12 w-80 rounded-xl" />
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="skeleton h-[92px] rounded-xl" />
            ))}
          </div>
          <div className="mt-3 grid grid-cols-12 gap-3">
            <div className="skeleton col-span-12 h-[360px] rounded-xl lg:col-span-6 2xl:col-span-4" />
            <div className="skeleton col-span-12 h-[360px] rounded-xl lg:col-span-6 2xl:col-span-5" />
            <div className="skeleton col-span-12 h-[360px] rounded-xl 2xl:col-span-3" />
          </div>
        </div>
      )}
      {error && (
        <div className="mx-auto max-w-4xl px-5 py-10">
          <div className="card p-5 text-sm text-risk-high">
            Could not load this zone. It may have no incidents.
          </div>
        </div>
      )}
      {data && <ZoneDetail zone={data} />}
    </div>
  );
}
