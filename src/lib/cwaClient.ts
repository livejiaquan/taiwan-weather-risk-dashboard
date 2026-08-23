import {
  CWA_ENDPOINTS,
  createRiskInputFromCwaPayloads,
  normalizeEarthquakeData,
  normalizeRainfallData,
  normalizeTyphoonData,
  type CwaPayloads,
  type CwaSourceKey,
} from "./cwaAdapter";
import { buildRiskSnapshot, COUNTIES, type RiskSnapshot } from "./riskEngine";

interface DashboardRequestInit extends RequestInit {
  cache?: "no-store";
}

type Fetcher = (input: string, init?: DashboardRequestInit) => Promise<Response>;

export interface SourceStatus {
  key: CwaSourceKey;
  id: string;
  label: string;
  url: string;
  status: "success" | "error";
  provenance: "live" | "cache" | "none";
  updatedAt?: string;
  fetchedAt?: string;
  cacheGeneratedAt?: string;
  stale: boolean;
  error?: string;
}

export interface WarningDataStatus {
  coverage: "current" | "cached" | "unavailable";
  currentness: "current" | "stale" | "unknown";
  sourceUpdatedAt?: string;
  fetchedAt?: string;
  cacheGeneratedAt?: string;
}

export interface RiskDashboardLoadResult {
  snapshot: RiskSnapshot | null;
  sources: SourceStatus[];
  warnings: WarningDataStatus;
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
  generatedAt: string;
  sources?: Array<Partial<SourceStatus> & { key?: CwaSourceKey }>;
  payloads: Partial<CwaPayloads>;
}

interface CacheMergeResult {
  payloads: CwaPayloads;
  sources: SourceStatus[];
}

const CACHE_MAX_AGE_MS = 90 * 60 * 1000;
const INVALID_WARNING_PAYLOAD_ERROR = "Invalid warning payload schema";
const WARNING_GEOCODE_BY_COUNTY = new Map(COUNTIES.map(({ countyName, geocode }) => [countyName, geocode]));

const SOURCE_STALE_HOURS: Record<Exclude<CwaSourceKey, "warnings">, number> = {
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
      warnings: warningDataStatus(sourceResults.map((result) => result.status)),
      degraded: true,
      fatal: true,
      cacheUsed: false,
    };
  }

  let payloads = resultsToPayloads(now, sourceResults);
  let sources = sourceResults.map((result) => result.status);
  let cacheUsed = false;

  if (options.cacheUrl !== null && sourceResults.some((result) => result.status.status === "error")) {
    const cached = await fetchCacheData(options.cacheUrl, fetcher, timeoutMs, now);
    if (cached) {
      const merged = mergeFailedSourcesFromCache(payloads, cached, sourceResults, now);
      if (merged) {
        payloads = merged.payloads;
        sources = merged.sources;
        cacheUsed = true;
      }
    }
  }

  const riskInput = createRiskInputFromCwaPayloads(payloads);
  const snapshot = buildRiskSnapshot(riskInput);

  return {
    snapshot,
    sources,
    warnings: warningDataStatus(sources),
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
    if (key === "warnings" && !hasValidWarningPayload(payload)) {
      throw new Error(INVALID_WARNING_PAYLOAD_ERROR);
    }
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
        provenance: "live",
        updatedAt,
        fetchedAt: now.toISOString(),
        stale: isSourcePayloadStale(key, updatedAt, now),
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
        provenance: "none",
        fetchedAt: now.toISOString(),
        stale: true,
        error: error instanceof Error ? error.message : "Unknown source error",
      },
    };
  }
}

function hasValidWarningPayload(payload: unknown): boolean {
  if (!isRecord(payload)) return false;

  const cwaOpenData = payload.cwaopendata;
  if (!isRecord(cwaOpenData)) return false;

  const sent = cwaOpenData.sent;
  if (typeof sent !== "string" || !Number.isFinite(new Date(sent).getTime())) return false;

  const dataset = cwaOpenData.dataset;
  if (!isRecord(dataset) || !Object.prototype.hasOwnProperty.call(dataset, "location")) return false;

  const locations = asArray(dataset.location);
  if (locations.length !== COUNTIES.length || !locations.every(isRecord)) return false;

  const seenCountyNames = new Set<string>();
  for (const location of locations) {
    const countyName = location.locationName;
    const geocode = location.geocode;
    if (typeof countyName !== "string" || typeof geocode !== "string") return false;
    if (seenCountyNames.has(countyName) || WARNING_GEOCODE_BY_COUNTY.get(countyName) !== geocode) return false;
    if (!hasValidWarningLocation(location)) return false;
    seenCountyNames.add(countyName);
  }

  return seenCountyNames.size === WARNING_GEOCODE_BY_COUNTY.size;
}

