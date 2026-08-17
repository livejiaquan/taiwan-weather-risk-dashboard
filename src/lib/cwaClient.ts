import {
  CWA_ENDPOINTS,
  createRiskInputFromCwaPayloads,
  normalizeEarthquakeData,
  normalizeRainfallData,
  normalizeTyphoonData,
  type CwaPayloads,
  type CwaSourceKey,
} from "./cwaAdapter";
import { buildRiskSnapshot, type RiskSnapshot } from "./riskEngine";

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

export interface SourceStatus {
  key: CwaSourceKey;
  id: string;
  label: string;
  url: string;
  status: "success" | "error";
  updatedAt?: string;
  stale: boolean;
  error?: string;
}

export interface RiskDashboardLoadResult {
  snapshot: RiskSnapshot | null;
  sources: SourceStatus[];
  degraded: boolean;
  fatal: boolean;
  cacheUsed: boolean;
}

export interface LoadRiskDashboardOptions {
  fetcher?: Fetcher;
  now?: () => Date;
  timeoutMs?: number;
  retryDelayMs?: number;
  cacheUrl?: string | null;
}

interface SourceLoadSuccess {
  key: CwaSourceKey;
  payload: unknown;
  status: SourceStatus;
}

interface SourceLoadFailure {
  key: CwaSourceKey;
  payload: null;
  status: SourceStatus;
}

type SourceLoadResult = SourceLoadSuccess | SourceLoadFailure;

interface CachedDashboardData {
  sources?: Array<Partial<SourceStatus> & { key?: CwaSourceKey }>;
  payloads: Partial<CwaPayloads>;
}

const SOURCE_STALE_HOURS: Record<CwaSourceKey, number> = {
  warnings: 24,
  rainfall: 2,
  weather: 2,
  earthquake: 24 * 30,
  typhoon: 12,
};

const MAX_FUTURE_SKEW_MINUTES = 5;

export async function loadRiskDashboardData(
  options: LoadRiskDashboardOptions = {},
): Promise<RiskDashboardLoadResult> {
  const fetcher = options.fetcher ?? fetch;
  const now = options.now?.() ?? new Date();
  const timeoutMs = options.timeoutMs ?? 8000;
  const retryDelayMs = options.retryDelayMs ?? 250;

  const sourceResults = await Promise.all(
    (Object.keys(CWA_ENDPOINTS) as CwaSourceKey[]).map((key) =>
      loadSource(key, fetcher, now, timeoutMs, retryDelayMs),
    ),
  );

  const hasAnySuccess = sourceResults.some((result) => result.status.status === "success");

  if (!hasAnySuccess) {
    const cached = await loadCacheFallback(options.cacheUrl, fetcher, now, timeoutMs, sourceResults);
    if (cached) return cached;

    return {
      snapshot: null,
      sources: sourceResults.map((result) => result.status),
      degraded: true,
      fatal: true,
      cacheUsed: false,
    };
  }

  let payloads = resultsToPayloads(now, sourceResults);
  let cacheUsed = false;

  if (options.cacheUrl !== null && sourceResults.some((result) => result.status.status === "error")) {
    const cached = await fetchCacheData(options.cacheUrl, fetcher, timeoutMs);
    if (cached) {
      const merged = mergeFailedSourcesFromCache(payloads, cached.payloads, sourceResults);
      if (merged) {
        payloads = merged;
        cacheUsed = true;
      }
    }
  }

  const riskInput = createRiskInputFromCwaPayloads(payloads);
  const snapshot = buildRiskSnapshot(riskInput);
  const sources = sourceResults.map((result) => result.status);

  return {
    snapshot,
    sources,
    degraded: sources.some((source) => source.status === "error" || source.stale),
    fatal: false,
    cacheUsed,
  };
}

export async function loadCachedRiskDashboardData(
  options: LoadRiskDashboardOptions = {},
): Promise<RiskDashboardLoadResult | null> {
  const fetcher = options.fetcher ?? fetch;
  const now = options.now?.() ?? new Date();
  const timeoutMs = options.timeoutMs ?? 8000;
  return loadCacheFallback(options.cacheUrl, fetcher, now, timeoutMs, []);
}

