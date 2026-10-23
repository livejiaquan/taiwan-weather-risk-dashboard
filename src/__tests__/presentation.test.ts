import { describe, expect, it } from "vitest";
import type { RiskDashboardLoadResult } from "../lib/cwaClient";
import {
  countyMapStatus,
  dataAgeTier,
  dataTimeLabel,
  minutesSince,
  officialWarningUrl,
  snapshotEffectiveAt,
  warningTone,
  warningViewStateAt,
} from "../lib/presentation";
import { buildRiskSnapshot } from "../lib/riskEngine";
import type { CountyRisk, WeatherWarning } from "../lib/riskEngine";

function warning(phenomena: string, significance: string): WeatherWarning {
  return { countyName: "臺北市", geocode: "63", phenomena, significance, affectedAreas: [] };
}

function county(warnings: WeatherWarning[]): CountyRisk {
  return { countyName: "臺北市", geocode: "63", region: "north", warnings, metrics: {} };
}

describe("map status presentation", () => {
  it("uses CWA's own significance word for tone", () => {
    expect(warningTone(warning("海上陸上颱風", "警報"))).toBe("alarm");
    expect(warningTone(warning("大雨", "特報"))).toBe("advisory");
  });

  it("colours a county by its most severe listed warning", () => {
    expect(countyMapStatus(county([warning("大雨", "特報"), warning("海上陸上颱風", "警報")]), "current")).toBe("alarm");
    expect(countyMapStatus(county([warning("大雨", "特報")]), "current")).toBe("advisory");
    expect(countyMapStatus(county([]), "current")).toBe("calm");
  });

  it("never shows data older than 24 hours or an unavailable source as calm", () => {
    expect(countyMapStatus(county([]), "expired")).toBe("unknown");
    expect(countyMapStatus(county([]), "unavailable")).toBe("unknown");
    expect(countyMapStatus(county([warning("大雨", "特報")]), "unavailable")).toBe("unknown");
    expect(countyMapStatus(county([warning("大雨", "特報")]), "expired")).toBe("advisory");
  });
});

describe("official links and data age", () => {
  it("sends typhoon warnings to the typhoon page rather than the strong-wind page", () => {
    expect(officialWarningUrl(warning("海上陸上颱風", "警報"))).toContain("/Typhoon/");
    expect(officialWarningUrl(warning("陸上強風", "特報"))).toContain("W25");
    expect(officialWarningUrl(warning("豪雨", "特報"))).toContain("W26");
  });

  it("computes minutes since a timestamp and rejects invalid input", () => {
    const now = Date.parse("2026-10-22T07:00:00Z");
    expect(minutesSince("2026-10-22T06:15:00Z", now)).toBe(45);
    expect(minutesSince("not-a-date", now)).toBeNull();
    expect(minutesSince(undefined, now)).toBeNull();
  });
});

describe("data-age bands", () => {
  it("puts each boundary minute in the right band", () => {
    expect(dataAgeTier(0)).toBe("fresh");
    expect(dataAgeTier(90)).toBe("fresh");
    expect(dataAgeTier(91)).toBe("aging");
    expect(dataAgeTier(360)).toBe("aging");
    expect(dataAgeTier(361)).toBe("old");
    expect(dataAgeTier(1440)).toBe("old");
    expect(dataAgeTier(1441)).toBe("expired");
  });

  const FETCHED = "2026-05-30T00:00:00+08:00";
  function result(coverage: "current" | "cached" | "unavailable", time = FETCHED): RiskDashboardLoadResult {
    return {
      snapshot: null,
      sources: [],
      warnings: {
        coverage,
        currentness: coverage === "unavailable" ? "unknown" : "current",
        fetchedAt: coverage === "current" ? time : "2026-05-30T09:00:00+08:00",
        cacheGeneratedAt: coverage === "cached" ? time : undefined,
      },
      degraded: false,
      fatal: false,
      cacheUsed: coverage === "cached",
    };
  }
  const at = (iso: string) => Date.parse(iso);

  it("keeps live or snapshot data current for 24 hours, measured from the data time", () => {
    expect(warningViewStateAt(result("current"), at("2026-05-30T23:59:00+08:00"))).toBe("current");
    expect(warningViewStateAt(result("current"), at("2026-05-31T00:00:00+08:00"))).toBe("current");
    expect(warningViewStateAt(result("current"), at("2026-05-31T00:01:00+08:00"))).toBe("expired");
    // A snapshot ages from when it was built, not from when the browser fetched it.
    expect(warningViewStateAt(result("cached"), at("2026-05-31T00:01:00+08:00"))).toBe("expired");
    expect(warningViewStateAt(result("unavailable"), at("2026-05-30T00:01:00+08:00"))).toBe("unavailable");
    expect(warningViewStateAt(null, at("2026-05-30T00:01:00+08:00"))).toBe("unavailable");
  });

  it("formats the standard label with clock time and relative age", () => {
    expect(dataTimeLabel(FETCHED, at("2026-05-30T00:05:00+08:00"))).toBe("資料時間 00:00 · 5 分鐘前");
    expect(dataTimeLabel(FETCHED, at("2026-05-30T03:10:00+08:00"))).toBe("資料時間 00:00 · 3 小時前");
    expect(dataTimeLabel(FETCHED, at("2026-05-31T06:00:00+08:00"))).toBe("資料時間 05/30 00:00 · 1 天前");
  });

  it("drops warnings whose own validity has ended and recounts counties", () => {
    const snapshot = buildRiskSnapshot({
      generatedAt: FETCHED,
      warnings: [
        { ...warning("大雨", "特報"), startTime: "2026-05-29T23:00:00+08:00", endTime: "2026-05-30T02:00:00+08:00" },
        { ...warning("大雨", "特報"), countyName: "新北市", geocode: "65", startTime: "2026-05-29T23:00:00+08:00", endTime: "2026-05-30T08:00:00+08:00" },
      ],
      rainfallStations: [],
      weatherStations: [],
    });
    expect(snapshot.national.activeWarningCountyCount).toBe(2);

    const later = snapshotEffectiveAt(snapshot, at("2026-05-30T03:00:00+08:00"));
    expect(later.endedCount).toBe(1);
    expect(later.snapshot.national.activeWarningCountyCount).toBe(1);
    expect(later.snapshot.counties.find((item) => item.countyName === "臺北市")?.warnings).toHaveLength(0);

    const same = snapshotEffectiveAt(snapshot, at("2026-05-30T01:00:00+08:00"));
    expect(same.endedCount).toBe(0);
    expect(same.snapshot).toBe(snapshot);
  });
});
