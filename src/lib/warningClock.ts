import type { RiskDashboardLoadResult } from "./cwaClient";
import { reevaluateWarningSnapshot } from "./riskEngine";
import { WARNING_MAX_AGE_MS, warningTimeMs } from "./warningTime";

function confirmationTime(result: RiskDashboardLoadResult): number {
  return warningTimeMs(result.warnings.coverage === "cached"
    ? result.warnings.cacheGeneratedAt
    : result.warnings.fetchedAt);
}

/** Aging never changes provenance or advances the actual retrieval timestamp. */
export function dashboardAtTime(result: RiskDashboardLoadResult | null, now: number): RiskDashboardLoadResult | null {
  if (!result) return null;
  const age = now - confirmationTime(result);
  const hasCurrentConfirmation = Number.isFinite(age) && age >= 0 && age <= WARNING_MAX_AGE_MS;
  const currentness = result.warnings.currentness === "current" && !hasCurrentConfirmation
    ? "stale"
    : result.warnings.currentness;
  return {
    ...result,
    snapshot: result.snapshot && Number.isFinite(now)
      ? reevaluateWarningSnapshot(result.snapshot, new Date(now).toISOString())
      : result.snapshot,
    warnings: { ...result.warnings, currentness },
    sources: result.sources.map((source) => source.key === "warnings" && currentness !== "current"
      ? { ...source, stale: true }
      : source),
    degraded: result.degraded || currentness !== "current",
  };
}

/** Exact validity boundaries, plus a minute heartbeat for clock changes. */
export function nextWarningCheckDelay(result: RiskDashboardLoadResult | null, now: number): number {
  if (!result || !Number.isFinite(now)) return 60_000;
  const boundaries = [
    confirmationTime(result) + WARNING_MAX_AGE_MS + 1,
    ...(result.snapshot?.warningTimeline ?? []).flatMap((warning) => [warningTimeMs(warning.startTime), warningTimeMs(warning.endTime)]),
  ];
  return Math.max(1, Math.min(60_000, ...boundaries.filter((time) => Number.isFinite(time) && time > now).map((time) => time - now)));
}
