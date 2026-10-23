import type { RiskDashboardLoadResult, SourceStatus } from "./cwaClient";
import { isWarningEffectiveAt, type CountyRisk, type RiskSnapshot, type WeatherWarning } from "./riskEngine";

/**
 * current     — warning data is at most 24 hours old (live or the static snapshot)
 * expired     — the last snapshot is older than 24 hours: shown, but no conclusion
 * unavailable — no usable warning data at all
 */
export type WarningViewState = "current" | "expired" | "unavailable";
/** Age bands of the warning data, measured in the browser from the data's own time. */
export type DataAgeTier = "fresh" | "aging" | "old" | "expired";
export type MapCountyStatus = "alarm" | "advisory" | "calm" | "unknown";
export type Tone = "alarm" | "advisory" | "calm" | "unknown" | "accent";

export const OFFICIAL_WARNING_URL = "https://www.cwa.gov.tw/V8/C/P/Warning/FIFOWS.html";
const OFFICIAL_RAIN_WARNING_URL = "https://www.cwa.gov.tw/V8/C/P/Warning/W26.html";
const OFFICIAL_WIND_WARNING_URL = "https://www.cwa.gov.tw/V8/C/P/Warning/W25.html";
const OFFICIAL_TYPHOON_URL = "https://www.cwa.gov.tw/V8/C/P/Typhoon/TY_NEWS.html";

// GitHub's scheduled refresh runs every 3–4 hours in practice, so the bands
// follow what the pipeline can deliver rather than the cron setting.
export const FRESH_MAX_MINUTES = 90;
export const AGING_MAX_MINUTES = 6 * 60;
export const USABLE_MAX_MINUTES = 24 * 60;

export function dataAgeTier(minutes: number): DataAgeTier {
  if (minutes <= FRESH_MAX_MINUTES) return "fresh";
  if (minutes <= AGING_MAX_MINUTES) return "aging";
  if (minutes <= USABLE_MAX_MINUTES) return "old";
  return "expired";
}

/** When this warning data was taken from CWA: the live fetch, or the snapshot build. */
export function warningDataTime(result: RiskDashboardLoadResult | null): string | undefined {
  if (!result) return undefined;
  return result.warnings.coverage === "cached" ? result.warnings.cacheGeneratedAt : result.warnings.fetchedAt;
}

/** Whether the load produced trustworthy warning data, ignoring its age. */
export function warningViewState(result: RiskDashboardLoadResult | null): "current" | "unavailable" {
  if (!result || result.warnings.currentness !== "current" || result.warnings.coverage === "unavailable") return "unavailable";
  return "current";
}

/**
 * Like warningViewState, but ages the data in the browser so a page left open
 * (or a delayed snapshot) moves through the bands; past 24 hours it fails closed.
 */
export function warningViewStateAt(result: RiskDashboardLoadResult | null, now: number): WarningViewState {
  if (warningViewState(result) === "unavailable") return "unavailable";
  const age = minutesSince(warningDataTime(result), now);
  if (age === null) return "unavailable";
  return dataAgeTier(age) === "expired" ? "expired" : "current";
}

/**
 * Re-applies each warning's own CWA validity window at `now`, so a warning that
 * ended after the snapshot was taken is no longer shown as active.
 */
export function snapshotEffectiveAt(snapshot: RiskSnapshot, now: number): { snapshot: RiskSnapshot; endedCount: number } {
  const reference = new Date(now).toISOString();
  let endedCount = 0;
  const counties = snapshot.counties.map((county) => {
    const warnings = county.warnings.filter((warning) => isWarningEffectiveAt(warning, reference));
    endedCount += county.warnings.length - warnings.length;
    return warnings.length === county.warnings.length ? county : { ...county, warnings };
  });
  if (endedCount === 0) return { snapshot, endedCount };
  return {
    snapshot: {
      ...snapshot,
      counties,
      national: { ...snapshot.national, activeWarningCountyCount: counties.filter((county) => county.warnings.length > 0).length },
    },
    endedCount,
  };
}

/** CWA's own significance word decides the tone; this is not a site risk score. */
export function warningTone(warning: WeatherWarning): "alarm" | "advisory" {
  return warning.significance.includes("警報") ? "alarm" : "advisory";
}

export function countyMapStatus(county: CountyRisk, viewState: WarningViewState): MapCountyStatus {
  if (viewState === "unavailable") return "unknown";
  if (county.warnings.some((warning) => warningTone(warning) === "alarm")) return "alarm";
  if (county.warnings.length > 0) return "advisory";
  // Data older than 24 hours cannot show that a county has no warning.
  return viewState === "expired" ? "unknown" : "calm";
}

export interface AnswerPresentation {
  eyebrow: string;
  /** Small text before the focal answer (usually the county name). */
  lead?: string;
  /** The single focal answer; segments are joined with a line-break hint. */
  focal: string[];
  /** Small text after the focal answer. */
  tail?: string;
  detail: string;
  tone: Tone;
}

/** Accessible heading text: lead, focal and tail separated by spaces. */
export function answerTitle(answer: AnswerPresentation): string {
  return [answer.lead, answer.focal.join(""), answer.tail].filter(Boolean).join(" ");
}

