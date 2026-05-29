export type RiskLevel = "safe" | "watch" | "elevated" | "high" | "stale";

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
  level: RiskLevel;
  score: number;
  warnings: WeatherWarning[];
  reasons: string[];
  metrics: {
    maxPast1h?: number;
    maxPast3h?: number;
    maxPast24h?: number;
    maxTemperature?: number;
    maxWindSpeed?: number;
    maxGustSpeed?: number;
    earthquakeIntensity?: number;
  };
}

export interface RiskSnapshot {
  generatedAt: string;
  national: {
    level: RiskLevel;
    score: number;
    answer: string;
    activeWarningCountyCount: number;
  };
  counties: CountyRisk[];
  attentionToday: string[];
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
  const warningsByCounty = groupBy(input.warnings, (warning) => warning.countyName);
  const rainByCounty = groupBy(input.rainfallStations, (station) => station.countyName);
  const weatherByCounty = groupBy(input.weatherStations, (station) => station.countyName);
  const earthquakeRecent = isRecent(input.earthquake?.occurredAt, input.generatedAt, 24);
  const typhoonActive = isRecent(input.typhoon?.latestAt, input.generatedAt, 48);

  const counties = COUNTIES.map((county) => {
    const warnings = warningsByCounty.get(county.countyName) ?? [];
    const rainfall = rainByCounty.get(county.countyName) ?? [];
    const weather = weatherByCounty.get(county.countyName) ?? [];
    const earthquakeIntensity = input.earthquake?.countyIntensities.find(
      (intensity) => intensity.countyName === county.countyName,
    )?.maxIntensity;

    const reasons: string[] = [];
    let score = 0;

    for (const warning of warnings) {
      const weight = warningWeight(warning.phenomena);
      score += weight;
      reasons.push(formatWarningReason(warning));
    }

    const maxPast1h = maxNumber(rainfall.map((station) => station.past1h));
    const maxPast3h = maxNumber(rainfall.map((station) => station.past3h));
    const maxPast24h = maxNumber(rainfall.map((station) => station.past24h));

    if (maxPast1h !== undefined) {
      const rainScore = thresholdScore(maxPast1h, [
        [40, 55],
        [20, 30],
      ]);
      score += rainScore;
      if (rainScore > 0) reasons.push(`1小時 ${formatNumber(maxPast1h)} mm 強降雨`);
    }

    if (maxPast3h !== undefined) {
      const rainScore = thresholdScore(maxPast3h, [
        [100, 50],
        [50, 30],
      ]);
      score += rainScore;
      if (rainScore > 0) reasons.push(`3小時 ${formatNumber(maxPast3h)} mm 累積雨量`);
    }

    if (maxPast24h !== undefined) {
      const rainScore = thresholdScore(maxPast24h, [
        [200, 55],
        [80, 30],
      ]);
      score += rainScore;
      if (rainScore > 0) reasons.push(`24小時 ${formatNumber(maxPast24h)} mm 累積雨量`);
    }

    const maxWindSpeed = maxNumber(weather.map((station) => station.windSpeed));
    const maxGustSpeed = maxNumber(weather.map((station) => station.gustSpeed));
    const maxTemperature = maxNumber(weather.map((station) => station.temperature));

    if (maxGustSpeed !== undefined || maxWindSpeed !== undefined) {
      const gust = maxGustSpeed ?? 0;
      const average = maxWindSpeed ?? 0;
      const windScore = Math.max(
        thresholdScore(gust, [
          [20.8, 45],
          [17.2, 35],
          [10.8, 18],
        ]),
        thresholdScore(average, [
          [13.9, 35],
          [10.8, 22],
        ]),
      );
      score += windScore;
      if (windScore > 0) reasons.push(`陣風 ${formatNumber(gust || average)} m/s`);
    }

    if (maxTemperature !== undefined) {
      const tempScore = thresholdScore(maxTemperature, [
        [38, 45],
        [36, 35],
        [33, 15],
      ]);
      score += tempScore;
      if (tempScore > 0) reasons.push(`高溫 ${formatNumber(maxTemperature)} °C`);
    }

    if (earthquakeRecent && earthquakeIntensity !== undefined && earthquakeIntensity >= 3) {
      score += earthquakeIntensity >= 5 ? 35 : 20;
      reasons.push(`近24小時有感地震 ${earthquakeIntensity}級`);
    }

    if (typhoonActive && input.typhoon?.distanceKmFromTaiwan !== undefined) {
      const typhoonScore = thresholdScore(input.typhoon.distanceKmFromTaiwan * -1, [
        [-400, 28],
        [-800, 10],
      ]);
      score += typhoonScore;
      if (typhoonScore > 0) reasons.push(`熱帶氣旋${input.typhoon.localName ?? input.typhoon.name ?? ""}需留意`);
    }

    return {
      countyName: county.countyName,
      geocode: county.geocode,
      region: county.region,
      level: levelFromScore(score),
      score,
      warnings,
      reasons,
      metrics: {
        maxPast1h,
        maxPast3h,
        maxPast24h,
        maxTemperature,
        maxWindSpeed,
        maxGustSpeed,
        earthquakeIntensity,
      },
    } satisfies CountyRisk;
  }).sort(compareCountyRisk);

