// @vitest-environment node

import { readFileSync } from "node:fs";
import { Buffer } from "node:buffer";
import { describe, expect, it, vi } from "vitest";
import {
  main as fetchCwaData,
  validateRainfallPayload,
  validateWarningPayload,
  validateWeatherPayload,
} from "../scripts/fetch-cwa-data";
import { CWA_ENDPOINTS } from "../src/lib/cwaAdapter";
import { COUNTIES } from "../src/lib/riskEngine";
import viteConfig from "../vite.config";

describe("GitHub Pages Vite config", () => {
  it("builds assets under the repository project path", () => {
    expect(viteConfig.base).toBe("/taiwan-weather-risk-dashboard/");
  });
});

describe("GitHub Pages workflow", () => {
  const workflow = readFileSync(".github/workflows/pages.yml", "utf8");

  it("enables Pages before uploading the deployment artifact", () => {
    expect(workflow).toMatch(/uses:\s+actions\/configure-pages@v6/);
    expect(workflow).toMatch(/enablement:\s+true/);
  });

  it("runs the best-effort schedule away from minute zero", () => {
    expect(workflow).toMatch(/best-effort/i);
    expect(workflow).toMatch(/cron:\s+["']17,47 \* \* \* \*["']/);
    expect(workflow).not.toMatch(/cron:\s+["'][^"']*\b0\b[^"']*["']/);
  });

  it("runs lint before tests and the production build", () => {
    const lintIndex = workflow.indexOf("npm run lint");
    const testIndex = workflow.indexOf("npm run test");
    const buildIndex = workflow.indexOf("npm run build");

    expect(lintIndex).toBeGreaterThan(-1);
    expect(lintIndex).toBeLessThan(testIndex);
    expect(lintIndex).toBeLessThan(buildIndex);
  });

  it("bounds the build job instead of relying on the six-hour Actions default", () => {
    expect(workflow).toMatch(/jobs:\s*[\s\S]*?build:\s*[\s\S]*?timeout-minutes:\s*15/);
    expect(workflow).toMatch(/deploy:\s*[\s\S]*?timeout-minutes:\s*10/);
  });
});

function fullWarningLocations(hazardConditionsByCounty: Record<string, unknown> = {}) {
  return COUNTIES.map(({ countyName, geocode }) => ({
    locationName: countyName,
    geocode,
    hazardConditions: hazardConditionsByCounty[countyName] ?? null,
  }));
}

function validHazard(affectedAreaLocations?: unknown) {
  const hazard = {
    info: { phenomena: "豪雨", significance: "特報" },
    validTime: {
      startTime: "2026-08-09T22:00:00+08:00",
      endTime: "2026-08-10T02:00:00+08:00",
    },
  };

  return affectedAreaLocations === undefined
    ? hazard
    : {
        ...hazard,
        hazard: { info: { affectedAreas: { location: affectedAreaLocations } } },
      };
}

function warningPayloadWithHazardConditions(hazardConditions: unknown) {
  return warningPayload(
    fullWarningLocations({ [COUNTIES[0].countyName]: hazardConditions }),
  );
}

const warningPayload = (location: unknown = fullWarningLocations()) => ({
  cwaopendata: {
    sent: "2026-08-09T22:13:01+08:00",
    dataset: { location },
  },
});

const rainfallPayload = {
  cwaopendata: {
    dataset: {
      Station: [
        {
          StationName: "測試雨量站",
          GeoInfo: { CountyName: "臺南市" },
          ObsTime: { DateTime: "2026-08-09T23:00:00+08:00" },
          RainfallElement: { Past1hr: { Precipitation: "0.0" } },
        },
      ],
    },
  },
};

const weatherPayload = {
  cwaopendata: {
    dataset: {
      Station: {
        StationName: "測試氣象站",
        GeoInfo: { CountyName: "高雄市" },
        ObsTime: { DateTime: "2026-08-09T23:00:00+08:00" },
        WeatherElement: { AirTemperature: "28.5", WindSpeed: "X" },
      },
    },
  },
};

describe("CWA cache payload validation", () => {
  it("keeps the tracked fallback warning-only and within its transfer budget", () => {
    const contents = readFileSync("public/data/latest.json", "utf8");
    const cache = JSON.parse(contents) as {
      sources: Array<{ key: string }>;
      payloads: Record<
        "warningPayload" | "rainfallPayload" | "weatherPayload" | "earthquakePayload" | "typhoonPayload",
        unknown
      >;
    };

    expect(() => validateWarningPayload(cache.payloads.warningPayload)).not.toThrow();
    expect(cache.sources.map((source) => source.key)).toEqual(["warnings"]);
    expect(cache.payloads.rainfallPayload).toBeNull();
    expect(cache.payloads.weatherPayload).toBeNull();
    expect(cache.payloads.earthquakePayload).toBeNull();
    expect(cache.payloads.typhoonPayload).toBeNull();
    expect(contents).not.toContain('"Station"');
    expect(Buffer.byteLength(contents)).toBeLessThanOrEqual(64 * 1024);
  });

  it("accepts a complete 22-county warning mirror", () => {
    expect(COUNTIES).toHaveLength(22);
    expect(() => validateWarningPayload(warningPayload())).not.toThrow();
  });

  it("accepts valid object/array hazards and affected-area location polymorphism", () => {
    const objectPayload = warningPayloadWithHazardConditions({
      hazards: validHazard({ locationName: "山區" }),
    });
    const arrayPayload = warningPayloadWithHazardConditions({
      hazards: [
        validHazard([{ locationName: "平地" }, { locationName: "沿海" }]),
      ],
    });

    expect(() => validateWarningPayload(objectPayload)).not.toThrow();
    expect(() => validateWarningPayload(arrayPayload)).not.toThrow();
  });

  it.each([
    ["past", "2020-01-01T00:00:00+08:00", "2020-01-01T01:00:00+08:00"],
    ["future", "2030-01-01T00:00:00+08:00", "2030-01-01T01:00:00+08:00"],
  ])("accepts a schema-valid %s warning window for downstream active filtering", (_label, startTime, endTime) => {
    const hazard = { ...validHazard(), validTime: { startTime, endTime } };
    expect(() =>
      validateWarningPayload(warningPayloadWithHazardConditions({ hazards: hazard })),
    ).not.toThrow();
  });

  it("normalizes an object location before rejecting the incomplete feed", () => {
    expect(() => validateWarningPayload(warningPayload(fullWarningLocations()[0]))).toThrow(
      /cover exactly 22 counties/,
    );
  });

  it.each([
    ["null", null],
    ["empty", []],
    ["subset", fullWarningLocations().slice(0, 21)],
  ])("rejects a %s warning location feed", (_label, location) => {
    expect(() => validateWarningPayload(warningPayload(location))).toThrow(/cover exactly 22 counties/);
  });

  it("rejects duplicate, unknown, and mismatched county identities", () => {
    const complete = fullWarningLocations();
    const duplicate = [...complete.slice(0, -1), { ...complete[0] }];
    const duplicateGeocode = complete.map((location, index) =>
      index === 1 ? { ...location, geocode: complete[0].geocode } : location,
    );
    const unknown = complete.map((location, index) =>
      index === 0 ? { ...location, locationName: "未知縣市" } : location,
    );
    const mismatch = complete.map((location, index) =>
      index === 0 ? { ...location, geocode: "00000" } : location,
    );

    expect(() => validateWarningPayload(warningPayload(duplicate))).toThrow(/duplicate countyName/);
    expect(() => validateWarningPayload(warningPayload(duplicateGeocode))).toThrow(/duplicate geocode/);
    expect(() => validateWarningPayload(warningPayload(unknown))).toThrow(/unknown countyName/);
    expect(() => validateWarningPayload(warningPayload(mismatch))).toThrow(/geocode mismatch/);
  });

  it("rejects non-canonical county identity whitespace instead of normalizing the payload", () => {
    const complete = fullWarningLocations();
    const countyWhitespace = complete.map((location, index) =>
      index === 0 ? { ...location, locationName: ` ${location.locationName}` } : location,
    );
    const geocodeWhitespace = complete.map((location, index) =>
      index === 0 ? { ...location, geocode: `${location.geocode} ` } : location,
    );

    expect(() => validateWarningPayload(warningPayload(countyWhitespace))).toThrow(/unknown countyName/);
    expect(() => validateWarningPayload(warningPayload(geocodeWhitespace))).toThrow(/geocode mismatch/);
  });

  it("requires every county to own hazardConditions", () => {
    const locations: Array<Record<string, unknown>> = fullWarningLocations();
    delete locations[0].hazardConditions;

    expect(() => validateWarningPayload(warningPayload(locations))).toThrow(/hazardConditions is required/);
  });

  it.each([
    ["missing hazards", {}, /hazards is required/],
    ["null hazards", { hazards: null }, /object or non-empty array/],
    ["empty hazards", { hazards: [] }, /object or non-empty array/],
    [
      "malformed hazard item",
      { hazards: [null] },
      /hazards\[0\] must be an object/,
    ],
    [
      "missing hazard info",
      { hazards: { validTime: validHazard().validTime } },
      /info must be an object/,
    ],
    [
      "empty warning identity",
      {
        hazards: {
          ...validHazard(),
          info: { phenomena: "", significance: "特報" },
        },
      },
      /non-empty phenomena and significance/,
    ],
    [
      "invalid validity time",
      {
        hazards: {
          ...validHazard(),
          validTime: { startTime: "not-a-date", endTime: "2026-08-10T02:00:00+08:00" },
        },
      },
      /parseable startTime and endTime/,
    ],
    [
      "missing validity end",
      {
        hazards: {
          ...validHazard(),
          validTime: { startTime: "2026-08-09T22:00:00+08:00" },
        },
      },
      /parseable startTime and endTime/,
    ],
    [
      "reversed validity window",
      {
        hazards: {
          ...validHazard(),
          validTime: {
            startTime: "2026-08-10T02:00:00+08:00",
            endTime: "2026-08-10T02:00:00+08:00",
          },
        },
      },
      /startTime must be before endTime/,
    ],
  ])("rejects %s", (_label, hazardConditions, expected) => {
    expect(() => validateWarningPayload(warningPayloadWithHazardConditions(hazardConditions))).toThrow(
      expected,
    );
  });

  it.each([
    ["non-record hazard detail", { ...validHazard(), hazard: null }],
    ["affectedAreas without location", { ...validHazard(), hazard: { info: { affectedAreas: {} } } }],
    [
      "empty affected-area locations",
      { ...validHazard(), hazard: { info: { affectedAreas: { location: [] } } } },
    ],
    [
      "affected-area location without a name",
      { ...validHazard(), hazard: { info: { affectedAreas: { location: {} } } } },
    ],
  ])("rejects %s", (_label, hazard) => {
    expect(() =>
      validateWarningPayload(warningPayloadWithHazardConditions({ hazards: hazard })),
    ).toThrow();
  });

  it("requires a parseable warning sent time and a location key", () => {
    expect(() =>
      validateWarningPayload({ cwaopendata: { sent: "not-a-date", dataset: { location: null } } }),
    ).toThrow(/sent/);
    expect(() =>
      validateWarningPayload({ cwaopendata: { sent: "2026-08-09T22:13:01+08:00", dataset: {} } }),
    ).toThrow(/location/);
  });

  it("requires at least one timed, usable rainfall observation", () => {
    expect(() => validateRainfallPayload(rainfallPayload)).not.toThrow();
    expect(() =>
      validateRainfallPayload({
        cwaopendata: {
          dataset: {
            Station: {
              StationName: "壞值站",
              GeoInfo: { CountyName: "臺南市" },
              ObsTime: { DateTime: "2026-08-09T23:00:00+08:00" },
              RainfallElement: { Past1hr: { Precipitation: "-998" } },
            },
          },
        },
      }),
    ).toThrow(/usable rainfall/);
  });

  it("requires at least one weather observation with a valid time and value", () => {
    expect(() => validateWeatherPayload(weatherPayload)).not.toThrow();
    expect(() =>
      validateWeatherPayload({
        cwaopendata: {
          dataset: {
            Station: {
              StationName: "無時間站",
              GeoInfo: { CountyName: "高雄市" },
              ObsTime: { DateTime: "" },
              WeatherElement: { AirTemperature: "28.5" },
            },
          },
        },
      }),
    ).toThrow(/usable observation/);
  });
});

describe("CWA cache replacement", () => {
  function mockFetch(overrides: Partial<Record<string, { status: number; payload?: unknown }>> = {}): typeof fetch {
    const payloads: Record<string, unknown> = {
      [CWA_ENDPOINTS.warnings.url]: warningPayload(),
      [CWA_ENDPOINTS.rainfall.url]: rainfallPayload,
      [CWA_ENDPOINTS.weather.url]: weatherPayload,
      [CWA_ENDPOINTS.earthquake.url]: { optional: true },
      [CWA_ENDPOINTS.typhoon.url]: { optional: true },
    };

    return vi.fn(async (input: unknown) => {
      const url = String(input);
      const override = overrides[url];
      const status = override?.status ?? 200;
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => override?.payload ?? payloads[url],
      } as Response;
    }) as unknown as typeof fetch;
  }

  function mockFileSystem() {
    const calls: string[] = [];
    let written = "";
    return {
      calls,
      get written() {
        return written;
      },
      implementation: {
        mkdir: vi.fn(async (path: string) => {
          calls.push(`mkdir:${path}`);
        }),
        writeFile: vi.fn(async (path: string, contents: string) => {
          calls.push(`write:${path}`);
          written = contents;
        }),
        rename: vi.fn(async (from: string, to: string) => {
          calls.push(`rename:${from}->${to}`);
        }),
      },
    };
  }

  it("retries a transient warning HTTP failure once before atomically publishing", async () => {
    const files = mockFileSystem();
    let warningAttempts = 0;
    const fetchImpl = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      if (url !== CWA_ENDPOINTS.warnings.url) throw new Error(`Unexpected source: ${url}`);
      warningAttempts += 1;
      if (warningAttempts === 1) return new Response(null, { status: 503 });
      return new Response(JSON.stringify(warningPayload()));
    }) as typeof fetch;

    await fetchCwaData({
      fetchImpl,
      outputPath: "/virtual/latest.json",
      retryDelayMs: 0,
      fileSystem: files.implementation,
      logger: { log: vi.fn(), warn: vi.fn() },
    });

    expect(warningAttempts).toBe(2);
    expect(files.implementation.writeFile).toHaveBeenCalledOnce();
    expect(files.implementation.rename).toHaveBeenCalledOnce();
  });

  it("bounds and retries a timed-out warning request", async () => {
    const files = mockFileSystem();
    let warningAttempts = 0;
    const fetchImpl = vi.fn(async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      warningAttempts += 1;
      if (warningAttempts === 1) {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new globalThis.DOMException("Timed out", "AbortError")));
        });
      }
      return new Response(JSON.stringify(warningPayload()));
    }) as typeof fetch;

    await fetchCwaData({
      fetchImpl,
      outputPath: "/virtual/latest.json",
      timeoutMs: 1,
      retryDelayMs: 0,
      fileSystem: files.implementation,
      logger: { log: vi.fn(), warn: vi.fn() },
    });

    expect(warningAttempts).toBe(2);
    expect(files.implementation.rename).toHaveBeenCalledOnce();
  });

  it("keeps the timeout active while the response body is being read", async () => {
    const files = mockFileSystem();
    let warningAttempts = 0;
    const fetchImpl = vi.fn(async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      warningAttempts += 1;
      if (warningAttempts === 1) {
        return {
          ok: true,
          status: 200,
          json: () =>
            new Promise<unknown>((_resolve, reject) => {
              init?.signal?.addEventListener("abort", () =>
                reject(new globalThis.DOMException("Timed out reading body", "AbortError")),
              );
            }),
        } as Response;
      }
      return new Response(JSON.stringify(warningPayload()));
    }) as typeof fetch;

    await fetchCwaData({
      fetchImpl,
      outputPath: "/virtual/latest.json",
      timeoutMs: 1,
      retryDelayMs: 0,
      fileSystem: files.implementation,
      logger: { log: vi.fn(), warn: vi.fn() },
    });

    expect(warningAttempts).toBe(2);
    expect(files.implementation.rename).toHaveBeenCalledOnce();
  });

  it("refuses to write after a persistent warning source failure", async () => {
    const files = mockFileSystem();
    const fetchImpl = mockFetch({ [CWA_ENDPOINTS.warnings.url]: { status: 503 } });
    await expect(
      fetchCwaData({
        fetchImpl,
        outputPath: "/virtual/latest.json",
        retryDelayMs: 0,
        fileSystem: files.implementation,
        logger: { log: vi.fn(), warn: vi.fn() },
      }),
    ).rejects.toThrow(/Critical CWA validation failed/);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(files.implementation.writeFile).not.toHaveBeenCalled();
    expect(files.implementation.rename).not.toHaveBeenCalled();
  });

  it("does not retry a non-transient warning 4xx response", async () => {
    const files = mockFileSystem();
    const fetchImpl = mockFetch({ [CWA_ENDPOINTS.warnings.url]: { status: 404 } });

    await expect(
      fetchCwaData({
        fetchImpl,
        outputPath: "/virtual/latest.json",
        retryDelayMs: 0,
        fileSystem: files.implementation,
        logger: { log: vi.fn(), warn: vi.fn() },
      }),
    ).rejects.toThrow(/Critical CWA validation failed/);

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(files.implementation.writeFile).not.toHaveBeenCalled();
    expect(files.implementation.rename).not.toHaveBeenCalled();
  });

  it("refuses to write an incomplete warning mirror", async () => {
    const files = mockFileSystem();
    await expect(
      fetchCwaData({
        fetchImpl: mockFetch({
          [CWA_ENDPOINTS.warnings.url]: {
            status: 200,
            payload: warningPayload(fullWarningLocations().slice(0, 21)),
          },
        }),
        outputPath: "/virtual/latest.json",
        fileSystem: files.implementation,
        logger: { log: vi.fn(), warn: vi.fn() },
      }),
    ).rejects.toThrow(/Critical CWA validation failed/);
    expect(files.implementation.writeFile).not.toHaveBeenCalled();
    expect(files.implementation.rename).not.toHaveBeenCalled();
  });

  it("refuses to write a complete county list with malformed warning hazards", async () => {
    const files = mockFileSystem();
    await expect(
      fetchCwaData({
        fetchImpl: mockFetch({
          [CWA_ENDPOINTS.warnings.url]: {
            status: 200,
            payload: warningPayloadWithHazardConditions({ hazards: null }),
          },
        }),
        outputPath: "/virtual/latest.json",
        fileSystem: files.implementation,
        logger: { log: vi.fn(), warn: vi.fn() },
      }),
    ).rejects.toThrow(/Critical CWA validation failed/);
    expect(files.implementation.writeFile).not.toHaveBeenCalled();
    expect(files.implementation.rename).not.toHaveBeenCalled();
  });

  it("does not fetch or persist optional context in the mission-critical fallback", async () => {
    const files = mockFileSystem();
    const fetchImpl = mockFetch();
    const cache = await fetchCwaData({
      fetchImpl,
      outputPath: "/virtual/latest.json",
      fileSystem: files.implementation,
      logger: { log: vi.fn(), warn: vi.fn() },
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      CWA_ENDPOINTS.warnings.url,
      expect.objectContaining({ signal: expect.any(globalThis.AbortSignal) }),
    );
    expect(cache.sources.map((source) => source.key)).toEqual(["warnings"]);
    expect(cache.payloads.rainfallPayload).toBeNull();
    expect(cache.payloads.weatherPayload).toBeNull();
    expect(cache.payloads.earthquakePayload).toBeNull();
    expect(cache.payloads.typhoonPayload).toBeNull();
    expect(files.written).not.toContain('"Station"');
    expect(Buffer.byteLength(files.written)).toBeLessThanOrEqual(64 * 1024);
    expect(files.implementation.writeFile).toHaveBeenCalledOnce();
    expect(files.implementation.rename).toHaveBeenCalledOnce();
  });

  it("refuses to write a schema-valid warning artifact above the 64 KiB budget", async () => {
    const files = mockFileSystem();
    const oversizedWarningPayload = {
      ...warningPayload(),
      unexpectedPadding: "x".repeat(70 * 1024),
    };

    await expect(
      fetchCwaData({
        fetchImpl: mockFetch({
          [CWA_ENDPOINTS.warnings.url]: { status: 200, payload: oversizedWarningPayload },
        }),
        outputPath: "/virtual/latest.json",
        fileSystem: files.implementation,
        logger: { log: vi.fn(), warn: vi.fn() },
      }),
    ).rejects.toThrow(/refusing to replace cache above 65536 bytes/);

    expect(files.implementation.mkdir).not.toHaveBeenCalled();
    expect(files.implementation.writeFile).not.toHaveBeenCalled();
    expect(files.implementation.rename).not.toHaveBeenCalled();
  });

  it("atomically replaces one timestamp-consistent warning cache", async () => {
    const files = mockFileSystem();
    const generatedAt = "2026-08-09T15:15:00.000Z";
    const cache = await fetchCwaData({
      fetchImpl: mockFetch(),
      outputPath: "/virtual/latest.json",
      now: () => new Date(generatedAt),
      fileSystem: files.implementation,
      logger: { log: vi.fn(), warn: vi.fn() },
    });

    expect(cache.generatedAt).toBe(generatedAt);
    expect(cache.payloads.generatedAt).toBe(generatedAt);
    expect(files.calls[1]).toMatch(/^write:\/virtual\/latest\.json\..+\.tmp$/);
    expect(files.calls[2]).toMatch(/^rename:\/virtual\/latest\.json\..+\.tmp->\/virtual\/latest\.json$/);
    expect(JSON.parse(files.written).generatedAt).toBe(JSON.parse(files.written).payloads.generatedAt);
  });
});
