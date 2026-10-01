import { AlertTriangle, Database, Info, MapPin } from "lucide-react";
import type { RiskDashboardLoadResult, SourceStatus } from "../../lib/cwaClient";
import { COUNTIES, type CountyRisk, type WeatherWarning } from "../../lib/riskEngine";
import type { RegionFilter, WarningViewState } from "./types";

export const OFFICIAL_WARNING_URL = "https://www.cwa.gov.tw/V8/C/P/Warning/FIFOWS.html";
export const OFFICIAL_RAIN_WARNING_URL = "https://www.cwa.gov.tw/V8/C/P/Warning/W26.html";
export const OFFICIAL_WIND_WARNING_URL = "https://www.cwa.gov.tw/V8/C/P/Warning/W25.html";

export const REGION_LABELS: Record<RegionFilter, string> = {
  all: "全部",
  north: "北部",
  central: "中部",
  south: "南部",
  east: "東部",
  islands: "離島",
};

export const REGION_OPTIONS = Object.keys(REGION_LABELS) as RegionFilter[];

export function warningViewState(result: RiskDashboardLoadResult | null): WarningViewState {
  if (!result || result.warnings.currentness !== "current") return "unavailable";
  if (result.warnings.coverage === "current") return "current";
  if (result.warnings.coverage === "cached") return "cached";
  return "unavailable";
}

export function countyWarningPresentation(county: CountyRisk | null, viewState: WarningViewState) {
  if (viewState === "unavailable") {
    return {
      eyebrow: "警特報待確認",
      title: county ? `無法確認 ${county.countyName} 現況` : "目前無法確認官方警特報",
      detail: "警特報來源無法取得或資料時間偏舊。空資料不等於沒有警報，請直接到 CWA 官方頁確認。",
      icon: AlertTriangle,
      containerClass: "border-red-200 bg-red-50",
      eyebrowClass: "text-red-800",
      iconClass: "text-red-700",
    };
  }

  if (viewState === "cached") {
    return {
      eyebrow: "時效內快取 · 不是即時確認",
      title: !county
        ? "目前僅有快取，先選目的地查看"
        : county.warnings.length > 0
          ? `${county.countyName} 快取仍列 ${county.warnings.length} 項警特報`
          : `${county.countyName} 現況仍需確認`,
      detail: !county
        ? "選擇縣市後可查看最近快取；無論有無列出警報，現況仍請以官方頁為準。"
        : county.warnings.length > 0
          ? "最近快取仍保留有效警示；現況與後續更新請以官方頁為準。"
          : "快取沒有列出警報，不足以證明現在沒有警報。請先查看官方最新資訊。",
      icon: Database,
      containerClass: "border-amber-200 bg-amber-50",
      eyebrowClass: "text-amber-800",
      iconClass: "text-amber-700",
    };
  }

  if (!county) {
    return {
      eyebrow: "先選目的地",
      title: "選一個縣市查看",
      detail: "我們會把該縣市仍有效的官方警特報放在最前面，並清楚標示即時、快取或無法確認。",
      icon: MapPin,
      containerClass: "border-slate-200 bg-slate-50",
      eyebrowClass: "text-slate-600",
      iconClass: "text-slate-700",
    };
  }

  if (county.warnings.length > 0) {
    return {
      eyebrow: "CWA 有效警特報",
      title: `${county.countyName} 有 ${county.warnings.length} 項警特報`,
      detail: "下方列出仍有效的警特報與影響範圍；行動提醒是本站整理，完整內容請以官方公告為準。",
      icon: AlertTriangle,
      containerClass: "border-red-200 bg-red-50",
      eyebrowClass: "text-red-800",
      iconClass: "text-red-700",
    };
  }

  return {
    eyebrow: "CWA 警特報資料已取得",
    title: `${county.countyName} 未列有效縣市警特報`,
    detail: "依最近取得的 CWA 資料與目前時間，未列出仍有效的警示；仍須查看下方是否有尚未生效的警特報。這不是安全保證，也不取代行程與交通判斷。",
    icon: Info,
    containerClass: "border-teal-200 bg-teal-50",
    eyebrowClass: "text-teal-900",
    iconClass: "text-teal-800",
  };
}