async function loadSource(
  key: CwaSourceKey,
  fetcher: Fetcher,
  now: Date,
  timeoutMs: number,
  retryDelayMs: number,
): Promise<SourceLoadResult> {
  const endpoint = CWA_ENDPOINTS[key];

  try {
    const payload = await fetchJsonWithRetry(endpoint.url, fetcher, timeoutMs, retryDelayMs);
    if (key === "rainfall" && !hasUsableRainfallObservation(payload)) {
      throw new Error("No usable rainfall observations");
    }
    const updatedAt = updatedAtForSource(key, payload);

    return {
      key,
      payload,
      status: {
        key,
        id: endpoint.id,
        label: endpoint.label,
        url: endpoint.url,
        status: "success",
        updatedAt,
        stale: isStale(updatedAt, now, SOURCE_STALE_HOURS[key]),
      },
    };
  } catch (error) {
    return {
      key,
      payload: null,
      status: {
        key,
        id: endpoint.id,
        label: endpoint.label,
        url: endpoint.url,
        status: "error",
        stale: true,
        error: error instanceof Error ? error.message : "Unknown source error",
      },
    };
  }
}

function hasUsableRainfallObservation(payload: unknown): boolean {
  return normalizeRainfallData(payload).some(
    (station) => station.past1h !== undefined || station.past3h !== undefined || station.past24h !== undefined,
  );
}

async function fetchJsonWithRetry(
  url: string,
  fetcher: Fetcher,
  timeoutMs: number,
  retryDelayMs: number,
): Promise<unknown> {
  try {
    return await fetchJson(url, fetcher, timeoutMs);
  } catch (error) {
    if (!isTransientFetchError(error)) throw error;
    if (retryDelayMs > 0) await new Promise((resolve) => globalThis.setTimeout(resolve, retryDelayMs));
    return fetchJson(url, fetcher, timeoutMs);
  }
}

function isTransientFetchError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (error instanceof globalThis.DOMException && error.name === "AbortError") return true;
  return error instanceof Error && /^HTTP 5\d\d$/.test(error.message);
}

