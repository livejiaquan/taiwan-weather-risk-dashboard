import { describe, expect, it } from "vitest";
import { loadCachedRiskDashboardData, loadRiskDashboardData } from "../lib/cwaClient";
import { COUNTIES, normalizeWarningData } from "../lib/riskEngine";

function warningPayloadWithLocations(location: unknown, sent = "2026-05-30T00:00:00+08:00") {
  return {
    cwaopendata: {
      sent,
      dataset: { location },
    },
  };
}

function completeWarningLocations(hazardConditionsByCounty: Record<string, unknown> = {}) {
  return COUNTIES.map(({ countyName, geocode }) => ({
    locationName: countyName,
    geocode,
    hazardConditions: hazardConditionsByCounty[countyName] ?? null,
  }));
}

function completeWarningPayload(
  sent = "2026-05-30T00:00:00+08:00",
  hazardConditionsByCounty: Record<string, unknown> = {},
) {
  return warningPayloadWithLocations(completeWarningLocations(hazardConditionsByCounty), sent);
}

function heavyRainHazard(startTime: string, endTime: string, affectedAreas?: string[]) {
  const affectedLocations = affectedAreas?.map((locationName) => ({ locationName }));

  return {
    hazards: {
      info: { phenomena: "豪雨", significance: "特報" },
      validTime: { startTime, endTime },
      ...(affectedLocations
        ? {
            hazard: {
              info: {
                affectedAreas: {
                  location: affectedLocations.length === 1 ? affectedLocations[0] : affectedLocations,
                },
              },
            },
          }
        : {}),
    },
  };
}

