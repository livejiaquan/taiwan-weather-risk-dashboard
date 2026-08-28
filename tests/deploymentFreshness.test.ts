// @vitest-environment node

import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkDeploymentFreshness, main } from "../scripts/check-deployment-freshness";
import { COUNTIES } from "../src/lib/riskEngine";

const timerMocks = vi.hoisted(() => {
  let callback: (() => void) | undefined;
  let active = false;
  return {
    setTimeout: vi.fn((next: () => void) => {
      callback = next;
      active = true;
      return 0;
    }),
    clearTimeout: vi.fn(() => {
      active = false;
    }),
    trigger: () => {
      if (active) callback?.();
    },
    reset: () => {
      callback = undefined;
      active = false;
    },
  };
});

vi.mock("node:timers", () => ({
  setTimeout: timerMocks.setTimeout,
  clearTimeout: timerMocks.clearTimeout,
}));

function warningPayload() {
  return {
    cwaopendata: {
      sent: "2026-08-24T11:55:00Z",
      dataset: {
        location: COUNTIES.map(({ countyName, geocode }) => ({
          locationName: countyName,
          geocode,
          hazardConditions: null,
        })),
      },
    },
  };
}

function cacheDocument(generatedAt: string) {
  return {
    generatedAt,
    sources: [{ key: "warnings", status: "success" }],
    payloads: {
      generatedAt,
      warningPayload: warningPayload(),
      rainfallPayload: null,
      weatherPayload: null,
      earthquakePayload: null,
      typhoonPayload: null,
    },
  };
}

describe("deployment freshness probe", () => {
  const now = new Date("2026-08-24T12:00:00Z");

  afterEach(() => {
    timerMocks.reset();
    timerMocks.setTimeout.mockClear();
    timerMocks.clearTimeout.mockClear();
  });

  it("runs independently from deployment on a staggered schedule", () => {
    const workflow = readFileSync(".github/workflows/freshness.yml", "utf8");
    const packageDocument = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(workflow).toMatch(/cron:\s+["']11,41 \* \* \* \*["']/);
    expect(workflow).toContain("npm run probe:freshness");
    expect(workflow).toContain("timeout-minutes: 5");
    expect(workflow).toMatch(/actions:\s+write/);
    expect(workflow).toMatch(/id:\s+freshness-probe/);
    expect(workflow).toMatch(/continue-on-error:\s+true/);
    expect(workflow).toMatch(/if:\s+steps\.freshness-probe\.outcome == 'failure'/);
    expect(workflow).toContain("GH_TOKEN: ${{ github.token }}");
    expect(workflow).toContain("gh workflow run pages.yml --ref main");
    expect(workflow).toContain("exit 1");
    expect(packageDocument.scripts["probe:freshness"]).toBe(
      "tsx scripts/check-deployment-freshness.ts",
    );
  });

  it("accepts a recent complete warning cache", () => {
    expect(checkDeploymentFreshness(cacheDocument("2026-08-24T11:30:00Z"), now)).toEqual({
      ageMinutes: 30,
      generatedAt: "2026-08-24T11:30:00.000Z",
    });
  });

  it("rejects a cache older than the 90-minute product budget", () => {
    expect(() =>
      checkDeploymentFreshness(cacheDocument("2026-08-24T10:29:59Z"), now),
    ).toThrow(/older than 90 minutes/);
  });

  it("rejects an implausibly future cache timestamp", () => {
    expect(() =>
      checkDeploymentFreshness(cacheDocument("2026-08-24T12:05:01Z"), now),
    ).toThrow(/more than 5 minutes in the future/);
  });

  it("rejects an invalid or unsuccessful warning source", () => {
    const missingSource = cacheDocument("2026-08-24T11:30:00Z");
    missingSource.sources = [];
    expect(() => checkDeploymentFreshness(missingSource, now)).toThrow(/successful warnings source/);

    const failedSource = cacheDocument("2026-08-24T11:30:00Z");
    failedSource.sources[0].status = "error";
    expect(() => checkDeploymentFreshness(failedSource, now)).toThrow(/successful warnings source/);
  });

  it("reuses the warning schema validator for the deployed payload", () => {
    const incomplete = cacheDocument("2026-08-24T11:30:00Z");
    incomplete.payloads.warningPayload.cwaopendata.dataset.location.pop();

    expect(() => checkDeploymentFreshness(incomplete, now)).toThrow(/cover exactly 22 counties/);
  });

  it("retries one transient server error before failing the probe", async () => {
    const generatedAt = new Date().toISOString();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => cacheDocument(generatedAt),
      }) as unknown as typeof fetch;

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      await expect(main("https://example.test/latest.json", fetchImpl)).resolves.toMatchObject({
        generatedAt: new Date(generatedAt).toISOString(),
      });
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    } finally {
      logSpy.mockRestore();
    }
  });

  it("stops after one transient server-error retry", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 503 }) as unknown as typeof fetch;

    await expect(main("https://example.test/latest.json", fetchImpl)).rejects.toThrow(
      /HTTP 503/,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("keeps the request timeout active while parsing the response body", async () => {
    let bodyParsingStarted!: () => void;
    const bodyParsing = new Promise<void>((resolve) => {
      bodyParsingStarted = resolve;
    });
    const fetchImpl = vi.fn(async (_url: URL, init?: RequestInit) => ({
      ok: true,
      json: () => {
        bodyParsingStarted();
        return new Promise<never>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const error = new Error("The operation was aborted");
            error.name = "AbortError";
            reject(error);
          });
        });
      },
    })) as unknown as typeof fetch;

    const probe = main("https://example.test/latest.json", fetchImpl);
    await bodyParsing;
    expect(timerMocks.clearTimeout).not.toHaveBeenCalled();
    timerMocks.trigger();

    await expect(probe).rejects.toMatchObject({ name: "AbortError" });
  });
});