async function fetchJson(url: string, fetcher: Fetcher, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetcher(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

async function loadCacheFallback(
  cacheUrl: string | null | undefined,
  fetcher: Fetcher,
  now: Date,
  timeoutMs: number,
  failedSources: SourceLoadResult[],
): Promise<RiskDashboardLoadResult | null> {
  const cache = await fetchCacheData(cacheUrl, fetcher, timeoutMs);
  if (!cache) return null;

  try {
    const payloads: CwaPayloads = {
      generatedAt: cache.payloads.generatedAt ?? now.toISOString(),
      warningPayload: cache.payloads.warningPayload ?? null,
      rainfallPayload: cache.payloads.rainfallPayload ?? null,
      weatherPayload: cache.payloads.weatherPayload ?? null,
      earthquakePayload: cache.payloads.earthquakePayload ?? null,
      typhoonPayload: cache.payloads.typhoonPayload ?? null,
    };
    const snapshot = buildRiskSnapshot(createRiskInputFromCwaPayloads(payloads));
    const sources = cacheSourcesToStatuses(cache.sources, payloads, now, failedSources);

    return {
      snapshot,
      sources,
      degraded: true,
      fatal: false,
      cacheUsed: true,
    };
  } catch {
    return null;
  }
}

async function fetchCacheData(
  cacheUrl: string | null | undefined,
  fetcher: Fetcher,
  timeoutMs: number,
): Promise<CachedDashboardData | null> {
  if (cacheUrl === null) return null;

  try {
    const cache = (await fetchJson(cacheUrl ?? "data/latest.json", fetcher, timeoutMs)) as Partial<CachedDashboardData>;
    return cache.payloads ? { sources: cache.sources, payloads: cache.payloads } : null;
  } catch {
    return null;
  }
}

function mergeFailedSourcesFromCache(
  livePayloads: CwaPayloads,
  cachedPayloads: Partial<CwaPayloads>,
  results: SourceLoadResult[],
): CwaPayloads | null {
  const merged = { ...livePayloads };
  let filledSourceCount = 0;

  for (const result of results) {
    if (result.status.status !== "error") continue;

    if (result.key === "warnings" && cachedPayloads.warningPayload != null) {
      merged.warningPayload = cachedPayloads.warningPayload;
      filledSourceCount += 1;
    } else if (result.key === "rainfall" && cachedPayloads.rainfallPayload != null) {
      merged.rainfallPayload = cachedPayloads.rainfallPayload;
      filledSourceCount += 1;
    } else if (result.key === "weather" && cachedPayloads.weatherPayload != null) {
      merged.weatherPayload = cachedPayloads.weatherPayload;
      filledSourceCount += 1;
    } else if (result.key === "earthquake" && cachedPayloads.earthquakePayload != null) {
      merged.earthquakePayload = cachedPayloads.earthquakePayload;
      filledSourceCount += 1;
    } else if (result.key === "typhoon" && cachedPayloads.typhoonPayload != null) {
      merged.typhoonPayload = cachedPayloads.typhoonPayload;
      filledSourceCount += 1;
    }
  }

  return filledSourceCount > 0 ? merged : null;
}

function cacheSourcesToStatuses(
  cachedSources: Array<Partial<SourceStatus> & { key?: CwaSourceKey }> | undefined,
  payloads: CwaPayloads,
  now: Date,
  failedSources: SourceLoadResult[],
): SourceStatus[] {
  if (cachedSources?.length) {
    return cachedSources
      .filter((source): source is Partial<SourceStatus> & { key: CwaSourceKey } => Boolean(source.key))
      .map((source) => statusForCachePayload(source.key, payloadForSource(source.key, payloads), now, source.status));
  }

  if (failedSources.length > 0) {
    return failedSources.map((result) => result.status);
  }

  return (Object.keys(CWA_ENDPOINTS) as CwaSourceKey[]).map((key) =>
    statusForCachePayload(key, payloadForSource(key, payloads), now, payloadForSource(key, payloads) ? "success" : "error"),
  );
}

function payloadForSource(key: CwaSourceKey, payloads: CwaPayloads): unknown | null {
  if (key === "warnings") return payloads.warningPayload;
  if (key === "rainfall") return payloads.rainfallPayload;
  if (key === "weather") return payloads.weatherPayload;
  if (key === "earthquake") return payloads.earthquakePayload;
  return payloads.typhoonPayload;
}

function statusForCachePayload(
  key: CwaSourceKey,
  payload: unknown | null,
  now: Date,
  cachedStatus: SourceStatus["status"] | undefined,
): SourceStatus {
  const endpoint = CWA_ENDPOINTS[key];
  const updatedAt = payload ? updatedAtForSource(key, payload) : undefined;

  return {
    key,
    id: endpoint.id,
    label: endpoint.label,
    url: endpoint.url,
    status: cachedStatus ?? (payload ? "success" : "error"),
    updatedAt,
    stale: isStale(updatedAt, now, SOURCE_STALE_HOURS[key]),
    error: payload ? undefined : "Cache payload unavailable",
  };
}

function resultsToPayloads(now: Date, results: SourceLoadResult[]): CwaPayloads {
  const payloadFor = (key: CwaSourceKey) => results.find((result) => result.key === key)?.payload ?? null;

  return {
    generatedAt: now.toISOString(),
    warningPayload: payloadFor("warnings"),
    rainfallPayload: payloadFor("rainfall"),
    weatherPayload: payloadFor("weather"),
    earthquakePayload: payloadFor("earthquake"),
    typhoonPayload: payloadFor("typhoon"),
  };
}

function updatedAtForSource(key: CwaSourceKey, payload: unknown): string | undefined {
  const raw = payload as any;

  if (key === "warnings") return optionalString(raw?.cwaopendata?.sent);
  if (key === "earthquake") return normalizeEarthquakeData(raw)?.occurredAt;
  if (key === "typhoon") return normalizeTyphoonData(raw)?.latestAt;
  if (key === "rainfall" || key === "weather") {
    return latestDate(
      asArray(raw?.cwaopendata?.dataset?.Station)
        .map((station) => optionalString(station?.ObsTime?.DateTime))
        .filter((value): value is string => Boolean(value)),
    );
  }

  return undefined;
}

function latestDate(values: string[]): string | undefined {
  return values.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
}

function isStale(value: string | undefined, now: Date, staleHours: number): boolean {
  if (!value) return true;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return true;
  const diffHours = (now.getTime() - timestamp) / (1000 * 60 * 60);
  const futureSkewHours = MAX_FUTURE_SKEW_MINUTES / 60;
  return diffHours > staleHours || diffHours < -futureSkewHours;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}
