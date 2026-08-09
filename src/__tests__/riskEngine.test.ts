import { describe, expect, it } from "vitest";
import { buildRiskSnapshot, normalizeWarningData } from "../lib/riskEngine";

describe("normalizeWarningData", () => {
  it("normalizes null, object, and array hazard shapes from CWA W-C0033-001", () => {
    const warnings = normalizeWarningData({
      cwaopendata: {
        sent: "2026-05-29T23:02:02+08:00",
        dataset: {
          location: [
            { locationName: "臺北市", geocode: "63", hazardConditions: null },
            {
              locationName: "基隆市",
              geocode: "10017",
              hazardConditions: {
                hazards: {
                  info: { phenomena: "陸上強風", significance: "特報" },
                  validTime: {
                    startTime: "2026-05-29T22:17:00+08:00",
                    endTime: "2026-05-30T23:00:00+08:00",
                  },
                },
              },
            },
            {
              locationName: "花蓮縣",
              geocode: "10015",
              hazardConditions: {
                hazards: [
                  {
                    info: { phenomena: "豪雨", significance: "特報" },
                    validTime: {
                      startTime: "2026-05-29T22:41:00+08:00",
                      endTime: "2026-05-30T05:00:00+08:00",
                    },
                    hazard: {
                      info: {
                        phenomena: "大雨",
                        affectedAreas: {
                          location: [{ locationName: "山區" }, { locationName: "平地" }],
                        },
                      },
                    },
                  },
                ],
              },
            },
          ],
        },
      },
    });

    expect(warnings).toEqual([
      {
        countyName: "基隆市",
        geocode: "10017",
        phenomena: "陸上強風",
        significance: "特報",
        startTime: "2026-05-29T22:17:00+08:00",
        endTime: "2026-05-30T23:00:00+08:00",
        affectedAreas: [],
      },
      {
        countyName: "花蓮縣",
        geocode: "10015",
        phenomena: "豪雨",
        significance: "特報",
        startTime: "2026-05-29T22:41:00+08:00",
        endTime: "2026-05-30T05:00:00+08:00",
        affectedAreas: ["山區", "平地"],
      },
    ]);
  });
});

