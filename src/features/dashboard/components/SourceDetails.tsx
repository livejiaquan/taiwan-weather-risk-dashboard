import { ExternalLink } from "lucide-react";
import type { RiskDashboardLoadResult, SourceStatus } from "../../../lib/cwaClient";
import { WARNING_MAX_AGE_MS, warningTimeMs } from "../../../lib/warningTime";
import { sourceDisplay, formatDateTime } from "../presentation";

export function SourceFooter({ sources }: { sources: SourceStatus[] }) {
  return (
    <footer id="data-sources" className="rounded-2xl border border-line/80 bg-white/90 p-5 text-sm text-slate-600 shadow-card">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <h2 className="text-xl font-black text-slate-950">資料來源、更新時間與限制</h2>
          <p className="mt-2 leading-6">
            本頁是民間整理工具，不是政府官方服務，也不代表中央氣象署背書。官方警特報保留其有效時間與影響範圍；本站提供的行動文字與觀測整理不是官方安全判定。
          </p>
        </div>
        <a href="https://opendata.cwa.gov.tw/" target="_blank" rel="noreferrer" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-line bg-white px-4 font-semibold text-slate-700 transition duration-200 hover:border-cobalt-600">
          CWA 開放資料
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
        </a>
      </div>
      <SourceList sources={sources} />
    </footer>
  );
}

export function SourceList({ sources }: { sources: SourceStatus[] }) {
  return (
    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {sources.map((source) => {
        const status = sourceDisplay(source);
        return (
          <div key={source.key} className="rounded-xl border border-line/70 bg-[#F6F7F2] px-3 py-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-bold text-slate-800">{source.label}</p>
                <p className="mt-0.5 text-sm text-slate-600">{source.id}</p>
              </div>
              <span className={`rounded-full px-2 py-1 text-sm font-black ${status.badgeClass}`}>{status.label}</span>
            </div>
            <p className="mt-3 text-sm leading-5 text-slate-600">
              來源時間：{source.updatedAt ? formatDateTime(source.updatedAt) : "未提供"}
              <br />
              {source.provenance === "cache"
                ? `快取建立：${source.cacheGeneratedAt ? formatDateTime(source.cacheGeneratedAt) : "未提供"}`
                : `本站取得：${source.fetchedAt ? formatDateTime(source.fetchedAt) : "未提供"}`}
            </p>
            {source.error ? <p className="mt-2 break-words text-sm leading-5 text-red-700">即時來源：{source.error}</p> : null}
            <a href={source.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-11 items-center gap-1 text-sm font-bold text-teal-800 underline underline-offset-2">
              查看資料集 <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          </div>
        );
      })}
    </div>
  );
}

/** Retrieval expiry is a trust boundary, never the warning's own validity end. */
export function WarningSourceTimes({ status }: { status?: RiskDashboardLoadResult["warnings"] }) {
  const confirmed = status?.coverage === "cached" ? status.cacheGeneratedAt : status?.coverage === "current" ? status.fetchedAt : undefined;
  const confirmedAt = warningTimeMs(confirmed);
  return (
    <div className="source-times mt-4 space-y-1 border-t border-current/10 pt-3 text-sm leading-6 text-slate-700">
      <p>{status?.sourceUpdatedAt ? `CWA 官方發布：${formatDateTime(status.sourceUpdatedAt)}` : "CWA 官方發布時間未提供"}</p>
      {status?.coverage === "current" && status.fetchedAt
        ? <p>本站直接取得：{formatDateTime(status.fetchedAt)}</p>
        : status?.coverage === "cached" && status.cacheGeneratedAt
          ? <p>快取建立：{formatDateTime(status.cacheGeneratedAt)}</p>
          : status?.fetchedAt ? <p>最近嘗試：{formatDateTime(status.fetchedAt)}</p> : null}
      {Number.isFinite(confirmedAt) ? <p>資料確認期限：{formatDateTime(new Date(confirmedAt + WARNING_MAX_AGE_MS).toISOString())}</p> : null}
      <p className="text-slate-600">以上時間皆為臺灣 UTC+8；警特報生效與結束時間另列於各項目。</p>
    </div>
  );
}
