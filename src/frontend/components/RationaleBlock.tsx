import type { Driver } from "@/lib/types";

export default function RationaleBlock({
  drivers,
  max = 4,
}: {
  drivers: Driver[];
  max?: number;
}) {
  const shown = drivers.filter((d) => d.contribution !== 0).slice(0, max);
  const list = shown.length ? shown : drivers.slice(0, max);
  return (
    <div className="flex flex-wrap gap-1.5">
      {list.map((d) => {
        const up = d.direction === "up";
        return (
          <span
            key={d.name}
            style={{ borderColor: up ? "rgba(180,35,24,0.4)" : "rgba(11,107,58,0.4)" }}
            className="inline-flex items-center gap-1 rounded-md border bg-surface-3 px-2 py-0.5 text-[11px]"
            title={`contribution ${d.contribution >= 0 ? "+" : ""}${d.contribution}`}
          >
            <span className={up ? "text-risk-high" : "text-ok"}>
              {up ? "▲" : "▼"}
            </span>
            <span className="text-ink">{d.label}</span>
            <span className="font-mono text-[10px] text-muted tnum">{d.value}</span>
          </span>
        );
      })}
    </div>
  );
}
