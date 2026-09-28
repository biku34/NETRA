import type { Confidence } from "@/lib/confidence";

const STYLES: Record<Confidence, string> = {
  high: "border-ok/30 bg-ok/10 text-ok",
  medium: "border-warn/30 bg-warn/10 text-warn",
  low: "border-muted/30 bg-muted/10 text-muted",
};

const DOT: Record<Confidence, string> = {
  high: "bg-ok",
  medium: "bg-warn",
  low: "bg-muted",
};

export default function ConfidenceBadge({ level }: { level: Confidence }) {
  return (
    <span className={`badge gap-1 ${STYLES[level]}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[level]}`} />
      {level}
    </span>
  );
}
