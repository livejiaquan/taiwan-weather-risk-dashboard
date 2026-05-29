import {
  normalizeWarningData,
  type EarthquakeSignal,
  type RainfallStation,
  type RiskSnapshotInput,
  type TyphoonSignal,
  type WeatherStation,
} from "./riskEngine";

const TAIWAN_REFERENCE = {
  latitude: 23.7,
  longitude: 121.0,
};

export const CWA_ENDPOINTS = {
  warnings: {
    id: "W-C0033-001",
    label: "縣市天氣警特報",
    url: "https://cwaopendata.s3.ap-northeast-1.amazonaws.com/Warning/W-C0033-001.json",
  },
  rainfall: {
    id: "O-A0002-001",
    label: "自動雨量站雨量資料",
    url: "https://cwaopendata.s3.ap-northeast-1.amazonaws.com/Observation/O-A0002-001.json",
  },
  weather: {
    id: "O-A0001-001",
    label: "自動氣象站觀測資料",
    url: "https://cwaopendata.s3.ap-northeast-1.amazonaws.com/Observation/O-A0001-001.json",
  },
  earthquake: {
    id: "E-A0015-005",
    label: "顯著有感地震縣市震度",
    url: "https://cwaopendata.s3.ap-northeast-1.amazonaws.com/Earthquake/E-A0015-005.json",
  },
  typhoon: {
    id: "W-C0034-005",
    label: "熱帶氣旋路徑",
    url: "https://cwaopendata.s3.ap-northeast-1.amazonaws.com/Warning/W-C0034-005.json",
  },
} as const;

export type CwaSourceKey = keyof typeof CWA_ENDPOINTS;

export interface CwaPayloads {
  generatedAt: string;
  warningPayload: unknown | null;
  rainfallPayload: unknown | null;
  weatherPayload: unknown | null;
  earthquakePayload: unknown | null;
  typhoonPayload: unknown | null;
}

export function normalizeRainfallData(raw: any): RainfallStation[] {
  return asArray(raw?.cwaopendata?.dataset?.Station)
    .map((station) => {
      const countyName = stringOrEmpty(station?.GeoInfo?.CountyName);
      const stationName = stringOrEmpty(station?.StationName);
      if (!countyName || !stationName) return null;

      const normalized: RainfallStation = {
        countyName,
        stationName,
        observedAt: optionalString(station?.ObsTime?.DateTime),
        past1h: parseCwaNumber(station?.RainfallElement?.Past1hr?.Precipitation),
        past3h: parseCwaNumber(station?.RainfallElement?.Past3hr?.Precipitation),
        past24h: parseCwaNumber(station?.RainfallElement?.Past24hr?.Precipitation),
      };

      return normalized;
    })
    .filter((station): station is RainfallStation => station !== null);
}

export function normalizeWeatherStationData(raw: any): WeatherStation[] {
  return asArray(raw?.cwaopendata?.dataset?.Station)
    .map((station) => {
      const countyName = stringOrEmpty(station?.GeoInfo?.CountyName);
      const stationName = stringOrEmpty(station?.StationName);
      if (!countyName || !stationName) return null;

      const normalized: WeatherStation = {
        countyName,
        stationName,
        observedAt: optionalString(station?.ObsTime?.DateTime),
        temperature: parseCwaNumber(station?.WeatherElement?.AirTemperature),
        windSpeed: parseCwaNumber(station?.WeatherElement?.WindSpeed),
        gustSpeed: parseCwaNumber(station?.WeatherElement?.GustInfo?.PeakGustSpeed),
      };

      return normalized;
    })
    .filter((station): station is WeatherStation => station !== null);
}

export function normalizeEarthquakeData(raw: any): EarthquakeSignal | null {
  const earthquake = raw?.cwaopendata?.Earthquake;
  if (!earthquake) return null;

  return {
    occurredAt: optionalString(earthquake?.OriginTime),
    magnitude: parseCwaNumber(earthquake?.Magnitude?.MagnitudeValue),
    depthKm: parseCwaNumber(earthquake?.FocalDepth),
    description: optionalString(earthquake?.Description),
    countyIntensities: asArray(earthquake?.Intensity?.County)
      .map((county) => {
        const countyName = stringOrEmpty(county?.CountyName);
        if (!countyName) return null;
        return {
          countyName,
          maxIntensity: parseIntensity(county?.CountyMaxIntensity),
        };
      })
      .filter((intensity): intensity is { countyName: string; maxIntensity: number } => intensity !== null),
  };
}

export function normalizeTyphoonData(raw: any): TyphoonSignal | null {
  const cyclones = asArray(raw?.cwaopendata?.Dataset?.TropicalCyclones?.TropicalCyclone);
  const candidates = cyclones
    .map((cyclone) => {
      const latestFix = latestByDate(asArray(cyclone?.AnalysisData?.Fix), (fix) => optionalString(fix?.DateTime));
      if (!latestFix) return null;

      const latitude = parseCwaNumber(latestFix?.CoordinateLatitude);
      const longitude = parseCwaNumber(latestFix?.CoordinateLongitude);
      const distanceKmFromTaiwan =
        latitude !== undefined && longitude !== undefined
          ? haversineKm(latitude, longitude, TAIWAN_REFERENCE.latitude, TAIWAN_REFERENCE.longitude)
          : undefined;

      const signal: TyphoonSignal = {
        name: optionalString(cyclone?.TyphoonName),
        localName: optionalString(cyclone?.CwaTyphoonName),
        latestAt: optionalString(latestFix?.DateTime),
        distanceKmFromTaiwan,
        maxWindSpeed: parseCwaNumber(latestFix?.MaxWindSpeed),
      };

      return signal;
    })
    .filter((signal): signal is TyphoonSignal => signal !== null);

  return latestByDate(candidates, (signal) => signal.latestAt) ?? null;
}

export function createRiskInputFromCwaPayloads(payloads: CwaPayloads): RiskSnapshotInput {
  return {
    generatedAt: payloads.generatedAt,
    warnings: payloads.warningPayload ? normalizeWarningData(payloads.warningPayload) : [],
    rainfallStations: payloads.rainfallPayload ? normalizeRainfallData(payloads.rainfallPayload) : [],
    weatherStations: payloads.weatherPayload ? normalizeWeatherStationData(payloads.weatherPayload) : [],
    earthquake: payloads.earthquakePayload ? normalizeEarthquakeData(payloads.earthquakePayload) : null,
    typhoon: payloads.typhoonPayload ? normalizeTyphoonData(payloads.typhoonPayload) : null,
  };
}

function parseCwaNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;

  const normalized = value.trim();
  if (!normalized || normalized === "X" || normalized === "-99" || normalized === "-98") return undefined;
  if (normalized.toUpperCase() === "T") return 0;

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseIntensity(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return 0;
  const match = value.match(/\d+/);
  return match ? Number.parseInt(match[0], 10) : 0;
}

function latestByDate<T>(items: T[], getDate: (item: T) => string | undefined): T | undefined {
  return items
    .filter((item) => getDate(item))
    .sort((a, b) => new Date(getDate(b) ?? "").getTime() - new Date(getDate(a) ?? "").getTime())[0];
}

function asArray<T>(value: T | T[] | null | undefined): T[] {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function stringOrEmpty(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const radiusKm = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(radiusKm * c);
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}
