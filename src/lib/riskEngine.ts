export interface CountyDefinition {
  countyName: string;
  geocode: string;
  region: "north" | "central" | "south" | "east" | "islands";
}

export interface WeatherWarning {
  countyName: string;
  geocode: string;
  phenomena: string;
  significance: string;
  startTime?: string;
  endTime?: string;
  affectedAreas: string[];
}

export interface RainfallStation {
  countyName: string;
  stationName: string;
  observedAt?: string;
  past1h?: number;
  past3h?: number;
  past24h?: number;
}

export interface WeatherStation {
  countyName: string;
  stationName: string;
  observedAt?: string;
  temperature?: number;
  windSpeed?: number;
  gustSpeed?: number;
}

export interface EarthquakeSignal {
  occurredAt?: string;
  magnitude?: number;
  depthKm?: number;
  description?: string;
  countyIntensities: Array<{
    countyName: string;
    maxIntensity: number;
  }>;
}

export interface TyphoonSignal {
  name?: string;
  localName?: string;
  latestAt?: string;
  distanceKmFromTaiwan?: number;
  maxWindSpeed?: number;
}

export interface RiskSnapshotInput {
  generatedAt: string;
  warnings: WeatherWarning[];
  rainfallStations: RainfallStation[];
  weatherStations: WeatherStation[];
  earthquake?: EarthquakeSignal | null;
  typhoon?: TyphoonSignal | null;
}

export interface CountyRisk {
  countyName: string;
  geocode: string;
  region: CountyDefinition["region"];
  warnings: WeatherWarning[];
  metrics: {
    maxPast1h?: number;
    maxPast3h?: number;
    maxPast24h?: number;
    maxTemperature?: number;
    maxWindSpeed?: number;
    maxGustSpeed?: number;
  };
}

export interface RiskSnapshot {
  generatedAt: string;
  national: {
    activeWarningCountyCount: number;
  };
  counties: CountyRisk[];
  sections: {
    rainfall: {
      maxPast1h?: RankedRainfall;
      maxPast3h?: RankedRainfall;
      maxPast24h?: RankedRainfall;
    };
    wind: {
      maxGust?: RankedWind;
      maxAverage?: RankedWind;
    };
    temperature: {
      hottest?: RankedTemperature;
      coldest?: RankedTemperature;
    };
    earthquake: {
      recent: boolean;
      signal?: EarthquakeSignal | null;
    };
    typhoon: {
      active: boolean;
      signal?: TyphoonSignal | null;
    };
  };
}

interface RankedRainfall {
  countyName: string;
  stationName: string;
  observedAt?: string;
  value: number;
}

interface RankedWind {
  countyName: string;
  stationName: string;
  observedAt?: string;
  value: number;
}

interface RankedTemperature {
  countyName: string;
  stationName: string;
  observedAt?: string;
  value: number;
}

export const COUNTIES: CountyDefinition[] = [
  { countyName: "基隆市", geocode: "10017", region: "north" },
  { countyName: "臺北市", geocode: "63", region: "north" },
  { countyName: "新北市", geocode: "65", region: "north" },
  { countyName: "桃園市", geocode: "68", region: "north" },
  { countyName: "新竹市", geocode: "10018", region: "north" },
  { countyName: "新竹縣", geocode: "10004", region: "north" },
  { countyName: "苗栗縣", geocode: "10005", region: "central" },
  { countyName: "臺中市", geocode: "66", region: "central" },
  { countyName: "彰化縣", geocode: "10007", region: "central" },
  { countyName: "南投縣", geocode: "10008", region: "central" },
  { countyName: "雲林縣", geocode: "10009", region: "central" },
  { countyName: "嘉義市", geocode: "10020", region: "south" },
  { countyName: "嘉義縣", geocode: "10010", region: "south" },
  { countyName: "臺南市", geocode: "67", region: "south" },
  { countyName: "高雄市", geocode: "64", region: "south" },
  { countyName: "屏東縣", geocode: "10013", region: "south" },
  { countyName: "宜蘭縣", geocode: "10002", region: "east" },
  { countyName: "花蓮縣", geocode: "10015", region: "east" },
  { countyName: "臺東縣", geocode: "10014", region: "east" },
  { countyName: "澎湖縣", geocode: "10016", region: "islands" },
  { countyName: "金門縣", geocode: "09020", region: "islands" },
  { countyName: "連江縣", geocode: "09007", region: "islands" },
];

