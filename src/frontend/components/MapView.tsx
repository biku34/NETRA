"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Map, useControl } from "react-map-gl/maplibre";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { H3HexagonLayer } from "@deck.gl/geo-layers";
import type { PickingInfo } from "@deck.gl/core";
import type { PredictZone } from "@/lib/types";
import { useUI } from "@/store/ui";
import { useT } from "@/lib/i18n";
import ZoneHoverCard from "./ZoneHoverCard";

const MAP_STYLE: string =
  (process.env.NEXT_PUBLIC_MAP_STYLE && process.env.NEXT_PUBLIC_MAP_STYLE.trim()) ||
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

const CENTER = (process.env.NEXT_PUBLIC_DISTRICT_CENTER ?? "23.21,72.645")
  .split(",")
  .map(Number);
const ZOOM = Number(process.env.NEXT_PUBLIC_DISTRICT_ZOOM ?? "11.4");

const INITIAL_VIEW_STATE = {
  latitude: CENTER[0],
  longitude: CENTER[1],
  zoom: ZOOM,
  pitch: 0,
  bearing: 0,
};

// Sequential teal -> amber -> red ramp for criticality (0..1).
function colorFor(t: number): [number, number, number] {
  const stops: [number, [number, number, number]][] = [
    [0.0, [196, 226, 208]],
    [0.35, [38, 140, 90]],
    [0.65, [224, 158, 20]],
    [1.0, [180, 35, 24]],
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    const [a, ca] = stops[i];
    const [b, cb] = stops[i + 1];
    if (t <= b) {
      const f = (t - a) / (b - a || 1);
      return [
        Math.round(ca[0] + f * (cb[0] - ca[0])),
        Math.round(ca[1] + f * (cb[1] - ca[1])),
        Math.round(ca[2] + f * (cb[2] - ca[2])),
      ];
    }
  }
  return stops[stops.length - 1][1];
}

type HoverState = { zone: PredictZone; x: number; y: number } | null;

function DeckOverlay({
  zones,
  pinnedHexes,
  onSelect,
  onHover,
}: {
  zones: PredictZone[];
  pinnedHexes: string[];
  onSelect: (h: string | null) => void;
  onHover: (info: PickingInfo) => void;
}) {
  const layers = useMemo(
    () => [
      new H3HexagonLayer<PredictZone>({
        id: "risk",
        data: zones,
        pickable: true,
        filled: true,
        stroked: true,
        extruded: false,
        getHexagon: (d) => d.h3_r8,
        getFillColor: (d) => {
          const [r, g, b] = colorFor(d.risk_score);
          const a = pinnedHexes.includes(d.h3_r8) ? 245 : d.rank ? 225 : 175;
          return [r, g, b, a];
        },
        getLineColor: (d) =>
          pinnedHexes.includes(d.h3_r8)
            ? [23, 33, 47, 255]
            : d.rank
            ? [23, 33, 47, 210]
            : [23, 33, 47, 45],
        getLineWidth: (d) => (pinnedHexes.includes(d.h3_r8) || d.rank ? 2 : 0.6),
        lineWidthUnits: "pixels",
        autoHighlight: true,
        highlightColor: [23, 33, 47, 35],
        onClick: (info: PickingInfo) => {
          const d = info.object as PredictZone | undefined;
          onSelect(d ? d.h3_r8 : null);
        },
        onHover,
        updateTriggers: {
          getFillColor: [pinnedHexes],
          getLineColor: [pinnedHexes],
          getLineWidth: [pinnedHexes],
        },
      }),
    ],
    [zones, pinnedHexes, onSelect, onHover]
  );

  const overlay = useControl(() => new MapboxOverlay({ interleaved: false }));
  overlay.setProps({ layers });
  return null;
}

export default function MapView({ zones = [] }: { zones?: PredictZone[] }) {
  const t = useT();
  const pinnedHexes = useUI((s) => s.pinnedHexes);
  const setSelectedHex = useUI((s) => s.setSelectedHex);
  const unpinHex = useUI((s) => s.unpinHex);
  const [hover, setHover] = useState<HoverState>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // up to two pinned cards, stacked in the order they were clicked
  const pinnedZones = pinnedHexes
    .map((h) => zones.find((z) => z.h3_r8 === h))
    .filter((z): z is PredictZone => !!z);
  const pinnedRef = useRef(false);
  pinnedRef.current = pinnedZones.length > 0;

  const handleHover = useCallback((info: PickingInfo) => {
    if (pinnedRef.current) {
      setHover(null);
      return;
    }
    const d = info.object as PredictZone | undefined;
    if (d) {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setHover({ zone: d, x: info.x, y: info.y });
    } else {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setHover(null), 220);
    }
  }, []);

  const handleSelect = useCallback(
    (h: string | null) => {
      setHover(null);
      setSelectedHex(h);
    },
    [setSelectedHex]
  );

  // Escape unpins
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedHex(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setSelectedHex]);

  return (
    <div className="relative h-full w-full">
      <Map
        initialViewState={INITIAL_VIEW_STATE}
        mapStyle={MAP_STYLE}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        attributionControl={false}
      >
        <DeckOverlay
          zones={zones}
          pinnedHexes={pinnedHexes}
          onSelect={handleSelect}
          onHover={handleHover}
        />
      </Map>

      {/* hint */}
      <div className="pointer-events-none absolute bottom-6 left-1/2 z-10 -translate-x-1/2 animate-fade-in rounded-full border border-line bg-surface/85 px-3.5 py-1.5 text-[11px] text-muted shadow-card backdrop-blur">
        {t("Hover a hex for details")} ·{" "}
        <span className="font-semibold text-ink">{t("click to pin")}</span>
      </div>

      {/* card */}
      {pinnedZones.length > 0 ? (
        <div className="pointer-events-none absolute bottom-4 left-4 top-[88px] z-40 flex flex-col gap-3 overflow-y-auto pr-1">
          {pinnedZones.map((z) => (
            <ZoneHoverCard
              key={z.h3_r8}
              zone={z}
              pinned
              compact={pinnedZones.length > 1}
              onClose={() => unpinHex(z.h3_r8)}
            />
          ))}
        </div>
      ) : (
        hover && (
          <ZoneHoverCard
            zone={hover.zone}
            x={hover.x}
            y={hover.y}
            onEnter={() => {
              if (hideTimer.current) clearTimeout(hideTimer.current);
            }}
            onLeave={() => setHover(null)}
          />
        )
      )}
    </div>
  );
}
