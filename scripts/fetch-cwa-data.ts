import { mkdir, rename, writeFile } from "node:fs/promises";
import { Buffer } from "node:buffer";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { CWA_ENDPOINTS, type CwaSourceKey } from "../src/lib/cwaAdapter";
import { COUNTIES } from "../src/lib/riskEngine";

interface CachedSource {
  key: CwaSourceKey;
  id: string;
  label: string;
  url: string;
  status: "success" | "error";
  error?: string;
}

interface CacheDocument {
  generatedAt: string;
  sources: CachedSource[];
  payloads: {
    generatedAt: string;
    warningPayload: unknown | null;
    rainfallPayload: unknown | null;
    weatherPayload: unknown | null;
    earthquakePayload: unknown | null;
    typhoonPayload: unknown | null;
  };
}

interface CacheFileSystem {
  mkdir(path: string): Promise<void>;
  writeFile(path: string, contents: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
}

interface CacheLogger {
  log(message: string): void;
  warn(message: string): void;
}

interface FetchDataOptions {
  fetchImpl?: typeof fetch;
  outputPath?: string;
  now?: () => Date;
  timeoutMs?: number;
  retryDelayMs?: number;
  fileSystem?: CacheFileSystem;
  logger?: CacheLogger;
}

interface SourceResult {
  key: CwaSourceKey;
  payload: unknown | null;
  source: CachedSource;
}

const DEFAULT_OUTPUT_PATH = resolve("public/data/latest.json");
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_RETRY_DELAY_MS = 250;
const MAX_CACHE_BYTES = 64 * 1024;
const CACHE_SOURCE_KEYS: CwaSourceKey[] = ["warnings"];
const CRITICAL_SOURCE_KEYS = new Set<CwaSourceKey>(["warnings"]);

const defaultFileSystem: CacheFileSystem = {
  async mkdir(path) {
    await mkdir(path, { recursive: true });
  },
  async writeFile(path, contents) {
    await writeFile(path, contents, "utf8");
  },
  async rename(from, to) {
    await rename(from, to);
  },
};

export function validateWarningPayload(payload: unknown): void {
  const cwaopendata = requireRecord(payload, "warning payload").cwaopendata;
  const envelope = requireRecord(cwaopendata, "warning payload.cwaopendata");
  if (!isParseableDate(envelope.sent)) {
    throw new Error("warning payload.cwaopendata.sent must be a parseable date-time");
  }

  const dataset = requireRecord(envelope.dataset, "warning payload.cwaopendata.dataset");
  if (!Object.prototype.hasOwnProperty.call(dataset, "location")) {
    throw new Error("warning payload.cwaopendata.dataset.location is required");
  }

  const rawLocations = dataset.location;
  const locations = Array.isArray(rawLocations)
    ? rawLocations
    : isRecord(rawLocations)
      ? [rawLocations]
      : rawLocations === null
        ? []
        : null;
  if (locations === null) {
    throw new Error("warning payload dataset.location must be an object, array, or null");
  }

  const expectedByCountyName = new Map(COUNTIES.map((county) => [county.countyName, county.geocode]));
  const seenCountyNames = new Set<string>();
  const seenGeocodes = new Set<string>();

  locations.forEach((rawLocation, index) => {
    const location = requireRecord(rawLocation, `warning payload dataset.location[${index}]`);
    const countyName = isNonEmptyString(location.locationName) ? location.locationName : "";
    const geocode = isNonEmptyString(location.geocode) ? location.geocode : "";
    if (!countyName || !geocode) {
      throw new Error(`warning payload dataset.location[${index}] requires countyName and geocode`);
    }
    if (seenCountyNames.has(countyName)) {
      throw new Error(`warning payload contains duplicate countyName: ${countyName}`);
    }
    if (seenGeocodes.has(geocode)) {
      throw new Error(`warning payload contains duplicate geocode: ${geocode}`);
    }

    const expectedGeocode = expectedByCountyName.get(countyName);
    if (expectedGeocode === undefined) {
      throw new Error(`warning payload contains unknown countyName: ${countyName}`);
    }
    if (geocode !== expectedGeocode) {
      throw new Error(
        `warning payload geocode mismatch for ${countyName}: expected ${expectedGeocode}, received ${geocode}`,
      );
    }

    validateWarningHazardConditions(location, index);

    seenCountyNames.add(countyName);
    seenGeocodes.add(geocode);
  });

  const missingCountyNames = COUNTIES.filter((county) => !seenCountyNames.has(county.countyName)).map(
    (county) => county.countyName,
  );
  if (missingCountyNames.length > 0 || locations.length !== COUNTIES.length) {
    throw new Error(
      `warning payload must cover exactly ${COUNTIES.length} counties; missing: ${missingCountyNames.join(", ") || "none"}`,
    );
  }
}

function validateWarningHazardConditions(location: Record<string, unknown>, locationIndex: number): void {
  const locationPath = `warning payload dataset.location[${locationIndex}]`;
  if (!hasOwn(location, "hazardConditions")) {
    throw new Error(`${locationPath}.hazardConditions is required`);
  }

  const rawConditions = location.hazardConditions;
  if (rawConditions === null) return;

  const conditions = requireRecord(rawConditions, `${locationPath}.hazardConditions`);
  if (!hasOwn(conditions, "hazards")) {
    throw new Error(`${locationPath}.hazardConditions.hazards is required`);
  }

  const rawHazards = conditions.hazards;
  const hazards = Array.isArray(rawHazards)
    ? rawHazards
    : isRecord(rawHazards)
      ? [rawHazards]
      : null;
  if (!hazards || hazards.length === 0) {
    throw new Error(`${locationPath}.hazardConditions.hazards must be an object or non-empty array`);
  }

  hazards.forEach((rawHazard, hazardIndex) => {
    const hazardPath = `${locationPath}.hazardConditions.hazards[${hazardIndex}]`;
    const hazard = requireRecord(rawHazard, hazardPath);
    const info = requireRecord(hazard.info, `${hazardPath}.info`);
    if (!isNonEmptyString(info.phenomena) || !isNonEmptyString(info.significance)) {
      throw new Error(`${hazardPath}.info requires non-empty phenomena and significance`);
    }

    const validTime = requireRecord(hazard.validTime, `${hazardPath}.validTime`);
    if (!isParseableDate(validTime.startTime) || !isParseableDate(validTime.endTime)) {
      throw new Error(`${hazardPath}.validTime requires parseable startTime and endTime`);
    }
    if (Date.parse(validTime.startTime) >= Date.parse(validTime.endTime)) {
      throw new Error(`${hazardPath}.validTime startTime must be before endTime`);
    }

    validateAffectedAreas(hazard, hazardPath);
  });
}

function validateAffectedAreas(hazard: Record<string, unknown>, hazardPath: string): void {
  if (!hasOwn(hazard, "hazard")) return;

  const detail = requireRecord(hazard.hazard, `${hazardPath}.hazard`);
  const detailInfo = requireRecord(detail.info, `${hazardPath}.hazard.info`);
  if (!hasOwn(detailInfo, "affectedAreas")) return;

  const affectedAreas = requireRecord(
    detailInfo.affectedAreas,
    `${hazardPath}.hazard.info.affectedAreas`,
  );
  if (!hasOwn(affectedAreas, "location")) {
    throw new Error(`${hazardPath}.hazard.info.affectedAreas.location is required`);
  }

  const rawLocations = affectedAreas.location;
  const locations = Array.isArray(rawLocations)
    ? rawLocations
    : isRecord(rawLocations)
      ? [rawLocations]
      : null;
  if (!locations || locations.length === 0) {
    throw new Error(
      `${hazardPath}.hazard.info.affectedAreas.location must be an object or non-empty array`,
    );
  }

  locations.forEach((rawLocation, index) => {
    const location = requireRecord(
      rawLocation,
      `${hazardPath}.hazard.info.affectedAreas.location[${index}]`,
    );
    if (!isNonEmptyString(location.locationName)) {
      throw new Error(
        `${hazardPath}.hazard.info.affectedAreas.location[${index}].locationName is required`,
      );
    }
  });
}

export function validateRainfallPayload(payload: unknown): void {
  const stations = stationRecords(payload);
  const hasUsableObservation = stations.some((station) => {
    if (!hasStationIdentityAndTime(station)) return false;
    const rainfall = asRecord(station.RainfallElement);
    if (!rainfall) return false;

    return ["Past1hr", "Past3hr", "Past24hr"].some((period) => {
      const value = asRecord(rainfall[period])?.Precipitation;
      const parsed = parseCwaNumber(value);
      return parsed !== undefined && parsed >= 0;
    });
  });

  if (!hasUsableObservation) {
    throw new Error("rainfall payload must contain at least one timed station with usable rainfall");
  }
}

export function validateWeatherPayload(payload: unknown): void {
  const stations = stationRecords(payload);
  const hasUsableObservation = stations.some((station) => {
    if (!hasStationIdentityAndTime(station)) return false;
    const weather = asRecord(station.WeatherElement);
    if (!weather) return false;

    const temperature = parseCwaNumber(weather.AirTemperature);
    const windSpeed = parseCwaNumber(weather.WindSpeed);
    const gustSpeed = parseCwaNumber(asRecord(weather.GustInfo)?.PeakGustSpeed);
    return (
      temperature !== undefined ||
      (windSpeed !== undefined && windSpeed >= 0) ||
      (gustSpeed !== undefined && gustSpeed >= 0)
    );
  });

  if (!hasUsableObservation) {
    throw new Error("weather payload must contain at least one timed station with a usable observation");
  }
}

export async function main(options: FetchDataOptions = {}): Promise<CacheDocument> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const outputPath = options.outputPath ?? DEFAULT_OUTPUT_PATH;
  const fileSystem = options.fileSystem ?? defaultFileSystem;
  const logger = options.logger ?? console;
  const generatedAt = (options.now ?? (() => new Date()))().toISOString();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;