export function countyCardStatus(warningState: WarningViewState, hasWarning: boolean, count: number) {
  if (warningState === "unavailable") {
    return {
      label: "待確認",
      detail: "警特報來源無法確認；請查看官方頁。",
      containerClass: "border-slate-300 bg-slate-100",
      badgeClass: "border-slate-300 bg-white text-slate-700",
    };
  }
  if (warningState === "cached") {
    return {
      label: hasWarning ? `快取 ${count} 項` : "快取未列",
      detail: "快取未列警特報，不能確認現在狀態。",
      containerClass: "border-amber-200 bg-amber-50",
      badgeClass: "border-amber-200 bg-white text-amber-900",
    };
  }
  if (hasWarning) {
    return {
      label: `${count} 項警特報`,
      detail: "",
      containerClass: "border-red-200 bg-red-50",
      badgeClass: "border-red-200 bg-white text-red-800",
    };
  }
  return {
    label: "目前未列",
    detail: "CWA 縣市警特報資料目前未列有效警示；觀測值另列參考。",
    containerClass: "border-slate-200 bg-slate-50",
    badgeClass: "border-slate-200 bg-white text-slate-700",
  };
}

export function sourceDisplay(source: SourceStatus) {
  if (source.provenance === "live" && source.status === "success" && !source.stale) {
    return { label: "直接取得", badgeClass: "bg-teal-100 text-teal-900" };
  }
  if (source.provenance === "cache") {
    return { label: source.stale ? "快取偏舊" : "快取替代", badgeClass: "bg-amber-100 text-amber-900" };
  }
  if (source.provenance === "live") {
    return { label: "來源偏舊", badgeClass: "bg-amber-100 text-amber-900" };
  }
  return { label: "無法取得", badgeClass: "bg-red-100 text-red-900" };
}

export function sourceSummary(result: RiskDashboardLoadResult | null, key: SourceStatus["key"]): string {
  const source = result?.sources.find((candidate) => candidate.key === key);
  if (!source) return "來源狀態待確認";
  const display = sourceDisplay(source);
  const confirmationTime =
    source.provenance === "live"
      ? source.fetchedAt
      : source.provenance === "cache"
        ? source.cacheGeneratedAt
        : source.fetchedAt;
  return `${display.label}${confirmationTime ? ` · ${formatDateTime(confirmationTime)}` : " · 時間未提供"}`;
}

export function actionForWarning(warning: WeatherWarning): string {
  if (warning.phenomena.includes("雨")) return "先確認目的地是否位於警示範圍；避免前往溪河、低窪與山區易崩塌路段，並查看官方雨勢更新。";
  if (warning.phenomena.includes("風")) return "避開沿海與空曠處，固定易掉落物；騎車、行車與搭船前先確認官方更新。";
  if (warning.phenomena.includes("高溫")) return "補充水分並減少正午戶外曝曬；長者、幼童與慢性病族群要特別留意。";
  if (warning.phenomena.includes("低溫")) return "加強保暖並留意長者與心血管疾病族群；山區行程先查路況。";
  if (warning.phenomena.includes("霧")) return "行車減速、開啟適當車燈並增加車距；能見度不佳時延後山區或沿海行程。";
  return "先查看官方警特報全文與地方政府資訊，再決定是否調整行程。";
}

export function officialWarningUrl(warning: WeatherWarning | undefined): string {
  if (warning?.phenomena.includes("雨")) return OFFICIAL_RAIN_WARNING_URL;
  if (warning?.phenomena.includes("風")) return OFFICIAL_WIND_WARNING_URL;
  return OFFICIAL_WARNING_URL;
}

export function countyFromUrl(): string {
  if (typeof window === "undefined") return "";
  const countyName = new window.URL(window.location.href).searchParams.get("county") ?? "";
  return COUNTIES.some((county) => county.countyName === countyName) ? countyName : "";
}

export function formatMetric(value: number | undefined, unit: string): string {
  return value === undefined ? "--" : `${formatNumber(value)} ${unit}`;
}

export function formatRank(item: { countyName: string; stationName: string; value: number } | undefined, unit: string): string {
  if (!item) return "無資料";
  return `${item.countyName} ${item.stationName} · ${formatNumber(item.value)} ${unit}`;
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
