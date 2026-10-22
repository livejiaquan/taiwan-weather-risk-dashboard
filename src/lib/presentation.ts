import type { RiskDashboardLoadResult, SourceStatus } from "./cwaClient";
import type { CountyRisk, WeatherWarning } from "./riskEngine";

export type WarningViewState = "current" | "cached" | "unavailable";
export type MapCountyStatus = "alarm" | "advisory" | "calm" | "unknown";
export type Tone = "alarm" | "advisory" | "calm" | "unknown" | "accent";

export const OFFICIAL_WARNING_URL = "https://www.cwa.gov.tw/V8/C/P/Warning/FIFOWS.html";
const OFFICIAL_RAIN_WARNING_URL = "https://www.cwa.gov.tw/V8/C/P/Warning/W26.html";
const OFFICIAL_WIND_WARNING_URL = "https://www.cwa.gov.tw/V8/C/P/Warning/W25.html";
const OFFICIAL_TYPHOON_URL = "https://www.cwa.gov.tw/V8/C/P/Typhoon/TY_NEWS.html";

/** Data older than this while the page stays open is flagged as worth refreshing. */
export const REFRESH_SUGGESTED_AFTER_MINUTES = 30;

export function warningViewState(result: RiskDashboardLoadResult | null): WarningViewState {
  if (!result || result.warnings.currentness !== "current") return "unavailable";
  if (result.warnings.coverage === "current") return "current";
  if (result.warnings.coverage === "cached") return "cached";
  return "unavailable";
}

/** Matches the static cache budget in cwaClient: older warning data is not trusted. */
export const WARNING_TRUST_WINDOW_MINUTES = 90;

/**
 * Like warningViewState, but also expires trust as the page stays open: once the
 * last confirmation is older than the trust window, the page fails closed.
 */
export function warningViewStateAt(result: RiskDashboardLoadResult | null, now: number): WarningViewState {
  const base = warningViewState(result);
  if (!result || base === "unavailable") return "unavailable";
  const confirmedAt = base === "cached" ? result.warnings.cacheGeneratedAt : result.warnings.fetchedAt;
  const age = minutesSince(confirmedAt, now);
  return age === null || age > WARNING_TRUST_WINDOW_MINUTES ? "unavailable" : base;
}

/** CWA's own significance word decides the tone; this is not a site risk score. */
export function warningTone(warning: WeatherWarning): "alarm" | "advisory" {
  return warning.significance.includes("警報") ? "alarm" : "advisory";
}

export function countyMapStatus(county: CountyRisk, viewState: WarningViewState): MapCountyStatus {
  if (viewState === "unavailable") return "unknown";
  if (county.warnings.some((warning) => warningTone(warning) === "alarm")) return "alarm";
  if (county.warnings.length > 0) return "advisory";
  // An empty cache cannot show that a county has no warning.
  return viewState === "cached" ? "unknown" : "calm";
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
      detail: "來源無法取得或資料過舊。空資料不等於沒有警報，請到 CWA 官方頁確認。",
      tone: "alarm",
    };
  }

  if (viewState === "cached") {
    if (!county) {
      return {
        eyebrow: "時效內快取，不是即時確認",
        lead: "目前僅有快取，",
        focal: [],
        tail: "先選目的地查看",
        detail: "選擇縣市可查看最近快取；現況請以官方頁為準。",
        tone: "advisory",
      };
    }
    return county.warnings.length > 0
      ? {
          eyebrow: "時效內快取，不是即時確認",
          lead: county.countyName,
          focal: ["快取仍列", ` ${county.warnings.length} 項警特報`],
          detail: "最近快取仍列有效警示；現況請以官方頁為準。",
          tone: "advisory",
        }
      : {
          eyebrow: "時效內快取，不是即時確認",
          lead: county.countyName,
          focal: ["現況仍需確認"],
          detail: "快取沒有列出警報，不足以證明現在沒有警報。",
          tone: "advisory",
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
    detail: "截至本站取得時間，CWA 未列該縣市的有效警特報；這不代表所有災害都安全。",
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
