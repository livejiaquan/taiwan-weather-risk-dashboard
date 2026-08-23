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
                    hazard: [
                      { info: { affectedAreas: { location: [{ locationName: "山區" }] } } },
                      { info: { affectedAreas: { location: { locationName: "平地" } } } },
                    ],
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
  it("keeps effective county warnings and observation summaries without legacy risk scores", () => {
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

    expect(snapshot.national).toEqual({ activeWarningCountyCount: 2 });
    expect(snapshot.counties.slice(0, 3).map((county) => county.countyName)).toEqual([
      "基隆市",
      "花蓮縣",
      "臺北市",
    ]);

    const hualien = snapshot.counties.find((county) => county.countyName === "花蓮縣");
    if (!hualien) throw new Error("Expected 花蓮縣 county snapshot");
    const keelung = snapshot.counties.find((county) => county.countyName === "基隆市");
    if (!keelung) throw new Error("Expected 基隆市 county snapshot");
    expect(hualien.warnings).toEqual([
      expect.objectContaining({ phenomena: "豪雨", affectedAreas: ["山區", "平地"] }),
    ]);
    expect(hualien.metrics).toMatchObject({ maxPast1h: 42, maxPast3h: 92, maxPast24h: 218 });
    expect(keelung.metrics).toMatchObject({ maxTemperature: 24.4, maxWindSpeed: 12.5, maxGustSpeed: 18.2 });
    expect(snapshot.sections.rainfall.maxPast1h).toMatchObject({ countyName: "花蓮縣", value: 42 });
    expect(snapshot.sections.rainfall.maxPast3h).toMatchObject({ countyName: "花蓮縣", value: 92 });
    expect(snapshot.sections.rainfall.maxPast24h).toMatchObject({ countyName: "花蓮縣", value: 218 });
    expect(snapshot.sections.wind.maxGust).toMatchObject({ countyName: "基隆市", value: 18.2 });
    expect(snapshot.sections.wind.maxAverage).toMatchObject({ countyName: "基隆市", value: 12.5 });
    expect(snapshot.sections.temperature.hottest).toMatchObject({ countyName: "基隆市", value: 24.4 });
    expect(snapshot.sections.temperature.coldest).toMatchObject({ countyName: "基隆市", value: 24.4 });
    expect(snapshot.sections.earthquake.recent).toBe(true);
    expect(snapshot.sections.earthquake.signal?.magnitude).toBe(4.9);
    expect(snapshot.sections.typhoon.active).toBe(true);
    expect(snapshot.sections.typhoon.signal?.localName).toBe("薔蜜");
    expect(snapshot).not.toHaveProperty("attentionToday");
    expect(snapshot.national).not.toHaveProperty("level");
    expect(snapshot.national).not.toHaveProperty("score");
    expect(snapshot.national).not.toHaveProperty("answer");
    expect(hualien).not.toHaveProperty("level");
    expect(hualien).not.toHaveProperty("score");
    expect(hualien).not.toHaveProperty("reasons");
    expect(hualien.metrics).not.toHaveProperty("earthquakeIntensity");
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
    expect(snapshot.counties[0].countyName).toBe("臺北市");
    expect(taipei?.warnings).toEqual([
      expect.objectContaining({ phenomena: "豪雨", affectedAreas: ["有效區域"] }),
    ]);
    expect(hualien?.warnings).toEqual([]);
    expect(keelung?.warnings).toEqual([]);
    expect(snapshot.counties.flatMap((county) => county.warnings).map((warning) => warning.affectedAreas)).toEqual([
      ["有效區域"],
    ]);
  });

  it("keeps recent earthquake and tropical-cyclone records as context without legacy risk copy", () => {
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

    expect(snapshot.national).toEqual({ activeWarningCountyCount: 0 });
    expect(snapshot.counties[0].countyName).toBe("基隆市");
    expect(snapshot.sections.earthquake.recent).toBe(true);
    expect(snapshot.sections.earthquake.signal?.magnitude).toBe(6.1);
    expect(snapshot.sections.typhoon.active).toBe(true);
    expect(snapshot.sections.typhoon.signal?.localName).toBe("測試颱風");
    expect(JSON.stringify(snapshot)).not.toMatch(
      /"level"|"score"|"reasons"|"earthquakeIntensity"|"attentionToday"|"answer"|整體天氣風險|風險偏高/,
    );
  });
});