export function normalizeWarningData(raw: any): WeatherWarning[] {
  const locations = asArray(raw?.cwaopendata?.dataset?.location);

  return locations.flatMap((location) => {
    const hazards = asArray(location?.hazardConditions?.hazards);

    return hazards
      .map((hazard) => {
        const phenomena = stringOrEmpty(hazard?.info?.phenomena);
        const significance = stringOrEmpty(hazard?.info?.significance);

        if (!phenomena && !significance) {
          return null;
        }

        const warning: WeatherWarning = {
          countyName: stringOrEmpty(location?.locationName),
          geocode: stringOrEmpty(location?.geocode),
          phenomena,
          significance,
          startTime: optionalString(hazard?.validTime?.startTime),
          endTime: optionalString(hazard?.validTime?.endTime),
          affectedAreas: normalizeAffectedAreas(hazard),
        };

        return warning;
      })
      .filter((warning): warning is WeatherWarning => warning !== null);
  });
}

export function buildRiskSnapshot(input: RiskSnapshotInput): RiskSnapshot {
  const countyNames = new Set(COUNTIES.map((county) => county.countyName));
  const activeWarnings = input.warnings.filter(
    (warning) => countyNames.has(warning.countyName) && isWarningEffectiveAt(warning, input.generatedAt),
  );
  const warningsByCounty = groupBy(activeWarnings, (warning) => warning.countyName);
  const rainByCounty = groupBy(input.rainfallStations, (station) => station.countyName);
  const weatherByCounty = groupBy(input.weatherStations, (station) => station.countyName);
  const earthquakeRecent = isRecent(input.earthquake?.occurredAt, input.generatedAt, 24);
  const typhoonActive = isRecent(input.typhoon?.latestAt, input.generatedAt, 48);

  const counties = COUNTIES.map((county) => {
    const warnings = warningsByCounty.get(county.countyName) ?? [];
    const rainfall = rainByCounty.get(county.countyName) ?? [];
    const weather = weatherByCounty.get(county.countyName) ?? [];

    const maxPast1h = maxNumber(rainfall.map((station) => station.past1h));
    const maxPast3h = maxNumber(rainfall.map((station) => station.past3h));
    const maxPast24h = maxNumber(rainfall.map((station) => station.past24h));

    const maxWindSpeed = maxNumber(weather.map((station) => station.windSpeed));
    const maxGustSpeed = maxNumber(weather.map((station) => station.gustSpeed));
    const maxTemperature = maxNumber(weather.map((station) => station.temperature));

    return {
      countyName: county.countyName,
      geocode: county.geocode,
      region: county.region,
      warnings,
      metrics: {
        maxPast1h,
        maxPast3h,
        maxPast24h,
        maxTemperature,
        maxWindSpeed,
        maxGustSpeed,
      },
    } satisfies CountyRisk;
  }).sort(compareCountyWarnings);

  const activeWarningCountyCount = counties.filter((county) => county.warnings.length > 0).length;

  return {
    generatedAt: input.generatedAt,
    national: {
      activeWarningCountyCount,
    },
    counties,
    sections: {
      rainfall: {
        maxPast1h: rankRain(input.rainfallStations, "past1h"),
        maxPast3h: rankRain(input.rainfallStations, "past3h"),
        maxPast24h: rankRain(input.rainfallStations, "past24h"),
      },
      wind: {
        maxGust: rankWind(input.weatherStations, "gustSpeed"),
        maxAverage: rankWind(input.weatherStations, "windSpeed"),
      },
      temperature: {
        hottest: rankTemperature(input.weatherStations, "temperature", "desc"),
        coldest: rankTemperature(input.weatherStations, "temperature", "asc"),
      },
      earthquake: {
        recent: earthquakeRecent,
        signal: input.earthquake,
      },
      typhoon: {
        active: typhoonActive,
        signal: input.typhoon,
      },
    },
  };
}