  const entries = CACHE_SOURCE_KEYS.map(
    (key) => [key, CWA_ENDPOINTS[key]] as const,
  );
  const results = await Promise.all(
    entries.map(([key, endpoint]) =>
      fetchSource(key, endpoint, fetchImpl, timeoutMs, retryDelayMs),
    ),
  );

  const criticalFailures = results.filter(
    (result) => CRITICAL_SOURCE_KEYS.has(result.key) && result.source.status === "error",
  );
  if (criticalFailures.length > 0) {
    const failures = criticalFailures
      .map((result) => `${result.key}: ${result.source.error ?? "unknown error"}`)
      .join("; ");
    throw new Error(`Critical CWA validation failed; refusing to replace cache. ${failures}`);
  }

  const payloadFor = (key: CwaSourceKey) => results.find((result) => result.key === key)?.payload ?? null;
  const sources: CachedSource[] = results.map((result) => result.source);

  const cache: CacheDocument = {
    generatedAt,
    sources,
    payloads: {
      generatedAt,
      warningPayload: payloadFor("warnings"),
      rainfallPayload: null,
      weatherPayload: null,
      earthquakePayload: null,
      typhoonPayload: null,
    },
  };

  const tempPath = `${outputPath}.${process.pid}.${generatedAt.replaceAll(/[^0-9]/g, "")}.tmp`;
  const contents = `${JSON.stringify(cache)}\n`;
  const cacheBytes = Buffer.byteLength(contents);
  if (cacheBytes > MAX_CACHE_BYTES) {
    throw new Error(
      `Warning cache is ${cacheBytes} bytes; refusing to replace cache above ${MAX_CACHE_BYTES} bytes.`,
    );
  }
  await fileSystem.mkdir(dirname(outputPath));
  await fileSystem.writeFile(tempPath, contents);
  await fileSystem.rename(tempPath, outputPath);

