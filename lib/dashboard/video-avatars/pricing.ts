export const DURATION_OPTIONS = [5, 10, 20, 30, 60] as const;
export type VideoDurationSeconds = (typeof DURATION_OPTIONS)[number];

export function isVideoDurationSeconds(value: unknown): value is VideoDurationSeconds {
  return typeof value === "number" && (DURATION_OPTIONS as readonly number[]).includes(value);
}

// Flat per-tier pricing (not linear-per-second) so short test videos aren't
// penalized by a fixed base cost, and long videos aren't punitively cheap.
const CREDIT_COST_BY_DURATION: Record<VideoDurationSeconds, number> = {
  5: 20,
  10: 35,
  20: 60,
  30: 90,
  60: 150,
};

export function computeVideoCreditsCost(durationSeconds: VideoDurationSeconds): number {
  return CREDIT_COST_BY_DURATION[durationSeconds];
}
