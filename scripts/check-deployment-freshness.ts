import { resolve } from "node:path";
import { clearTimeout, setTimeout } from "node:timers";
import { pathToFileURL, URL } from "node:url";
import { validateWarningPayload } from "./fetch-cwa-data";

const DEFAULT_DEPLOYMENT_URL =
  "https://livejiaquan.github.io/taiwan-weather-risk-dashboard/data/latest.json";
const MAX_AGE_MS = 90 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;

interface FreshnessResult {
  ageMinutes: number;
  generatedAt: string;
}

export function checkDeploymentFreshness(
  document: unknown,
  now = new Date(),
): FreshnessResult {
  const cache = requireRecord(document, "deployment cache");
  const generatedAtMs = parseDate(cache.generatedAt, "deployment cache.generatedAt");
  const ageMs = now.getTime() - generatedAtMs;

  if (ageMs < -MAX_FUTURE_SKEW_MS) {
    throw new Error("deployment cache.generatedAt is more than 5 minutes in the future");
  }
  if (ageMs > MAX_AGE_MS) {
    throw new Error("deployment cache is older than 90 minutes");
  }

  const sources = Array.isArray(cache.sources) ? cache.sources : [];
  const warningSource = sources.find((source) => {
    if (!isRecord(source)) return false;
    return source.key === "warnings" && source.status === "success";
  });
  if (!warningSource) {
    throw new Error("deployment cache requires a successful warnings source");
  }

  const payloads = requireRecord(cache.payloads, "deployment cache.payloads");
  const payloadGeneratedAtMs = parseDate(
    payloads.generatedAt,
    "deployment cache.payloads.generatedAt",
  );
  if (payloadGeneratedAtMs !== generatedAtMs) {
    throw new Error("deployment cache timestamps must match");
  }
  validateWarningPayload(payloads.warningPayload);

  return {
    ageMinutes: Math.max(0, ageMs) / 60_000,
    generatedAt: new Date(generatedAtMs).toISOString(),
  };
}

export async function main(
  url = process.env.DEPLOYMENT_URL || DEFAULT_DEPLOYMENT_URL,
  fetchImpl: typeof fetch = fetch,
): Promise<FreshnessResult> {
  const target = new URL(url);
  target.searchParams.set("probe", Date.now().toString());

  const controller = new globalThis.AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(target, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`deployment probe received HTTP ${response.status}`);
    }

    const result = checkDeploymentFreshness(await response.json());
    console.log(
      `Deployment cache healthy: generated ${result.generatedAt}, age ${result.ageMinutes.toFixed(1)} minutes`,
    );
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${path} must be an object`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseDate(value: unknown, path: string): number {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${path} must be a parseable date-time`);
  }
  return Date.parse(value);
}

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(resolve(entryPath)).href) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
