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
});
