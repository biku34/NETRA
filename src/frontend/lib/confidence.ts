import type { Driver } from "./types";

export type Confidence = "low" | "medium" | "high";

// Ring 1 heuristic: probability + strength of the top driver.
// (Ring 2 lets Bob state its own confidence in prose.)
export function confidenceFor(
  probability: number,
  drivers: Driver[]
): Confidence {
  const topAbs = drivers.length
    ? Math.max(...drivers.map((d) => Math.abs(d.contribution)))
    : 0;
  if (probability >= 0.7 && topAbs >= 1.0) return "high";
  if (probability >= 0.4) return "medium";
  return "low";
}
