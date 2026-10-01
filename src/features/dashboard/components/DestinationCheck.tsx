import { ChevronDown, Clock3, ExternalLink, MapPin, Navigation, RefreshCw } from "lucide-react";
import type { RiskDashboardLoadResult } from "../../../lib/cwaClient";
import { COUNTIES, type CountyRisk } from "../../../lib/riskEngine";
import type { LoadState } from "../types";
import { warningViewState, countyWarningPresentation, officialWarningUrl } from "../presentation";
import { TimeStamp } from "./Primitives";
import { WarningSourceTimes } from "./SourceDetails";
import { WarningRecord } from "./WarningRecord";

export function DestinationCheck({ state, result, selectedCounty, selectedCountyName, evaluatedAt, onSelectCounty, onRefresh }: {
  state: LoadState;
  result: RiskDashboardLoadResult | null;
  selectedCounty: CountyRisk | null;
  selectedCountyName: string;
  evaluatedAt: string;
  onSelectCounty: (countyName: string) => void;
  onRefresh: () => void;
}) {
  const viewState = warningViewState(result);
  const presentation = state.status === "loading" && !result
    ? { eyebrow: "正在連線 CWA", title: "正在確認官方警特報", detail: "資料確認完成前，本站不會顯示沒有警報或其他結論。", icon: Clock3, containerClass: "border-sky-200 bg-sky-50", eyebrowClass: "text-sky-800", iconClass: "text-sky-700" }
    : countyWarningPresentation(selectedCounty, viewState);
  const warnings = viewState === "unavailable" ? [] : selectedCounty?.warnings ?? [];
  const upcomingWarnings = viewState === "unavailable" ? [] : selectedCounty?.upcomingWarnings ?? [];

  return (
    <section id="county-focus" tabIndex={-1} aria-label="目的地警特報查詢" className="destination-panel scroll-mt-4 rounded-[24px] border border-line/80 bg-white shadow-soft">
      <div className="grid items-start gap-5 p-4 sm:gap-7 sm:p-7 lg:grid-cols-[0.85fr_1.15fr] lg:p-8">
        <div className="min-w-0 lg:py-2">
          <p className="flex items-center gap-2 text-sm font-bold tracking-wide text-teal-800">
            <Navigation className="h-4 w-4" aria-hidden="true" />出門前 · CWA 公開資料
          </p>
          <h1 className="mt-3 text-[1.875rem] font-black leading-[1.3] tracking-tight text-ink sm:text-[2.75rem] lg:text-5xl">
            先看目的地，<br className="hidden lg:block" />現在有沒有有效警特報
          </h1>
          <p className={`mt-4 max-w-xl text-base leading-7 text-slate-700 ${selectedCountyName ? "hidden sm:block" : ""}`}>
            先確認官方警示、影響範圍與時間，再把雨量、風速和溫度作為觀測脈絡。
          </p>
          <div className="mt-5 sm:mt-7">
            <label htmlFor="county-select" className="mb-2 block text-base font-bold text-slate-950">今天要去哪裡？</label>
            <div className="relative">
              <MapPin className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-teal-700" aria-hidden="true" />
              <select id="county-select" value={selectedCountyName} onChange={(event) => onSelectCounty(event.target.value)} className="min-h-14 w-full appearance-none rounded-2xl border border-slate-500 bg-paper py-3 pl-12 pr-12 text-base font-bold text-ink transition-colors focus:border-cobalt-600">
                <option value="">選擇縣市</option>
                {COUNTIES.map((county) => <option key={county.geocode} value={county.countyName}>{county.countyName}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-600" aria-hidden="true" />
            </div>
            <p id="county-url-hint" className="mt-2 hidden text-sm leading-6 text-slate-600 sm:block">選擇會保留在網址，方便分享同一個目的地。</p>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 sm:mt-5">
            <button type="button" onClick={() => onRefresh()} disabled={state.status === "loading"} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line bg-white px-4 py-2 text-sm font-bold text-slate-800 transition-colors hover:border-cobalt-600 hover:text-cobalt-800 disabled:cursor-wait disabled:opacity-60">
              <RefreshCw className={`h-4 w-4 ${state.status === "loading" ? "animate-spin" : ""}`} aria-hidden="true" />
              {state.status === "loading" ? "更新中" : "更新資料"}
            </button>
            {result?.snapshot ? <a href="#county-explorer" className="inline-flex min-h-11 items-center text-sm font-bold text-teal-800 underline underline-offset-4">瀏覽各縣市</a> : null}
          </div>
          <p className="mt-5 hidden border-t border-line/70 pt-4 text-sm leading-6 text-slate-600 lg:block">民間整理介面，不是政府官方服務。本站不提供安全保證，緊急狀況請依中央與地方政府發布資訊行動。</p>
        </div>

        <div className={`min-w-0 rounded-[20px] border p-4 sm:p-6 ${presentation.containerClass}`}>
          <div className="flex items-start gap-3">
            <presentation.icon className={`mt-1 h-6 w-6 shrink-0 ${presentation.iconClass}`} aria-hidden="true" />
            <div className="min-w-0">
              <p className={`text-sm font-bold ${presentation.eyebrowClass}`}>{presentation.eyebrow}</p>
              <h2 id="destination-result" aria-live="polite" aria-atomic="true" className="mt-2 text-2xl font-black leading-[1.35] text-slate-950 sm:text-3xl">{presentation.title}</h2>
            </div>
          </div>
          <p className="mt-3 text-base leading-7 text-slate-700">{presentation.detail}</p>
          {result ? <WarningSourceTimes status={result.warnings} /> : null}
          {warnings.length > 0 ? (
            <section aria-label={`${selectedCountyName} 目前有效的警特報`} className="mt-4 space-y-3">
              {warnings.map((warning, index) => <WarningRecord key={`${warning.phenomena}-${warning.startTime}-${index}`} warning={warning} />)}
            </section>
          ) : null}
          {upcomingWarnings.length > 0 ? (
            <section aria-label={`${selectedCountyName} 已發布、尚未生效的警特報`} className="mt-5 border-t border-sky-200 pt-4">
              <h3 className="text-lg font-black text-slate-950">已發布、尚未生效 · {upcomingWarnings.length} 項</h3>
              <p className="mt-2 text-base leading-7 text-slate-700">
                {viewState === "cached" ? "以下來自時效內快取，請先到官方確認。" : "目前尚未生效，不列入上方有效警特報數。"}出發前請確認行程是否落在下列時間與範圍。
              </p>
              <div className="mt-3 space-y-3">{upcomingWarnings.map((warning, index) => <WarningRecord key={`${warning.phenomena}-${warning.startTime}-${index}`} warning={warning} upcoming />)}</div>
            </section>
          ) : null}
          <a href={officialWarningUrl(warnings[0])} target="_blank" rel="noreferrer" className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-cobalt-700 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-cobalt-800">
            到 CWA 官方頁確認 <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />
          </a>
          {result ? <p className="mt-3 text-sm leading-6 text-slate-700">判讀時間（臺灣 UTC+8）：<TimeStamp value={evaluatedAt} /><br />資料取得超過 90 分鐘會改為待確認，請再更新資料。</p> : null}
          <p className="mt-3 text-sm leading-6 text-slate-600 lg:hidden">本站不是政府官方服務；緊急狀況請依中央與地方政府發布資訊行動。</p>
        </div>
      </div>
    </section>
  );
}
