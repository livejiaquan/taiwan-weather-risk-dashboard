import { describe, expect, it } from "vitest";
import {
  createRiskInputFromCwaPayloads,
  normalizeEarthquakeData,
  normalizeRainfallData,
  normalizeTyphoonData,
  normalizeWeatherStationData,
} from "../lib/cwaAdapter";

describe("CWA observation adapters", () => {
  it("normalizes rainfall stations and ignores CWA missing-value codes", () => {
    const stations = normalizeRainfallData({
      cwaopendata: {
        dataset: {
          Station: [
            {
              StationName: "秀林",
              ObsTime: { DateTime: "2026-05-30T00:10:00+08:00" },
              GeoInfo: { CountyName: "花蓮縣" },
              RainfallElement: {
                Past1hr: { Precipitation: "42.0" },
                Past3hr: { Precipitation: "T" },
                Past24hr: { Precipitation: "-99" },
              },
            },
          ],
        },
      },
    });

    expect(stations).toEqual([
      {
        countyName: "花蓮縣",
        stationName: "秀林",
        observedAt: "2026-05-30T00:10:00+08:00",
        past1h: 42,
        past3h: 0,
        past24h: undefined,
      },
    ]);
  });

  it("normalizes temperature, wind speed, and gust speed from weather stations", () => {
    const stations = normalizeWeatherStationData({
      cwaopendata: {
        dataset: {
          Station: [
            {
              StationName: "基隆",
              ObsTime: { DateTime: "2026-05-30T00:00:00+08:00" },
              GeoInfo: { CountyName: "基隆市" },
              WeatherElement: {
                AirTemperature: "24.4",
                WindSpeed: "12.5",
                GustInfo: { PeakGustSpeed: "18.2" },
              },
            },
          ],
        },
      },
    });

    expect(stations[0]).toMatchObject({
      countyName: "基隆市",
      stationName: "基隆",
      observedAt: "2026-05-30T00:00:00+08:00",
      temperature: 24.4,
      windSpeed: 12.5,
      gustSpeed: 18.2,
    });
  });
});

describe("CWA hazard adapters", () => {
  it("normalizes county earthquake intensity from E-A0015-005", () => {
    const earthquake = normalizeEarthquakeData({
      cwaopendata: {
        sent: "2026-05-20T20:33:51+08:00",
        Earthquake: {
          Description: "05/20-20:25臺灣地區發生有感地震",
          OriginTime: "2026-05-20T20:25:34+08:00",
          FocalDepth: "22.3",
          Magnitude: { MagnitudeValue: "4.9" },
          Intensity: {
            County: [
              { CountyName: "花蓮縣", CountyMaxIntensity: "3級" },
              { CountyName: "臺北市", CountyMaxIntensity: "0級" },
            ],
          },
        },
      },
    });

    expect(earthquake).toEqual({
      occurredAt: "2026-05-20T20:25:34+08:00",
      magnitude: 4.9,
      depthKm: 22.3,
      description: "05/20-20:25臺灣地區發生有感地震",
      countyIntensities: [
        { countyName: "花蓮縣", maxIntensity: 3 },
        { countyName: "臺北市", maxIntensity: 0 },
      ],
    });
  });

  it("normalizes active tropical cyclone tracks and estimates distance to Taiwan", () => {
    const typhoon = normalizeTyphoonData({
      cwaopendata: {
        Dataset: {
          TropicalCyclones: {
            TropicalCyclone: {
              TyphoonName: "JANGMI",
              CwaTyphoonName: "薔蜜",
              AnalysisData: {
                Fix: [
                  {
                    DateTime: "2026-05-29T15:00:00+08:00",
                    CoordinateLongitude: "123.0",
                    CoordinateLatitude: "22.2",
                    MaxWindSpeed: "25",
                  },
                  {
                    DateTime: "2026-05-29T21:00:00+08:00",
                    CoordinateLongitude: "121.6",
                    CoordinateLatitude: "23.5",
                    MaxWindSpeed: "28",
                  },
                ],
              },
            },
          },
        },
      },
    });

    expect(typhoon).toMatchObject({
      name: "JANGMI",
      localName: "薔蜜",
      latestAt: "2026-05-29T21:00:00+08:00",
      maxWindSpeed: 28,
    });
    expect(typhoon?.distanceKmFromTaiwan).toBeGreaterThan(0);
    expect(typhoon?.distanceKmFromTaiwan).toBeLessThan(120);
  });
});

describe("createRiskInputFromCwaPayloads", () => {
  it("combines CWA payloads into the risk engine input contract", () => {
    const input = createRiskInputFromCwaPayloads({
      generatedAt: "2026-05-30T00:30:00+08:00",
      warningPayload: {
        cwaopendata: {
          dataset: {
            location: [
              {
                locationName: "花蓮縣",
                geocode: "10015",
                hazardConditions: {
                  hazards: {
                    info: { phenomena: "豪雨", significance: "特報" },
                    validTime: { startTime: "2026-05-29T22:41:00+08:00" },
                  },
                },
              },
            ],
          },
        },
      },
      rainfallPayload: { cwaopendata: { dataset: { Station: [] } } },
      weatherPayload: { cwaopendata: { dataset: { Station: [] } } },
      earthquakePayload: null,
      typhoonPayload: null,
    });

    expect(input.generatedAt).toBe("2026-05-30T00:30:00+08:00");
    expect(input.warnings).toHaveLength(1);
    expect(input.warnings[0].countyName).toBe("花蓮縣");
    expect(input.rainfallStations).toEqual([]);
    expect(input.weatherStations).toEqual([]);
    expect(input.earthquake).toBeNull();
    expect(input.typhoon).toBeNull();
  });
});
