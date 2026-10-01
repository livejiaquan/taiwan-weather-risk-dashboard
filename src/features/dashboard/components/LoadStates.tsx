import { AlertTriangle, Database, ExternalLink, Info, Clock3, Loader2, RefreshCw } from "lucide-react";
import type { RiskDashboardLoadResult, SourceStatus } from "../../../lib/cwaClient";
import { warningViewState, OFFICIAL_WARNING_URL } from "../presentation";
import { SourceList } from "./SourceDetails";

export function LoadingState() {
  return (
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-live="polite">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} aria-hidden="true" className="h-28 rounded-2xl border border-white/70 bg-white/70 shadow-card" />
      ))}
      <div className="col-span-full flex items-center justify-center gap-3 rounded-2xl border border-teal-100 bg-white/75 p-6 text-slate-600">
        <Loader2 className="h-5 w-5 animate-spin text-teal-700" aria-hidden="true" />
        正在整理 CWA 警特報與觀測資料
      </div>
    </section>
  );
}

export function FatalState({ error, sources, onRetry }: { error: string; sources: SourceStatus[]; onRetry: () => void }) {
  return (
    <section className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-950 shadow-card" aria-live="assertive">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-black">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            目前無法確認警特報
          </h2>
          <p className="mt-2 text-base leading-7">{error}</p>
          <a href={OFFICIAL_WARNING_URL} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 font-bold underline underline-offset-4">
            直接查看 CWA 官方警特報
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
        <button
          type="button"
          onClick={() => onRetry()}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          重新讀取
        </button>
      </div>
      {sources.length > 0 ? <SourceList sources={sources} /> : null}
    </section>
  );
}

export function EmptyState({ onRetry }: { onRetry: () => void }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-card">
      <h2 className="text-xl font-black text-slate-950">目前沒有可顯示的資料</h2>
      <p className="mt-2 text-slate-600">來源可能暫時沒有資料或網路連線中斷；這不代表目前沒有警特報。</p>
      <button type="button" onClick={() => onRetry()} className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white">
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        重新讀取
      </button>
    </section>
  );
}

export function StateBanner({ result, isRefreshing }: { result: RiskDashboardLoadResult | null; isRefreshing: boolean }) {
  if (!result) return null;

  const viewState = warningViewState(result);
  const failedSources = result.sources.filter((source) => source.status === "error").length;
  const staleSources = result.sources.filter((source) => source.stale).length;

  if (viewState === "unavailable") {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-950 shadow-card" role="status">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div>
            <span className="font-black">警特報狀態待確認。</span>
            來源無法取得、確認時間缺漏或資料已超過 90 分鐘，因此頁面不會顯示「安全」或「無警報」結論。請先查看 CWA 官方頁。
          </div>
        </div>
      </div>
    );
  }

  if (viewState === "cached") {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-card" role="status">
        <div className="flex items-start gap-2">
          <Database className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div>
            <span className="font-black">目前顯示時效內快取。</span>
            快取可保留最近警示，但「快取未列警報」不能證明現在沒有警報；請到官方頁確認。
          </div>
        </div>
      </div>
    );
  }

  if (result.degraded || isRefreshing) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-card" role="status">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div>
            <span className="font-black">警特報來源已直接取得；其他觀測資料可能不完整。</span>
            {isRefreshing ? " 正在背景更新。" : ` ${failedSources} 個來源失敗，${staleSources} 個來源時間偏舊。`}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-950 shadow-card" role="status">
      <div className="flex items-start gap-2">
        <Clock3 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div><span className="font-black">警特報來源已直接取得。</span> 取得時間與官方發布時間分開標示；各觀測來源的更新時間仍列在頁尾。</div>
      </div>
    </div>
  );
}
