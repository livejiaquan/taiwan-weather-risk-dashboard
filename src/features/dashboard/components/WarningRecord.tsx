import { ExternalLink } from "lucide-react";
import type { WeatherWarning } from "../../../lib/riskEngine";
import { actionForWarning, officialWarningUrl } from "../presentation";
import { TimeStamp } from "./Primitives";

/** Official facts and this site's interpretation deliberately have separate labels. */
export function WarningRecord({ warning, upcoming = false, showCounty = false }: {
  warning: WeatherWarning;
  upcoming?: boolean;
  showCounty?: boolean;
}) {
  return (
    <article className="warning-record rounded-2xl border border-line/80 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-lg font-black leading-7 text-slate-950">
          {showCounty ? <span className="mr-2">{warning.countyName}</span> : null}
          {warning.phenomena}{warning.significance}
        </h3>
        <span className={`state-label ${upcoming ? "border-sky-200 bg-sky-50 text-sky-800" : "border-red-200 bg-red-50 text-red-800"}`}>
          {upcoming ? "尚未生效" : "有效時間內"}
        </span>
      </div>
      <p className="warning-window mt-3 border-l-2 border-slate-300 pl-3 text-sm leading-6 text-slate-700">
        開始 <TimeStamp value={warning.startTime} /><br />
        結束 <TimeStamp value={warning.endTime} />（臺灣 UTC+8）
      </p>
      <p className="mt-3 text-base leading-7 text-slate-800">
        {warning.affectedAreas.length > 0
          ? `影響範圍：${warning.affectedAreas.join("、")}`
          : `影響縣市：${warning.countyName}；細部範圍以官方公告為準`}
      </p>
      {!upcoming ? (
        <p className="mt-3 rounded-xl bg-paper px-3 py-3 text-base leading-7 text-slate-700">
          <span className="font-bold">本站整理：</span>{actionForWarning(warning)}
        </p>
      ) : null}
      <a href={officialWarningUrl(warning)} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-teal-800 underline underline-offset-4">
        查看這項警特報官方詳情 <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />
      </a>
    </article>
  );
}