function validPayloadFor(url: string) {
  if (url.includes("W-C0033-001")) {
    return completeWarningPayload("2026-05-20T00:00:00+08:00");
  }
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

describe("warning payload parser contract", () => {
  it("still normalizes a single location object without treating it as a complete feed", () => {
    expect(COUNTIES).toHaveLength(22);
    const payload = warningPayloadWithLocations({
      locationName: "花蓮縣",
      geocode: "10015",
      hazardConditions: heavyRainHazard(
        "2026-05-29T22:41:00+08:00",
        "2026-05-30T05:00:00+08:00",
        ["花蓮縣山區"],
      ),
    });

    expect(normalizeWarningData(payload)).toEqual([
      expect.objectContaining({ countyName: "花蓮縣", affectedAreas: ["花蓮縣山區"] }),
    ]);
  });
});

describe("loadRiskDashboardData", () => {
  it("can load the static cache directly for a fast first paint", async () => {
    const result = await loadCachedRiskDashboardData({
      fetcher: async () =>
        new Response(
          JSON.stringify({
            payloads: {
              generatedAt: "2026-05-30T00:10:00+08:00",
              warningPayload: completeWarningPayload("2026-05-30T00:00:00+08:00", {
                花蓮縣: heavyRainHazard(
                  "2026-05-29T22:41:00+08:00",
                  "2026-05-30T05:00:00+08:00",
                  ["花蓮縣山區", "花蓮縣低窪地區"],
                ),
              }),
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
    expect(result?.warnings).toMatchObject({
      coverage: "cached",
      currentness: "current",
      cacheGeneratedAt: "2026-05-30T00:10:00+08:00",
    });
    expect(result?.sources.find((source) => source.key === "warnings")).toMatchObject({
      provenance: "cache",
      cacheGeneratedAt: "2026-05-30T00:10:00+08:00",
    });
  });

  it("rejects a stale direct cache using top-level generatedAt as the authority", async () => {
    const result = await loadCachedRiskDashboardData({
      fetcher: async () =>
        new Response(
          JSON.stringify({
            generatedAt: "2026-05-29T22:00:00+08:00",
            payloads: {
              generatedAt: "2026-05-30T00:20:00+08:00",
              warningPayload: completeWarningPayload("2026-05-30T00:15:00+08:00"),
              rainfallPayload: null,
              weatherPayload: null,
              earthquakePayload: null,
              typhoonPayload: null,
            },
          }),
        ),
      now: () => new Date("2026-05-30T00:30:00+08:00"),
    });

    expect(result).toBeNull();
  });

  it("labels a cached feed with no effective warnings as cached rather than a current no-warning confirmation", async () => {
    const result = await loadCachedRiskDashboardData({
      fetcher: async () =>
        new Response(
          JSON.stringify({
            generatedAt: "2026-05-30T00:10:00+08:00",
            payloads: {
              generatedAt: "2026-05-30T00:10:00+08:00",
              warningPayload: completeWarningPayload("2026-05-30T00:05:00+08:00", {
                花蓮縣: heavyRainHazard("2026-05-29T22:00:00+08:00", "2026-05-30T00:20:00+08:00"),
              }),
              rainfallPayload: null,
              weatherPayload: null,
              earthquakePayload: null,
              typhoonPayload: null,
            },
          }),
        ),
      now: () => new Date("2026-05-30T00:30:00+08:00"),
    });

    expect(result?.snapshot?.national.activeWarningCountyCount).toBe(0);
    expect(result?.warnings.coverage).toBe("cached");
    expect(result?.warnings.coverage).not.toBe("current");
  });

  it("uses fresh cache generation time for warning currentness even when sent is old", async () => {
    const result = await loadCachedRiskDashboardData({
      fetcher: async () =>
        new Response(
          JSON.stringify({
            generatedAt: "2026-05-30T00:10:00+08:00",
            payloads: {
              generatedAt: "2026-05-30T00:10:00+08:00",
              warningPayload: completeWarningPayload("2026-05-20T00:00:00+08:00"),
              rainfallPayload: null,
              weatherPayload: null,
              earthquakePayload: null,
              typhoonPayload: null,
            },
          }),
        ),
      now: () => new Date("2026-05-30T00:30:00+08:00"),
    });

    expect(result?.sources.find((source) => source.key === "warnings")).toMatchObject({
      provenance: "cache",
      updatedAt: "2026-05-20T00:00:00+08:00",
      stale: false,
      cacheGeneratedAt: "2026-05-30T00:10:00+08:00",
    });
    expect(result?.warnings).toMatchObject({
      coverage: "cached",
      currentness: "current",
      sourceUpdatedAt: "2026-05-20T00:00:00+08:00",
    });
  });

  it("does not expose an invalid cached warning payload as cached coverage", async () => {
    const completeLocations = completeWarningLocations();
    const invalidCachedWarningPayloads = [
      warningPayloadWithLocations(completeLocations.slice(0, -1), "2026-05-30T00:05:00+08:00"),
      warningPayloadWithLocations(
        completeLocations.map((location, index) =>
          index === 0 ? { ...location, hazardConditions: { unexpected: true } } : location,
        ),
        "2026-05-30T00:05:00+08:00",
      ),
    ];

    for (const warningPayload of invalidCachedWarningPayloads) {
      const result = await loadCachedRiskDashboardData({
        fetcher: async () =>
          new Response(
            JSON.stringify({
              generatedAt: "2026-05-30T00:10:00+08:00",
              payloads: {
                generatedAt: "2026-05-30T00:10:00+08:00",
                warningPayload,
                rainfallPayload: { cwaopendata: { dataset: { Station: [] } } },
                weatherPayload: null,
                earthquakePayload: null,
                typhoonPayload: null,
              },
            }),
          ),
        now: () => new Date("2026-05-30T00:30:00+08:00"),
      });

      expect(result).not.toBeNull();
      expect(result?.snapshot?.national.activeWarningCountyCount).toBe(0);
      expect(result?.sources.find((source) => source.key === "warnings")).toMatchObject({
        status: "error",
        provenance: "none",
        stale: true,
      });
      expect(result?.warnings).toEqual({ coverage: "unavailable", currentness: "unknown" });
    }
  });

  it("uses a relative static cache URL by default for project Pages deployments", async () => {
    const requests: Array<{ url: string; cache: string | undefined }> = [];

    const result = await loadRiskDashboardData({
      fetcher: async (url, init) => {
        requests.push({ url, cache: init?.cache });

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

    expect(requests.map(({ url }) => url)).toContain("data/latest.json");
    expect(requests.map(({ url }) => url)).not.toContain("/data/latest.json");
    expect(requests.some(({ url }) => url !== "data/latest.json")).toBe(true);
    expect(requests.every(({ cache }) => cache === "no-store")).toBe(true);
    expect(result.cacheUsed).toBe(true);
    expect(result.fatal).toBe(false);
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
    expect(result.warnings).toMatchObject({ coverage: "current", currentness: "current" });
  });

  it("treats a schema-valid live warning response as current even when sent is old", async () => {
    const result = await loadRiskDashboardData({
      fetcher: async (url) => {
        if (url.includes("W-C0033-001")) {
          return new Response(JSON.stringify(completeWarningPayload("2026-05-20T00:00:00+08:00")));
        }
        return new Response(JSON.stringify(validPayloadFor(url)));
      },
      now: () => new Date("2026-05-30T00:30:00+08:00"),
      cacheUrl: null,
    });

    expect(result.sources.find((source) => source.key === "warnings")).toMatchObject({
      status: "success",
      provenance: "live",
      updatedAt: "2026-05-20T00:00:00+08:00",
      stale: false,
    });
    expect(result.warnings).toMatchObject({
      coverage: "current",
      currentness: "current",
      sourceUpdatedAt: "2026-05-20T00:00:00+08:00",
    });
  });

  it("rejects HTTP 200 warning payloads that are malformed or do not cover all 22 counties", async () => {
    const completeLocations = completeWarningLocations();
    const invalidWarningPayloads = [
      {
        cwaopendata: {
          sent: "2026-05-30T00:00:00+08:00",
          dataset: { Station: [] },
        },
      },
      warningPayloadWithLocations(completeLocations, "not-a-date"),
      warningPayloadWithLocations("not-a-location-collection"),
      warningPayloadWithLocations([1]),
      warningPayloadWithLocations(null),
      warningPayloadWithLocations([]),
      warningPayloadWithLocations(completeLocations[0]),
      warningPayloadWithLocations(completeLocations.slice(0, -1)),
      warningPayloadWithLocations([...completeLocations.slice(0, -1), completeLocations[0]]),
      warningPayloadWithLocations(
        completeLocations.map((location, index) =>
          index === 0 ? { ...location, geocode: "99999" } : location,
        ),
      ),
      warningPayloadWithLocations(
        completeLocations.map((location, index) =>
          index === 0 ? { ...location, locationName: ` ${location.locationName}` } : location,
        ),
      ),
      warningPayloadWithLocations([
        ...completeLocations.slice(1),
        { locationName: "未知縣市", geocode: "99999", hazardConditions: null },
      ]),
      warningPayloadWithLocations(
        completeLocations.map(({ locationName, geocode }) => ({ locationName, geocode })),
      ),
      warningPayloadWithLocations(
        completeLocations.map((location, index) =>
          index === 0 ? { ...location, hazardConditions: { unexpected: true } } : location,
        ),
      ),
      warningPayloadWithLocations(
        completeLocations.map((location, index) =>
          index === 0 ? { ...location, hazardConditions: { hazards: [] } } : location,
        ),
      ),
      warningPayloadWithLocations(
        completeLocations.map((location, index) =>
          index === 0
            ? {
                ...location,
                hazardConditions: {
                  hazards: {
                    info: { phenomena: " ", significance: "特報" },
                    validTime: {
                      startTime: "2026-05-29T22:41:00+08:00",
                      endTime: "2026-05-30T05:00:00+08:00",
                    },
                  },
                },
              }
            : location,
        ),
      ),
      warningPayloadWithLocations(
        completeLocations.map((location, index) =>
          index === 0
            ? {
                ...location,
                hazardConditions: {
                  hazards: {
                    info: { phenomena: "豪雨", significance: "特報" },
                    validTime: {
                      startTime: "2026-05-29T22:41:00+08:00",
                      endTime: "not-a-date",
                    },
                  },
                },
              }
            : location,
        ),
      ),
      warningPayloadWithLocations(
        completeLocations.map((location, index) =>
          index === 0
            ? {
                ...location,
                hazardConditions: {
                  hazards: {
                    info: { phenomena: "豪雨", significance: "特報" },
                    validTime: { startTime: "2026-05-29T22:41:00+08:00" },
                  },
                },
              }
            : location,
        ),
      ),
      warningPayloadWithLocations(
        completeLocations.map((location, index) =>
          index === 0
            ? {
                ...location,
                hazardConditions: {
                  hazards: {
                    info: { phenomena: "豪雨", significance: "特報" },
                    validTime: {
                      startTime: "2026-05-30T05:00:00+08:00",
                      endTime: "2026-05-30T05:00:00+08:00",
                    },
                  },
                },
              }
            : location,
        ),
      ),
      warningPayloadWithLocations(
        completeLocations.map((location, index) =>
          index === 0
            ? {
                ...location,
                hazardConditions: {
                  hazards: {
                    info: { phenomena: "豪雨", significance: "特報" },
                    validTime: {
                      startTime: "2026-05-29T22:41:00+08:00",
                      endTime: "2026-05-30T05:00:00+08:00",
                    },
                    hazard: { unexpected: true },
                  },
                },
              }
            : location,
        ),
      ),
      warningPayloadWithLocations(
        completeLocations.map((location, index) =>
          index === 0
            ? {
                ...location,
                hazardConditions: {
                  hazards: {
                    info: { phenomena: "豪雨", significance: "特報" },
                    validTime: {
                      startTime: "2026-05-29T22:41:00+08:00",
                      endTime: "2026-05-30T05:00:00+08:00",
                    },
                    hazard: {
                      info: {
                        affectedAreas: { location: [{ unexpected: true }] },
                      },
                    },
                  },
                },
              }
            : location,
        ),
      ),
    ];

    for (const warningPayload of invalidWarningPayloads) {
      const result = await loadRiskDashboardData({
        fetcher: async (url) =>
          new Response(JSON.stringify(url.includes("W-C0033-001") ? warningPayload : validPayloadFor(url))),
        now: () => new Date("2026-05-30T00:30:00+08:00"),
        cacheUrl: null,
      });

      expect(result.fatal).toBe(false);
      expect(result.snapshot?.national.activeWarningCountyCount).toBe(0);
      expect(result.sources.find((source) => source.key === "warnings")).toMatchObject({
        status: "error",
        provenance: "none",
        stale: true,
        error: "Invalid warning payload schema",
      });
      expect(result.warnings.coverage).toBe("unavailable");
      expect(result.warnings.currentness).toBe("unknown");
    }
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
          return new Response(JSON.stringify(completeWarningPayload()));
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
            ? completeWarningPayload("2026-05-30T00:00:00+08:00", {
                花蓮縣: heavyRainHazard("2026-05-29T22:41:00+08:00", "2026-05-30T05:00:00+08:00"),
              })
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
    expect(result.sources.find((source) => source.key === "warnings")?.provenance).toBe("live");
    expect(result.sources.find((source) => source.key === "rainfall")?.status).toBe("error");
    expect(result.warnings.coverage).toBe("current");
  });

  it("fills failed live sources from the static cache without hiding the source error", async () => {
    const requestedUrls: string[] = [];
    const warningPayload = completeWarningPayload("2026-05-30T00:00:00+08:00", {
      花蓮縣: heavyRainHazard("2026-05-29T22:41:00+08:00", "2026-05-30T05:00:00+08:00"),
    });

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
    expect(result.sources.find((source) => source.key === "warnings")).toMatchObject({
      status: "error",
      provenance: "cache",
      updatedAt: "2026-05-30T00:00:00+08:00",
      fetchedAt: "2026-05-29T16:30:00.000Z",
      cacheGeneratedAt: "2026-05-30T00:10:00+08:00",
      error: "warning source unavailable",
    });
    expect(result.warnings).toMatchObject({
      coverage: "cached",
      currentness: "current",
      sourceUpdatedAt: "2026-05-30T00:00:00+08:00",
      cacheGeneratedAt: "2026-05-30T00:10:00+08:00",
    });
  });

  it("does not merge an invalid cached warning payload into a partial live result", async () => {
    const truncatedWarningPayload = warningPayloadWithLocations(
      completeWarningLocations().slice(0, -1),
      "2026-05-30T00:05:00+08:00",
    );
    const result = await loadRiskDashboardData({
      fetcher: async (url) => {
        if (url === "data/latest.json") {
          return new Response(
            JSON.stringify({
              generatedAt: "2026-05-30T00:10:00+08:00",
              payloads: {
                generatedAt: "2026-05-30T00:10:00+08:00",
                warningPayload: truncatedWarningPayload,
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
        return new Response(JSON.stringify(validPayloadFor(url)));
      },
      now: () => new Date("2026-05-30T00:30:00+08:00"),
      retryDelayMs: 0,
    });

    expect(result.cacheUsed).toBe(false);
    expect(result.snapshot?.national.activeWarningCountyCount).toBe(0);
    expect(result.sources.find((source) => source.key === "warnings")).toMatchObject({
      status: "error",
      provenance: "none",
      error: "warning source unavailable",
    });
    expect(result.warnings.coverage).toBe("unavailable");
  });

  it("does not merge a stale cache into a partial live result", async () => {
    const cachedWarningPayload = completeWarningPayload("2026-05-30T00:00:00+08:00", {
      花蓮縣: heavyRainHazard("2026-05-29T22:41:00+08:00", "2026-05-30T05:00:00+08:00"),
    });

    const result = await loadRiskDashboardData({
      fetcher: async (url) => {
        if (url === "data/latest.json") {
          return new Response(
            JSON.stringify({
              generatedAt: "2026-05-29T22:59:59+08:00",
              payloads: {
                generatedAt: "2026-05-30T00:20:00+08:00",
                warningPayload: cachedWarningPayload,
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
        return new Response(JSON.stringify(validPayloadFor(url)));
      },
      now: () => new Date("2026-05-30T00:30:00+08:00"),
      retryDelayMs: 0,
    });

    expect(result.cacheUsed).toBe(false);
    expect(result.snapshot?.national.activeWarningCountyCount).toBe(0);
    expect(result.sources.find((source) => source.key === "warnings")).toMatchObject({
      status: "error",
      provenance: "none",
      error: "warning source unavailable",
    });
    expect(result.sources.find((source) => source.key === "warnings")?.cacheGeneratedAt).toBeUndefined();
    expect(result.warnings).toEqual({
      coverage: "unavailable",
      currentness: "unknown",
      fetchedAt: "2026-05-29T16:30:00.000Z",
    });
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
    expect(result.sources.every((source) => source.provenance === "none")).toBe(true);
    expect(result.warnings.coverage).toBe("unavailable");
  });
});
