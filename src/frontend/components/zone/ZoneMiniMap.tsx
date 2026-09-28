"use client";

import { useCallback, useMemo, useState } from "react";
import { Map, useControl } from "react-map-gl/maplibre";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { H3HexagonLayer } from "@deck.gl/geo-layers";
import type { PickingInfo } from "@deck.gl/core";
import type { Centroid, PredictZone } from "@/lib/types";

// Same green -> amber -> red criticality ramp as the home map (kept local so the
// zone page doesn't depend on MapView internals).
const STOPS: [number, [number, number, number]][] = [
  [0.0, [196, 226, 208]],
  [0.35, [38, 140, 90]],
  [0.65, [224, 158, 20]],
  [1.0, [180, 35, 24]],
];
function colorFor(t: number): [number, number, number] {
  for (let i = 0; i < STOPS.length - 1; i++) {
    const [a, ca] = STOPS[i];
    const [b, cb] = STOPS[i + 1];
    if (t <= b) {
      const f = (t - a) / (b - a || 1);
      return [0, 1, 2].map((k) => Math.round(ca[k] + f * (cb[k] - ca[k]))) as [
        number,
        number,
        number
      ];
    }
  }
  return STOPS[STOPS.length - 1][1];
}

const MAP_STYLE: string =
  (process.env.NEXT_PUBLIC_MAP_STYLE && process.env.NEXT_PUBLIC_MAP_STYLE.trim()) ||
  "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

function Overlay({
  zones,
  current,
  onSelect,
  onHover,
}: {
  zones: PredictZone[];
  current: string;
  onSelect: (h3: string) => void;
  onHover: (info: PickingInfo) => void;
}) {
  const layers = useMemo(
    () => [
      new H3HexagonLayer<PredictZone>({
        id: "zone-context",
        data: zones,
        pickable: true,
        filled: true,
        stroked: true,
        extruded: false,
        getHexagon: (d) => d.h3_r8,
        getFillColor: (d) => {
          const [r, g, b] = colorFor(d.risk_score);
          return [r, g, b, d.h3_r8 === current ? 235 : 130];
        },
        getLineColor: (d) =>
          d.h3_r8 === current ? [23, 33, 47, 255] : [23, 33, 47, 40],
        getLineWidth: (d) => (d.h3_r8 === current ? 2.5 : 0.5),
        lineWidthUnits: "pixels",
        autoHighlight: true,
        highlightColor: [23, 33, 47, 35],
        onClick: (info: PickingInfo) => {
          const d = info.object as PredictZone | undefined;
          if (d && d.h3_r8 !== current) onSelect(d.h3_r8);
        },
        onHover,
        updateTriggers: {
          getFillColor: [current],
          getLineColor: [current],
          getLineWidth: [current],
        },
      }),
    ],
    [zones, current, onSelect, onHover]
  );
  const overlay = useControl(() => new MapboxOverlay({ interleaved: false }));
  overlay.setProps({ layers });
  return null;
}

export default function ZoneMiniMap({
  zones,
  current,
  centroid,
  onSelect,
}: {
  zones: PredictZone[];
  current: string;
  centroid: Centroid;
  onSelect: (h3: string) => void;
}) {
  const [hover, setHover] = useState<{ zone: PredictZone; x: number; y: number } | null>(null);
  const handleHover = useCallback((info: PickingInfo) => {
    const d = info.object as PredictZone | undefined;
    setHover(d ? { zone: d, x: info.x, y: info.y } : null);
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg">
      <Map
        initialViewState={{
          latitude: centroid.lat,
          longitude: centroid.lng,
          zoom: 12.6,
          pitch: 0,
          bearing: 0,
        }}
        mapStyle={MAP_STYLE}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
        attributionControl={false}
        cursor={hover && hover.zone.h3_r8 !== current ? "pointer" : "grab"}
      >
        <Overlay zones={zones} current={current} onSelect={onSelect} onHover={handleHover} />
      </Map>
      {hover && (
        <div
          className="pointer-events-none absolute z-10 whitespace-nowrap rounded-md border border-line bg-surface px-2.5 py-2 shadow-pop"
          style={{ left: hover.x, top: hover.y, transform: "translate(12px, -50%)" }}
        >
          <div className="text-[10.5px] font-medium text-muted">
            {hover.zone.name ?? hover.zone.h3_r8.slice(0, 10)}
          </div>
          <div className="mt-1 text-[11.5px]">
            <span className="font-semibold text-ink tnum">
              {Math.round(hover.zone.probability * 100)}%
            </span>{" "}
            <span className="text-muted">
              risk{hover.zone.h3_r8 === current ? " · this zone" : " · click to open"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