export function countyWarningPresentation(
  county: CountyRisk | null,
  viewState: WarningViewState,
  countyName = county?.countyName,
): AnswerPresentation {
  if (viewState === "unavailable") {
    return {
      eyebrow: "警特報待確認",
      lead: countyName ? undefined : "目前",
      focal: ["無法確認"],
      tail: countyName ? `${countyName} 現況` : "全台警特報",
      detail: "目前取不到 CWA 警特報資料。空資料不等於沒有警報，請到 CWA 官方頁確認。",
      tone: "unknown",
    };
  }

  if (viewState === "expired") {
    // Past 24 hours the last snapshot is still shown below, but the page draws no conclusion.
    return {
      eyebrow: "最後一筆資料超過 24 小時",
      lead: countyName ? undefined : "目前",
      focal: ["無法確認"],
      tail: countyName ? `${countyName} 現況` : "全台警特報",
      detail: "下方是 24 小時前的資料，只供參考；現況請到 CWA 官方頁確認。",
      tone: "unknown",
    };
  }

  if (!county) {
    return {
      eyebrow: "先選目的地",
      lead: "選一個縣市查看",
      focal: [],
      detail: "用選單或點地圖選縣市，先看 CWA 警特報。",
      tone: "accent",
    };
  }

  if (county.warnings.length > 0) {
    return {
      eyebrow: "CWA 有效警特報",
      lead: county.countyName,
      focal: [`有 ${county.warnings.length} 項警特報`],
      detail: "CWA 列出的有效時間與影響範圍如下，完整內容以官方公告為準。",
      tone: county.warnings.some((warning) => warningTone(warning) === "alarm") ? "alarm" : "advisory",
    };
  }

  return {
    eyebrow: "CWA 警特報資料已取得",
    lead: county.countyName,
    focal: ["未列有效", "縣市警特報"],
    detail: "截至資料時間，CWA 未列該縣市的有效警特報；這不代表所有災害都安全。",
    tone: "calm",
  };
}

export function sourceDisplay(source: SourceStatus): { label: string; tone: Tone } {
  if (source.provenance === "live" && source.status === "success" && !source.stale) {
    return { label: "直接取得", tone: "accent" };
  }
  if (source.provenance === "cache") {
    return { label: source.stale ? "快取偏舊" : "快取替代", tone: "advisory" };
  }
  if (source.provenance === "live") {
    return { label: "來源偏舊", tone: "advisory" };
  }
  return { label: "無法取得", tone: "alarm" };
}

export function sourceSummary(result: RiskDashboardLoadResult | null, key: SourceStatus["key"]): string {
  const source = result?.sources.find((candidate) => candidate.key === key);
  if (!source) return "來源狀態待確認";
  const display = sourceDisplay(source);
  const confirmationTime = source.provenance === "cache" ? source.cacheGeneratedAt : source.fetchedAt;
  return `${display.label}，${confirmationTime ? formatDateTime(confirmationTime) : "時間未提供"}`;
}

export function actionForWarning(warning: WeatherWarning): string {
  if (warning.phenomena.includes("颱風")) return "留意官方颱風警報與停班停課公告；避免前往海邊、山區與河川，提前確認交通運輸狀況。";
  if (warning.phenomena.includes("雨")) return "先確認目的地是否位於警示範圍；避免前往溪河、低窪與山區易崩塌路段，並查看官方雨勢更新。";
  if (warning.phenomena.includes("風")) return "避開沿海與空曠處，固定易掉落物；騎車、行車與搭船前先確認官方更新。";
  if (warning.phenomena.includes("高溫")) return "補充水分並減少正午戶外曝曬；長者、幼童與慢性病族群要特別留意。";
  if (warning.phenomena.includes("低溫")) return "加強保暖並留意長者與心血管疾病族群；山區行程先查路況。";
  if (warning.phenomena.includes("霧")) return "行車減速、開啟適當車燈並增加車距；能見度不佳時延後山區或沿海行程。";
  return "先查看官方警特報全文與地方政府資訊，再決定是否調整行程。";
}

export function officialWarningUrl(warning: WeatherWarning | undefined): string {
  // Checked before 風 so 颱風警報 does not link to the strong-wind page.
  if (warning?.phenomena.includes("颱風")) return OFFICIAL_TYPHOON_URL;
  if (warning?.phenomena.includes("雨")) return OFFICIAL_RAIN_WARNING_URL;
  if (warning?.phenomena.includes("風")) return OFFICIAL_WIND_WARNING_URL;
  return OFFICIAL_WARNING_URL;
}

export function formatValidity(warning: WeatherWarning): string {
  const start = warning.startTime ? `開始 ${formatDateTime(warning.startTime)}` : "開始時間未提供";
  return warning.endTime ? `${start}，結束 ${formatDateTime(warning.endTime)}` : start;
}

export function formatMetric(value: number | undefined, unit: string): string {
  return value === undefined ? "--" : `${formatNumber(value)} ${unit}`;
}

export function formatNumber(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "--";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function formatDateTime(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/** Minutes between an ISO timestamp and `now`, or null when unparseable. */
export function minutesSince(value: string | undefined, now: number): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.max(0, Math.floor((now - time) / 60_000));
}

export function formatAge(minutes: number): string {
  if (minutes < 1) return "剛剛";
  if (minutes < 60) return `${minutes} 分鐘前`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)} 小時前`;
  return `${Math.floor(minutes / (60 * 24))} 天前`;
}

const TAIPEI_DATE = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" });

/** "14:05" for today in Taipei, "10/21 14:05" otherwise. */
export function formatClock(value: string, now: number): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  const time = new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
  if (TAIPEI_DATE.format(date) === TAIPEI_DATE.format(new Date(now))) return time;
  const day = new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", month: "2-digit", day: "2-digit" }).format(date);
  return `${day} ${time}`;
}

/** The standard data-time label: 「資料時間 HH:MM · N 小時前」. */
export function dataTimeLabel(value: string, now: number): string {
  const age = minutesSince(value, now) ?? 0;
  return `資料時間 ${formatClock(value, now)} · ${formatAge(age)}`;
}
