import { describe, expect, it } from "vitest";
import { countyMapStatus, minutesSince, officialWarningUrl, warningTone } from "../lib/presentation";
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

  it("never shows an empty cache or unavailable source as calm", () => {
    expect(countyMapStatus(county([]), "cached")).toBe("unknown");
    expect(countyMapStatus(county([]), "unavailable")).toBe("unknown");
    expect(countyMapStatus(county([warning("大雨", "特報")]), "unavailable")).toBe("unknown");
    expect(countyMapStatus(county([warning("大雨", "特報")]), "cached")).toBe("advisory");
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
