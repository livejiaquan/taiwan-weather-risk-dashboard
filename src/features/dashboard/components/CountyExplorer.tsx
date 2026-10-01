import type { CountyRisk } from "../../../lib/riskEngine";
import type { RegionFilter, WarningViewState } from "../types";
import { REGION_LABELS, REGION_OPTIONS, countyCardStatus, formatMetric } from "../presentation";
import { MiniMetric } from "./Primitives";

export function CountySection({
  counties,
  region,
  setRegion,
  warningState,
  selectedCountyName,
  onSelectCounty,
}: {
  counties: CountyRisk[];
  region: RegionFilter;
  setRegion: (region: RegionFilter) => void;
  warningState: WarningViewState;
  selectedCountyName: string;
  onSelectCounty: (countyName: string) => void;
}) {
  const selectAndReveal = (countyName: string) => {
    onSelectCounty(countyName);
    const destination = document.getElementById("county-focus");
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    destination?.focus({ preventScroll: true });
    destination?.scrollIntoView?.({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  };

  return (
    <section id="county-explorer" aria-labelledby="county-explorer-heading" className="scroll-mt-4 rounded-2xl border border-line/80 bg-white/90 p-4 shadow-card sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 id="county-explorer-heading" className="text-xl font-black text-slate-950">各縣市警特報與觀測</h2>
          <p className="mt-1 text-base leading-7 text-slate-600">警特報與觀測分開標示；點縣市可帶回首屏查看行動提示。</p>
          <p className="mt-1 text-base leading-7 text-slate-600">觀測值保留上次取得的快照；開著頁面不會更新測站數值，請按「更新資料」重新取得。</p>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="依區域篩選縣市">
          {REGION_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={region === option}
              onClick={() => setRegion(option)}
              className={`min-h-11 rounded-xl border px-3 text-sm font-semibold transition ${
                region === option
                  ? "border-cobalt-700 bg-cobalt-700 text-white"
                  : "border-line bg-white text-slate-600 hover:border-cobalt-600"
              }`}
            >
              {REGION_LABELS[option]}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-4 text-sm font-semibold text-slate-600" role="status">{REGION_LABELS[region]} · {counties.length} 個縣市</p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {counties.map((county) => (
          <CountyCard
            key={county.countyName}
            county={county}
            warningState={warningState}
            selected={selectedCountyName === county.countyName}
            onSelect={() => selectAndReveal(county.countyName)}
          />
        ))}
      </div>
    </section>
  );
}

export function CountyCard({ county, warningState, selected, onSelect }: { county: CountyRisk; warningState: WarningViewState; selected: boolean; onSelect: () => void }) {
  const hasWarning = county.warnings.length > 0;
  const status = countyCardStatus(warningState, hasWarning, county.warnings.length);

  return (
    <article className={`rounded-2xl border p-4 shadow-card ${status.containerClass} ${selected ? "ring-2 ring-cobalt-600 ring-offset-2 ring-offset-paper" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-black text-slate-950">{county.countyName}</h3>
          <p className="mt-1 text-sm text-slate-600">{REGION_LABELS[county.region]}</p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-sm font-black ${status.badgeClass}`}>{status.label}</span>
      </div>

      {hasWarning && warningState !== "unavailable" ? (
        <div className="mt-4 space-y-2">
          {county.warnings.slice(0, 2).map((warning) => (
            <div key={`${warning.phenomena}-${warning.startTime}`} className="rounded-xl bg-white/80 px-3 py-2 text-base leading-7 text-slate-800">
              <span className="font-black">{warning.phenomena}{warning.significance}</span>
              {warning.affectedAreas.length > 0 ? ` · ${warning.affectedAreas.join("、")}` : ""}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-base leading-7 text-slate-600">{status.detail}</p>
      )}

      {warningState !== "unavailable" && county.upcomingWarnings.length > 0 ? (
        <p className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-semibold leading-6 text-sky-800">已發布、尚未生效 · {county.upcomingWarnings.length} 項</p>
      ) : null}
      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm" aria-label={`${county.countyName}觀測摘要`}>
        <MiniMetric label="1h 雨" value={formatMetric(county.metrics.maxPast1h, "mm")} />
        <MiniMetric label="陣風" value={formatMetric(county.metrics.maxGustSpeed, "m/s")} />
        <MiniMetric label="高溫" value={formatMetric(county.metrics.maxTemperature, "°C")} />
      </div>

      <button type="button" onClick={onSelect} aria-pressed={selected} className="mt-4 min-h-11 w-full rounded-xl border border-line bg-white px-3 text-sm font-bold text-slate-700 transition duration-200 hover:border-cobalt-600 hover:text-cobalt-800">
        {selected ? `已選擇 ${county.countyName}` : `查看 ${county.countyName} 警特報`}
      </button>
    </article>
  );
}