  const nationalScore = counties[0]?.score ?? 0;
  const nationalLevel = levelFromScore(nationalScore);
  const activeWarningCountyCount = new Set(input.warnings.map((warning) => warning.countyName)).size;

  return {
    generatedAt: input.generatedAt,
    national: {
      level: nationalLevel,
      score: nationalScore,
      answer: nationalAnswer(nationalLevel, activeWarningCountyCount),
      activeWarningCountyCount,
    },
    counties,
    attentionToday: buildAttentionItems(counties, input),
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
  const locations = asArray(hazard?.hazard?.info?.affectedAreas?.location);
  return locations.map((location) => stringOrEmpty(location?.locationName)).filter(Boolean);
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

function warningWeight(phenomena: string): number {
  if (phenomena.includes("超大豪雨")) return 90;
  if (phenomena.includes("大豪雨")) return 78;
  if (phenomena.includes("豪雨")) return 60;
  if (phenomena.includes("大雨")) return 45;
  if (phenomena.includes("颱風")) return 75;
  if (phenomena.includes("強風")) return 35;
  if (phenomena.includes("高溫")) return 35;
  if (phenomena.includes("低溫")) return 25;
  if (phenomena.includes("濃霧")) return 20;
  return 18;
}

function formatWarningReason(warning: WeatherWarning): string {
  const area = warning.affectedAreas.length > 0 ? `（${warning.affectedAreas.join("、")}）` : "";
  return `${warning.phenomena}${warning.significance}${area}`;
}

function thresholdScore(value: number, thresholds: Array<[number, number]>): number {
  const matched = thresholds.find(([threshold]) => value >= threshold);
  return matched?.[1] ?? 0;
}

function maxNumber(values: Array<number | undefined>): number | undefined {
  const valid = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return valid.length > 0 ? Math.max(...valid) : undefined;
}

function levelFromScore(score: number): RiskLevel {
  if (score >= 75) return "high";
  if (score >= 45) return "elevated";
  if (score >= 20) return "watch";
  return "safe";
}

function compareCountyRisk(a: CountyRisk, b: CountyRisk): number {
  if (b.score !== a.score) return b.score - a.score;
  return COUNTIES.findIndex((county) => county.countyName === a.countyName) -
    COUNTIES.findIndex((county) => county.countyName === b.countyName);
}

function nationalAnswer(level: RiskLevel, activeWarningCountyCount: number): string {
  if (level === "high") return `台灣目前天氣風險偏高，${activeWarningCountyCount} 個縣市有警特報或強觀測訊號。`;
  if (level === "elevated") return `台灣目前有局部天氣風險，${activeWarningCountyCount} 個縣市需要留意。`;
  if (level === "watch") return "台灣目前大致可正常活動，但仍有局部天氣訊號需要觀察。";
  if (level === "stale") return "資料更新偏舊，請先確認官方最新資訊。";
  return "台灣目前整體天氣風險偏低。";
}

function buildAttentionItems(counties: CountyRisk[], input: RiskSnapshotInput): string[] {
  const items: string[] = [];
  const topCounties = counties.filter((county) => county.score > 0).slice(0, 3);
  const heavyRainWarning = input.warnings.find((warning) => warning.phenomena.includes("雨"));

  if (heavyRainWarning) {
    const area = heavyRainWarning.affectedAreas.length > 0 ? heavyRainWarning.affectedAreas.join("、") : "山區與低窪地區";
    items.push(`${heavyRainWarning.countyName}${area}留意短延時強降雨、溪水暴漲與道路積淹水。`);
  }

  const windCounty = counties.find((county) => (county.metrics.maxGustSpeed ?? 0) >= 17.2 || county.warnings.some((warning) => warning.phenomena.includes("強風")));
  if (windCounty) {
    items.push(`${windCounty.countyName}沿海與空曠地區留意強陣風，外出固定招牌、盆栽與機車。`);
  }

  if (input.typhoon && isRecent(input.typhoon.latestAt, input.generatedAt, 48)) {
    items.push(`熱帶氣旋${input.typhoon.localName ?? input.typhoon.name ?? ""}仍在活動，留意 CWA 最新颱風消息與海面風浪。`);
  }

  if (input.earthquake && isRecent(input.earthquake.occurredAt, input.generatedAt, 24)) {
    items.push("近24小時有感地震後，山區道路與邊坡請留意落石及餘震資訊。");
  }

  if (items.length === 0 && topCounties.length > 0) {
    items.push(`${topCounties.map((county) => county.countyName).join("、")}有局部天氣訊號，出門前確認官方警特報。`);
  }

  if (items.length === 0) {
    items.push("目前未見明顯警特報，仍建議出門前確認目的地天氣與交通狀況。");
  }

  return items;
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

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