function normalizeAffectedAreas(hazard: any): string[] {
  return asArray(hazard?.hazard).flatMap((detail) =>
    asArray(detail?.info?.affectedAreas?.location)
      .map((location) => stringOrEmpty(location?.locationName))
      .filter(Boolean),
  );
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

function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}

function maxNumber(values: Array<number | undefined>): number | undefined {
  const valid = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return valid.length > 0 ? Math.max(...valid) : undefined;
}

function compareCountyWarnings(a: CountyRisk, b: CountyRisk): number {
  if (b.warnings.length !== a.warnings.length) return b.warnings.length - a.warnings.length;
  return COUNTIES.findIndex((county) => county.countyName === a.countyName) -
    COUNTIES.findIndex((county) => county.countyName === b.countyName);
}

function isWarningEffectiveAt(warning: WeatherWarning, reference: string): boolean {
  const referenceTime = new Date(reference).getTime();
  if (!Number.isFinite(referenceTime)) return false;

  if (warning.startTime) {
    const startTime = new Date(warning.startTime).getTime();
    if (!Number.isFinite(startTime) || startTime > referenceTime) return false;
  }

  if (warning.endTime) {
    const endTime = new Date(warning.endTime).getTime();
    if (!Number.isFinite(endTime) || endTime <= referenceTime) return false;
  }

  return true;
}

function isRecent(value: string | undefined, reference: string, hours: number): boolean {
  if (!value) return false;
  const targetTime = new Date(value).getTime();
  const referenceTime = new Date(reference).getTime();
  if (!Number.isFinite(targetTime) || !Number.isFinite(referenceTime)) return false;
  const diffHours = (referenceTime - targetTime) / (1000 * 60 * 60);
  return diffHours >= 0 && diffHours <= hours;
}

function rankRain(stations: RainfallStation[], field: "past1h" | "past3h" | "past24h"): RankedRainfall | undefined {
  const station = stations
    .filter((item) => typeof item[field] === "number")
    .sort((a, b) => (b[field] ?? 0) - (a[field] ?? 0))[0];

  if (!station || station[field] === undefined) return undefined;
  return {
    countyName: station.countyName,
    stationName: station.stationName,
    observedAt: station.observedAt,
    value: station[field],
  };
}

function rankWind(stations: WeatherStation[], field: "gustSpeed" | "windSpeed"): RankedWind | undefined {
  const station = stations
    .filter((item) => typeof item[field] === "number")
    .sort((a, b) => (b[field] ?? 0) - (a[field] ?? 0))[0];

  if (!station || station[field] === undefined) return undefined;
  return {
    countyName: station.countyName,
    stationName: station.stationName,
    observedAt: station.observedAt,
    value: station[field],
  };
}

function rankTemperature(
  stations: WeatherStation[],
  field: "temperature",
  direction: "asc" | "desc",
): RankedTemperature | undefined {
  const station = stations
    .filter((item) => typeof item[field] === "number")
    .sort((a, b) => (direction === "desc" ? (b[field] ?? 0) - (a[field] ?? 0) : (a[field] ?? 0) - (b[field] ?? 0)))[0];

  if (!station || station[field] === undefined) return undefined;
  return {
    countyName: station.countyName,
    stationName: station.stationName,
    observedAt: station.observedAt,
    value: station[field],
  };
}
