import { describe, expect, it } from "vitest";
import type { RiskDashboardLoadResult } from "../lib/cwaClient";
import { buildRiskSnapshot, warningPhaseAt, type WeatherWarning } from "../lib/riskEngine";
import { dashboardAtTime, nextWarningCheckDelay } from "../lib/warningClock";
import { WARNING_MAX_AGE_MS, warningTimeMs } from "../lib/warningTime";

const NOW = "2026-09-30T16:00:00Z";
const warning: WeatherWarning = {
  countyName: "臺北市", geocode: "63", phenomena: "豪雨", significance: "特報",
  startTime: "2026-10-01T00:01:00+08:00", endTime: "2026-10-01T00:02:00+08:00", affectedAreas: ["山區"],
};
function result(): RiskDashboardLoadResult {
  return {
    snapshot: buildRiskSnapshot({ generatedAt: NOW, warnings: [warning], rainfallStations: [], weatherStations: [] }),
    sources: [], warnings: { coverage: "current", currentness: "current", fetchedAt: NOW },
    degraded: false, fatal: false, cacheUsed: false,
  };
}
const taipei = (value: RiskDashboardLoadResult | null) => value?.snapshot?.counties.find((county) => county.countyName === "臺北市");

describe("warning clock contract", () => {
  it("retains published future warnings without counting them as active, then transitions at exact boundaries", () => {
    const original = result();
    const start = Date.parse(warning.startTime!);
    const end = Date.parse(warning.endTime!);
    expect(taipei(original)?.upcomingWarnings).toEqual([warning]);
    expect(original.snapshot?.national.activeWarningCountyCount).toBe(0);
    expect(taipei(dashboardAtTime(original, start - 1))?.warnings).toEqual([]);
    const current = dashboardAtTime(original, start);
    expect(taipei(current)?.warnings).toEqual([warning]);
    expect(taipei(current)?.upcomingWarnings).toEqual([]);
    expect(current?.snapshot?.national.activeWarningCountyCount).toBe(1);
    const expired = dashboardAtTime(original, end);
    expect(taipei(expired)?.warnings).toEqual([]);
    expect(expired?.snapshot?.national.activeWarningCountyCount).toBe(0);
    expect(expired?.snapshot?.generatedAt).toBe(NOW);
    expect(expired?.warnings.fetchedAt).toBe(NOW);
    expect(taipei(original)?.upcomingWarnings).toEqual([warning]);
  });

  it("preserves CWA feed order for multiple active warnings instead of inventing a severity ranking", () => {
    const original = result();
    const wind = { ...warning, phenomena: "陸上強風" };
    const rain = { ...warning, phenomena: "豪雨" };
    original.snapshot = buildRiskSnapshot({ generatedAt: NOW, warnings: [wind, rain], rainfallStations: [], weatherStations: [] });
    const current = dashboardAtTime(original, Date.parse(warning.startTime!));
    expect(taipei(current)?.warnings.map((entry) => entry.phenomena)).toEqual(["陸上強風", "豪雨"]);
  });

  it("bounds both live and cached confirmation to 90 minutes without refreshing timestamps", () => {
    for (const coverage of ["current", "cached"] as const) {
      const original = result();
      original.warnings.coverage = coverage;
      original.warnings.cacheGeneratedAt = NOW;
      expect(dashboardAtTime(original, Date.parse(NOW) + WARNING_MAX_AGE_MS)?.warnings.currentness).toBe("current");
      const stale = dashboardAtTime(original, Date.parse(NOW) + WARNING_MAX_AGE_MS + 1);
      expect(stale?.warnings.currentness).toBe("stale");
      expect(stale?.warnings.coverage).toBe(coverage);
      expect(stale?.degraded).toBe(true);
    }
  });

  it.each([undefined, "", "invalid", "2026-10-01T00:00:00", "2026-09-30T16:00:01Z"])("fails closed for missing, invalid, local-zone or future confirmation %s", (fetchedAt) => {
    const original = result();
    original.warnings.fetchedAt = fetchedAt;
    expect(dashboardAtTime(original, Date.parse(NOW))?.warnings.currentness).toBe("stale");
  });

  it("uses cache creation instead of a recent failed live attempt", () => {
    const original = result();
    original.warnings = { coverage: "cached", currentness: "current", fetchedAt: NOW, cacheGeneratedAt: "2026-09-30T12:00:00Z" };
    expect(dashboardAtTime(original, Date.parse(NOW))?.warnings.currentness).toBe("stale");
  });

  it("does not let a working observation feed repair unavailable or stale warnings", () => {
    const original = result();
    original.warnings = { coverage: "unavailable", currentness: "unknown", fetchedAt: NOW };
    expect(dashboardAtTime(original, Date.parse(NOW))?.warnings.currentness).toBe("unknown");
    original.warnings = { coverage: "current", currentness: "stale", fetchedAt: NOW };
    expect(dashboardAtTime(original, Date.parse(NOW))?.warnings.currentness).toBe("stale");
  });

  it("rejects missing/reversed/invalid and timezone-ambiguous validity windows", () => {
    for (const changed of [
      { startTime: undefined }, { endTime: undefined }, { startTime: "bad" },
      { startTime: "2026-10-01T00:01:00" }, { startTime: warning.endTime },
    ]) expect(warningPhaseAt({ ...warning, ...changed }, NOW)).toBe("invalid");
    expect(warningTimeMs("2026-10-01T00:01:00+08:00")).toBe(warningTimeMs("2026-09-30T16:01:00Z"));
  });

  it("schedules validity transitions and freshness expiration exactly, with bounded clock checks", () => {
    expect(nextWarningCheckDelay(result(), Date.parse(NOW) + 1)).toBe(59_999);
    const empty = result();
    empty.snapshot!.warningTimeline = [];
    expect(nextWarningCheckDelay(empty, Date.parse(NOW) + WARNING_MAX_AGE_MS)).toBe(1);
    expect(nextWarningCheckDelay(empty, Date.parse(NOW) + WARNING_MAX_AGE_MS + 1)).toBe(60_000);
    expect(nextWarningCheckDelay(null, Date.parse(NOW))).toBe(60_000);
  });
});