  const successfulCount = results.filter((result) => result.source.status === "success").length;
  logger.log(`Wrote ${outputPath} with ${successfulCount}/${results.length} successful CWA sources.`);
  return cache;
}

async function fetchSource(
  key: CwaSourceKey,
  endpoint: (typeof CWA_ENDPOINTS)[CwaSourceKey],
  fetchImpl: typeof fetch,
  timeoutMs: number,
  retryDelayMs: number,
): Promise<SourceResult> {
  try {
    const payload = await fetchJsonWithRetry(endpoint.url, fetchImpl, timeoutMs, retryDelayMs);
    validateSource(key, payload);
    return {
      key,
      payload,
      source: {
        key,
        id: endpoint.id,
        label: endpoint.label,
        url: endpoint.url,
        status: "success",
      },
    };
  } catch (error) {
    return {
      key,
      payload: null,
      source: {
        key,
        id: endpoint.id,
        label: endpoint.label,
        url: endpoint.url,
        status: "error",
        error: error instanceof Error ? error.message : "Unknown fetch error",
      },
    };
  }
}

async function fetchJsonWithRetry(
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  retryDelayMs: number,
): Promise<unknown> {
  try {
    return await fetchJson(url, fetchImpl, timeoutMs);
  } catch (error) {
    if (!isTransientFetchError(error)) throw error;
    if (retryDelayMs > 0) {
      await new Promise((resolvePromise) => globalThis.setTimeout(resolvePromise, retryDelayMs));
    }
    return fetchJson(url, fetchImpl, timeoutMs);
  }
}

async function fetchJson(url: string, fetchImpl: typeof fetch, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

function isTransientFetchError(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (error instanceof Error && error.name === "AbortError") return true;
  return error instanceof Error && /^HTTP 5\d\d$/.test(error.message);
}

function validateSource(key: CwaSourceKey, payload: unknown): void {
  if (key === "warnings") validateWarningPayload(payload);
  if (key === "rainfall") validateRainfallPayload(payload);
  if (key === "weather") validateWeatherPayload(payload);
}

function stationRecords(payload: unknown): Record<string, unknown>[] {
  const root = asRecord(payload);
  const cwaopendata = asRecord(root?.cwaopendata);
  const dataset = asRecord(cwaopendata?.dataset);
  const stations = dataset?.Station;
  if (Array.isArray(stations)) return stations.filter(isRecord);
  return isRecord(stations) ? [stations] : [];
}

function hasStationIdentityAndTime(station: Record<string, unknown>): boolean {
  const geoInfo = asRecord(station.GeoInfo);
  const observationTime = asRecord(station.ObsTime)?.DateTime;
  return (
    isNonEmptyString(station.StationName) &&
    isNonEmptyString(geoInfo?.CountyName) &&
    isParseableDate(observationTime)
  );
}

function parseCwaNumber(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) && value > -90 ? value : undefined;
  if (typeof value !== "string") return undefined;

  const normalized = value.trim().toUpperCase();
  if (!normalized || normalized === "X") return undefined;
  if (normalized === "T") return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > -90 ? parsed : undefined;
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${path} must be an object`);
  return value;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isParseableDate(value: unknown): value is string {
  return isNonEmptyString(value) && Number.isFinite(Date.parse(value));
}

const entryPath = process.argv[1];
if (entryPath && import.meta.url === pathToFileURL(resolve(entryPath)).href) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