describe("buildRiskSnapshot", () => {
  it("prioritizes county warnings and observed rain/wind into a national risk answer", () => {
    const snapshot = buildRiskSnapshot({
      generatedAt: "2026-05-30T00:30:00+08:00",
      warnings: [
        {
          countyName: "花蓮縣",
          geocode: "10015",
          phenomena: "豪雨",
          significance: "特報",
          startTime: "2026-05-29T22:41:00+08:00",
          endTime: "2026-05-30T05:00:00+08:00",
          affectedAreas: ["山區", "平地"],
        },
        {
          countyName: "基隆市",
          geocode: "10017",
          phenomena: "陸上強風",
          significance: "特報",
          startTime: "2026-05-29T22:17:00+08:00",
          endTime: "2026-05-30T23:00:00+08:00",
          affectedAreas: [],
        },
      ],
      rainfallStations: [
        {
          countyName: "花蓮縣",
          stationName: "秀林",
          observedAt: "2026-05-30T00:10:00+08:00",
          past1h: 42,
          past3h: 92,
          past24h: 218,
        },
        {
          countyName: "臺北市",
          stationName: "信義",
          observedAt: "2026-05-30T00:10:00+08:00",
          past1h: 0,
          past3h: 0,
          past24h: 0,
        },
      ],
      weatherStations: [
        {
          countyName: "基隆市",
          stationName: "基隆",
          observedAt: "2026-05-30T00:00:00+08:00",
          temperature: 24.4,
          windSpeed: 12.5,
          gustSpeed: 18.2,
        },
      ],
      earthquake: {
        occurredAt: "2026-05-29T23:50:00+08:00",
        magnitude: 4.9,
        depthKm: 22.3,
        description: "臺灣東部海域有感地震",
        countyIntensities: [{ countyName: "花蓮縣", maxIntensity: 3 }],
      },
      typhoon: {
        name: "JANGMI",
        localName: "薔蜜",
        latestAt: "2026-05-29T21:00:00+08:00",
        distanceKmFromTaiwan: 620,
        maxWindSpeed: 28,
      },
    });

    expect(snapshot.national.level).toBe("high");
    expect(snapshot.national.answer).toContain("偏高");
    expect(snapshot.counties[0].countyName).toBe("花蓮縣");
    expect(snapshot.counties[0].level).toBe("high");
    expect(snapshot.counties[0].reasons.join(" ")).toContain("豪雨");
    expect(snapshot.counties[0].reasons.join(" ")).toContain("24小時 218 mm");
    expect(snapshot.attentionToday.some((item) => item.includes("山區"))).toBe(true);
    expect(snapshot.sections.rainfall.maxPast24h?.countyName).toBe("花蓮縣");
    expect(snapshot.sections.wind.maxGust?.countyName).toBe("基隆市");
    expect(snapshot.sections.earthquake.recent).toBe(true);
    expect(snapshot.sections.typhoon.active).toBe(true);
  });

  it("uses only warnings that are effective at the snapshot reference time", () => {
    const snapshot = buildRiskSnapshot({
      generatedAt: "2026-05-30T00:30:00+08:00",
      warnings: [
        {
          countyName: "花蓮縣",
          geocode: "10015",
          phenomena: "豪雨",
          significance: "特報",
          startTime: "2026-05-29T20:00:00+08:00",
          endTime: "2026-05-30T00:29:59+08:00",
          affectedAreas: ["已過期區域"],
        },
        {
          countyName: "基隆市",
          geocode: "10017",
          phenomena: "陸上強風",
          significance: "特報",
          startTime: "2026-05-30T00:30:01+08:00",
          endTime: "2026-05-30T05:00:00+08:00",
          affectedAreas: ["尚未生效區域"],
        },
        {
          countyName: "臺北市",
          geocode: "63",
          phenomena: "豪雨",
          significance: "特報",
          startTime: "2026-05-30T00:00:00+08:00",
          endTime: "2026-05-30T02:00:00+08:00",
          affectedAreas: ["有效區域"],
        },
      ],
      rainfallStations: [],
      weatherStations: [],
      earthquake: null,
      typhoon: null,
    });

    const taipei = snapshot.counties.find((county) => county.countyName === "臺北市");
    const hualien = snapshot.counties.find((county) => county.countyName === "花蓮縣");
    const keelung = snapshot.counties.find((county) => county.countyName === "基隆市");

    expect(snapshot.national.activeWarningCountyCount).toBe(1);
    expect(taipei?.warnings).toHaveLength(1);
    expect(taipei?.score).toBeGreaterThan(0);
    expect(hualien?.warnings).toEqual([]);
    expect(hualien?.score).toBe(0);
    expect(keelung?.warnings).toEqual([]);
    expect(keelung?.score).toBe(0);
    expect(snapshot.attentionToday.join(" ")).toContain("有效區域");
    expect(snapshot.attentionToday.join(" ")).not.toContain("已過期區域");
    expect(snapshot.attentionToday.join(" ")).not.toContain("尚未生效區域");
  });

  it("keeps recent earthquake and tropical-cyclone records out of risk scoring and attention", () => {
    const snapshot = buildRiskSnapshot({
      generatedAt: "2026-05-30T00:30:00+08:00",
      warnings: [],
      rainfallStations: [],
      weatherStations: [],
      earthquake: {
        occurredAt: "2026-05-29T23:50:00+08:00",
        magnitude: 6.1,
        depthKm: 12,
        description: "測試用顯著有感地震",
        countyIntensities: [{ countyName: "花蓮縣", maxIntensity: 6 }],
      },
      typhoon: {
        name: "TEST",
        localName: "測試颱風",
        latestAt: "2026-05-30T00:00:00+08:00",
        distanceKmFromTaiwan: 50,
        maxWindSpeed: 55,
      },
    });

    expect(snapshot.national.level).toBe("safe");
    expect(snapshot.national.score).toBe(0);
    expect(snapshot.counties.every((county) => county.score === 0)).toBe(true);
    expect(snapshot.counties.every((county) => county.reasons.length === 0)).toBe(true);
    expect(snapshot.counties.every((county) => county.metrics.earthquakeIntensity === undefined)).toBe(true);
    expect(snapshot.attentionToday.join(" ")).not.toMatch(/地震|熱帶氣旋|颱風/);
    expect(snapshot.sections.earthquake.recent).toBe(true);
    expect(snapshot.sections.earthquake.signal?.magnitude).toBe(6.1);
    expect(snapshot.sections.typhoon.active).toBe(true);
    expect(snapshot.sections.typhoon.signal?.localName).toBe("測試颱風");
  });
});