function hasValidWarningLocation(location: Record<string, unknown>): boolean {
  if (!hasOwn(location, "hazardConditions")) return false;

  const hazardConditions = location.hazardConditions;
  if (hazardConditions === null) return true;
  if (!isRecord(hazardConditions) || !hasOwn(hazardConditions, "hazards")) return false;

  const hazards = asArray(hazardConditions.hazards);
  return hazards.length > 0 && hazards.every(hasValidWarningHazard);
}

function hasValidWarningHazard(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.info) || !isRecord(value.validTime)) return false;
  if (!isNonEmptyString(value.info.phenomena) || !isNonEmptyString(value.info.significance)) return false;

  const startTime = value.validTime.startTime;
  const endTime = value.validTime.endTime;
  if (!isParseableDateString(startTime) || !isParseableDateString(endTime)) return false;
  if (new Date(startTime).getTime() >= new Date(endTime).getTime()) return false;

  if (!hasOwn(value, "hazard")) return true;
  const details = asArray(value.hazard);
  return details.length > 0 && details.every(hasValidWarningHazardDetail);
}

function hasValidWarningHazardDetail(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.info)) return false;
  if (!hasOwn(value.info, "affectedAreas")) return true;

  const affectedAreas = value.info.affectedAreas;
  if (!isRecord(affectedAreas) || !hasOwn(affectedAreas, "location")) return false;

  const affectedLocations = asArray(affectedAreas.location);
  return (
    affectedLocations.length > 0 &&
    affectedLocations.every(
      (location) => isRecord(location) && isNonEmptyString(location.locationName),
    )
  );
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isParseableDateString(value: unknown): value is string {
  return isNonEmptyString(value) && Number.isFinite(new Date(value).getTime());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
    const response = await fetcher(url, { signal: controller.signal, cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    // Keep the abort timer active while the body is read as well as while
    // response headers are pending. A stalled JSON body must fail closed and
    // allow the bounded retry path to run.
    return await response.json();
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
  const cache = await fetchCacheData(cacheUrl, fetcher, timeoutMs, now);
  if (!cache) return null;

  try {
    const payloads: CwaPayloads = {
      generatedAt: now.toISOString(),
      warningPayload: payloadForSource("warnings", cache.payloads),
      rainfallPayload: payloadForSource("rainfall", cache.payloads),
      weatherPayload: payloadForSource("weather", cache.payloads),
      earthquakePayload: payloadForSource("earthquake", cache.payloads),
      typhoonPayload: payloadForSource("typhoon", cache.payloads),
    };
    const snapshot = buildRiskSnapshot(createRiskInputFromCwaPayloads(payloads));
    const sources = cacheSourcesToStatuses(cache.sources, payloads, cache.generatedAt, now, failedSources);

    return {
      snapshot,
      sources,
      warnings: warningDataStatus(sources),
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
  now: Date,
): Promise<CachedDashboardData | null> {
  if (cacheUrl === null) return null;

  try {
    const rawCache = await fetchJson(cacheUrl ?? "data/latest.json", fetcher, timeoutMs);
    if (!rawCache || typeof rawCache !== "object") return null;

    const cache = rawCache as Partial<CachedDashboardData>;
    if (!cache.payloads || typeof cache.payloads !== "object") return null;

    const generatedAt = optionalString(cache.generatedAt) ?? optionalString(cache.payloads.generatedAt);
    if (!generatedAt || !isCurrentCache(generatedAt, now)) return null;

    return {
      generatedAt,
      sources: Array.isArray(cache.sources) ? cache.sources : undefined,
      payloads: cache.payloads,
    };
  } catch {
    return null;
  }
}

function mergeFailedSourcesFromCache(
  livePayloads: CwaPayloads,
  cache: CachedDashboardData,
  results: SourceLoadResult[],
  now: Date,
): CacheMergeResult | null {
  const merged = { ...livePayloads };
  const cachedKeys = new Set<CwaSourceKey>();

  for (const result of results) {
    if (result.status.status !== "error") continue;

    const cachedPayload = payloadForSource(result.key, cache.payloads);
    if (cachedPayload === null) continue;

    if (result.key === "warnings") merged.warningPayload = cachedPayload;
    else if (result.key === "rainfall") merged.rainfallPayload = cachedPayload;
    else if (result.key === "weather") merged.weatherPayload = cachedPayload;
    else if (result.key === "earthquake") merged.earthquakePayload = cachedPayload;
    else merged.typhoonPayload = cachedPayload;

    cachedKeys.add(result.key);
  }

  if (cachedKeys.size === 0) return null;

  const sources = results.map((result) => {
    if (!cachedKeys.has(result.key)) return result.status;

    const cachedPayload = payloadForSource(result.key, cache.payloads);
    const updatedAt = cachedPayload === null ? undefined : updatedAtForSource(result.key, cachedPayload);
    return {
      ...result.status,
      provenance: "cache" as const,
      updatedAt,
      cacheGeneratedAt: cache.generatedAt,
      stale: isSourcePayloadStale(result.key, updatedAt, now),
    };
  });

  return { payloads: merged, sources };
}

function cacheSourcesToStatuses(
  cachedSources: Array<Partial<SourceStatus> & { key?: CwaSourceKey }> | undefined,
  payloads: CwaPayloads,
  cacheGeneratedAt: string,
  now: Date,
  failedSources: SourceLoadResult[],
): SourceStatus[] {
  return (Object.keys(CWA_ENDPOINTS) as CwaSourceKey[]).map((key) =>
    statusForCachePayload(
      key,
      payloadForSource(key, payloads),
      now,
      cacheGeneratedAt,
      cachedSources?.find((source) => source.key === key),
      failedSources.find((result) => result.key === key)?.status,
    ),
  );
}

function payloadForSource(key: CwaSourceKey, payloads: Partial<CwaPayloads>): unknown | null {
  const payload =
    key === "warnings"
      ? payloads.warningPayload
      : key === "rainfall"
        ? payloads.rainfallPayload
        : key === "weather"
          ? payloads.weatherPayload
          : key === "earthquake"
            ? payloads.earthquakePayload
            : payloads.typhoonPayload;

  if (payload === null || payload === undefined) return null;
  if (key === "warnings" && !hasValidWarningPayload(payload)) return null;
  return payload;
}

function statusForCachePayload(
  key: CwaSourceKey,
  payload: unknown | null,
  now: Date,
  cacheGeneratedAt: string,
  cachedSource: (Partial<SourceStatus> & { key?: CwaSourceKey }) | undefined,
  liveFailure: SourceStatus | undefined,
): SourceStatus {
  const endpoint = CWA_ENDPOINTS[key];
  const payloadAvailable = payload !== null;
  const updatedAt = payloadAvailable ? updatedAtForSource(key, payload) : undefined;
  const reportedStatus = liveFailure?.status ?? cachedSource?.status ?? (payloadAvailable ? "success" : "error");
  const status = payloadAvailable ? reportedStatus : "error";
  const error =
    liveFailure?.error ??
    (!payloadAvailable
      ? cachedSource?.error ?? "Cache payload unavailable"
      : status === "error"
        ? cachedSource?.error
        : undefined);

  return {
    key,
    id: endpoint.id,
    label: endpoint.label,
    url: endpoint.url,
    status,
    provenance: payloadAvailable ? "cache" : "none",
    updatedAt,
    fetchedAt: liveFailure?.fetchedAt ?? cachedSource?.fetchedAt,
    cacheGeneratedAt: payloadAvailable ? cacheGeneratedAt : undefined,
    stale: !payloadAvailable || isSourcePayloadStale(key, updatedAt, now),
    error,
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

function warningDataStatus(sources: SourceStatus[]): WarningDataStatus {
  const source = sources.find((candidate) => candidate.key === "warnings");
  const coverage: WarningDataStatus["coverage"] =
    source?.provenance === "live" && source.status === "success"
      ? "current"
      : source?.provenance === "cache"
        ? "cached"
        : "unavailable";
  const currentness: WarningDataStatus["currentness"] =
    coverage === "unavailable" ? "unknown" : source?.stale ? "stale" : "current";
  const status: WarningDataStatus = { coverage, currentness };

  if (source?.updatedAt) status.sourceUpdatedAt = source.updatedAt;
  if (source?.fetchedAt) status.fetchedAt = source.fetchedAt;
  if (source?.cacheGeneratedAt) status.cacheGeneratedAt = source.cacheGeneratedAt;

  return status;
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

function isSourcePayloadStale(key: CwaSourceKey, updatedAt: string | undefined, now: Date): boolean {
  if (key === "warnings") return false;
  return isStale(updatedAt, now, SOURCE_STALE_HOURS[key]);
}

function isCurrentCache(generatedAt: string, now: Date): boolean {
  const generatedTime = new Date(generatedAt).getTime();
  const nowTime = now.getTime();
  if (!Number.isFinite(generatedTime) || !Number.isFinite(nowTime)) return false;

  const ageMs = nowTime - generatedTime;
  return ageMs >= 0 && ageMs <= CACHE_MAX_AGE_MS;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}
