import { describe, expect, it } from "vitest";
import { loadCachedRiskDashboardData, loadRiskDashboardData } from "../lib/cwaClient";

function validPayloadFor(url: string) {
  if (url.includes("O-A0002-001")) {
    return {
      cwaopendata: {
        dataset: {
          Station: [
            {
              StationName: "測試站",
              GeoInfo: { CountyName: "臺北市" },
              ObsTime: { DateTime: "2026-05-30T00:20:00+08:00" },
              RainfallElement: { Past1hr: { Precipitation: 0 } },
            },
          ],
        },
      },
    };
  }
  return { cwaopendata: { dataset: { Station: [] } } };
}

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

  it("allows small source clock skew without hiding implausible future observations", async () => {
    const loadRainfallAt = (observedAt: string) =>
      loadRiskDashboardData({
        fetcher: async (url) => {
          const payload = validPayloadFor(url);
          if (url.includes("O-A0002-001")) {
            payload.cwaopendata.dataset.Station[0].ObsTime.DateTime = observedAt;
          }
          return new Response(JSON.stringify(payload));
        },
        now: () => new Date("2026-05-30T00:30:00+08:00"),
        cacheUrl: null,
      });

    const withinTolerance = await loadRainfallAt("2026-05-30T00:33:00+08:00");
    const atTolerance = await loadRainfallAt("2026-05-30T00:35:00.000+08:00");
    const beyondTolerance = await loadRainfallAt("2026-05-30T00:35:00.001+08:00");
    const implausiblyFuture = await loadRainfallAt("2026-05-30T01:00:00+08:00");

    expect(withinTolerance.sources.find((source) => source.key === "rainfall")?.stale).toBe(false);
    expect(atTolerance.sources.find((source) => source.key === "rainfall")?.stale).toBe(false);
    expect(beyondTolerance.sources.find((source) => source.key === "rainfall")?.stale).toBe(true);
    expect(implausiblyFuture.sources.find((source) => source.key === "rainfall")?.status).toBe("success");
    expect(implausiblyFuture.sources.find((source) => source.key === "rainfall")?.stale).toBe(true);
    expect(implausiblyFuture.degraded).toBe(true);
  });

  it("retries a transient live-source failure before falling back to cache", async () => {
    const attempts = new Map<string, number>();

    const result = await loadRiskDashboardData({
      fetcher: async (url) => {
        const attempt = (attempts.get(url) ?? 0) + 1;
        attempts.set(url, attempt);

        if (url.includes("O-A0002-001") && attempt === 1) {
          throw new TypeError("temporary network failure");
        }

        return new Response(JSON.stringify(validPayloadFor(url)));
      },
      now: () => new Date("2026-05-30T00:30:00+08:00"),
      retryDelayMs: 0,
    });

    expect([...attempts.entries()].find(([url]) => url.includes("O-A0002-001"))?.[1]).toBe(2);
    expect(result.sources.find((source) => source.key === "rainfall")?.status).toBe("success");
    expect(result.cacheUsed).toBe(false);
  });

  it("retries a transient HTTP server error", async () => {
    let rainfallAttempts = 0;

    const result = await loadRiskDashboardData({
      fetcher: async (url) => {
        if (url.includes("O-A0002-001")) {
          rainfallAttempts += 1;
          if (rainfallAttempts === 1) return new Response(null, { status: 503 });
        }
        return new Response(JSON.stringify(validPayloadFor(url)));
      },
      now: () => new Date("2026-05-30T00:30:00+08:00"),
      retryDelayMs: 0,
    });

    expect(rainfallAttempts).toBe(2);
    expect(result.sources.find((source) => source.key === "rainfall")?.status).toBe("success");
  });

  it("retries a timed-out live-source request", async () => {
    let rainfallAttempts = 0;

    const result = await loadRiskDashboardData({
      fetcher: async (url, init) => {
        if (url.includes("O-A0002-001")) {
          rainfallAttempts += 1;
          if (rainfallAttempts === 1) {
            return new Promise<Response>((_, reject) => {
              init?.signal?.addEventListener("abort", () => reject(new globalThis.DOMException("Timed out", "AbortError")));
            });
          }
        }
        return new Response(JSON.stringify(validPayloadFor(url)));
      },
      now: () => new Date("2026-05-30T00:30:00+08:00"),
      timeoutMs: 1,
      retryDelayMs: 0,
    });

    expect(rainfallAttempts).toBe(2);
    expect(result.sources.find((source) => source.key === "rainfall")?.status).toBe("success");
  });

  it("rejects rainfall payloads that contain stations but no risk-bearing measurements", async () => {
    const result = await loadRiskDashboardData({
      fetcher: async (url) => {
        if (url.includes("W-C0033-001")) {
          return new Response(
            JSON.stringify({
              cwaopendata: {
                sent: "2026-05-30T00:00:00+08:00",
                dataset: { location: [] },
              },
            }),
          );
        }
        if (url.includes("O-A0002-001")) {
          return new Response(
            JSON.stringify({
              cwaopendata: {
                dataset: {
                  Station: [
                    {
                      StationName: "測試站",
                      GeoInfo: { CountyName: "臺北市" },
                      ObsTime: { DateTime: "2026-05-30T00:20:00+08:00" },
                      RainfallElement: {},
                    },
                  ],
                },
              },
            }),
          );
        }
        throw new Error("source unavailable");
      },
      now: () => new Date("2026-05-30T00:30:00+08:00"),
      cacheUrl: null,
    });

    const rainfall = result.sources.find((source) => source.key === "rainfall");
    expect(rainfall?.status).toBe("error");
    expect(rainfall?.error).toBe("No usable rainfall observations");
    expect(result.degraded).toBe(true);
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

  it("fills failed live sources from the static cache without hiding the source error", async () => {
    const requestedUrls: string[] = [];
    const warningPayload = {
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
    };

    const result = await loadRiskDashboardData({
      fetcher: async (url) => {
        requestedUrls.push(url);
        if (url === "data/latest.json") {
          return new Response(
            JSON.stringify({
              payloads: {
                generatedAt: "2026-05-30T00:10:00+08:00",
                warningPayload,
                rainfallPayload: null,
                weatherPayload: null,
                earthquakePayload: null,
                typhoonPayload: null,
              },
            }),
          );
        }
        if (url.includes("W-C0033-001")) {
          throw new Error("warning source unavailable");
        }
        return new Response(JSON.stringify({ cwaopendata: { dataset: { Station: [] } } }));
      },
      now: () => new Date("2026-05-30T00:30:00+08:00"),
    });

    expect(requestedUrls).toContain("data/latest.json");
    expect(result.cacheUsed).toBe(true);
    expect(result.degraded).toBe(true);
    expect(result.snapshot?.national.activeWarningCountyCount).toBe(1);
    expect(result.sources.find((source) => source.key === "warnings")?.status).toBe("error");
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
