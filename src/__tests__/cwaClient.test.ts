import { describe, expect, it } from "vitest";
import { loadCachedRiskDashboardData, loadRiskDashboardData } from "../lib/cwaClient";

describe("loadRiskDashboardData", () => {
  it("can load the static cache directly for a fast first paint", async () => {
    const result = await loadCachedRiskDashboardData({
      fetcher: async () =>
        new Response(
          JSON.stringify({
            payloads: {
              generatedAt: "2026-05-30T00:10:00+08:00",
              warningPayload: {
                cwaopendata: {
                  sent: "2026-05-30T00:00:00+08:00",
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
            },
          }),
        ),
      now: () => new Date("2026-05-30T00:30:00+08:00"),
    });

    expect(result).not.toBeNull();
    expect(result?.cacheUsed).toBe(true);
    expect(result?.snapshot?.national.activeWarningCountyCount).toBe(1);
  });

  it("uses a relative static cache URL by default for project Pages deployments", async () => {
    const requestedUrls: string[] = [];

    const result = await loadRiskDashboardData({
      fetcher: async (url) => {
        requestedUrls.push(url);

        if (url !== "data/latest.json") {
          throw new Error("live source unavailable");
        }

        return new Response(
          JSON.stringify({
            payloads: {
              generatedAt: "2026-05-30T00:10:00+08:00",
              warningPayload: null,
              rainfallPayload: { cwaopendata: { dataset: { Station: [] } } },
              weatherPayload: { cwaopendata: { dataset: { Station: [] } } },
              earthquakePayload: null,
              typhoonPayload: null,
            },
          }),
        );
      },
      now: () => new Date("2026-05-30T00:30:00+08:00"),
    });

    expect(requestedUrls).toContain("data/latest.json");
    expect(requestedUrls).not.toContain("/data/latest.json");
    expect(result.cacheUsed).toBe(true);
    expect(result.fatal).toBe(false);
  });

  it("returns a degraded snapshot when one official source fails but warning data succeeds", async () => {
    const fetcher = async (url: string) => {
      if (url.includes("O-A0002-001")) {
        throw new Error("rain source unavailable");
      }

      return new Response(
        JSON.stringify(
          url.includes("W-C0033-001")
            ? {
                cwaopendata: {
                  sent: "2026-05-30T00:00:00+08:00",
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
              }
            : { cwaopendata: { dataset: { Station: [] } } },
        ),
        { status: 200 },
      );
    };

    const result = await loadRiskDashboardData({
      fetcher,
      now: () => new Date("2026-05-30T00:30:00+08:00"),
    });

    expect(result.degraded).toBe(true);
    expect(result.fatal).toBe(false);
    expect(result.snapshot).not.toBeNull();
    const snapshot = result.snapshot!;
    expect(snapshot.national.level).toBe("elevated");
    expect(snapshot.national.activeWarningCountyCount).toBe(1);
    expect(result.sources.find((source) => source.key === "warnings")?.status).toBe("success");
    expect(result.sources.find((source) => source.key === "rainfall")?.status).toBe("error");
  });

  it("marks the load as fatal when every official source fails and no cache is available", async () => {
    const result = await loadRiskDashboardData({
      fetcher: async () => {
        throw new Error("network down");
      },
      now: () => new Date("2026-05-30T00:30:00+08:00"),
      cacheUrl: null,
    });

    expect(result.fatal).toBe(true);
    expect(result.degraded).toBe(true);
    expect(result.snapshot).toBeNull();
    expect(result.sources.every((source) => source.status === "error")).toBe(true);
  });
});
