import {
  Activity,
  AlertTriangle,
  Clock3,
  CloudRain,
  Database,
  ExternalLink,
  Globe2,
  Info,
  Loader2,
  MapPin,
  Navigation,
  RefreshCw,
  Thermometer,
  Waves,
  Wind,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  loadCachedRiskDashboardData,
  loadRiskDashboardData,
  type RiskDashboardLoadResult,
  type SourceStatus,
} from "./lib/cwaClient";
import { COUNTIES, type CountyRisk, type RiskSnapshot, type WeatherWarning } from "./lib/riskEngine";

type LoadState =
  | { status: "loading"; data: RiskDashboardLoadResult | null; error: null }
  | { status: "success"; data: RiskDashboardLoadResult; error: null }
  | { status: "error"; data: RiskDashboardLoadResult | null; error: string };

type RegionFilter = "all" | CountyRisk["region"];
type WarningViewState = "current" | "cached" | "unavailable";

const OFFICIAL_WARNING_URL = "https://www.cwa.gov.tw/V8/C/P/Warning/FIFOWS.html";
const OFFICIAL_RAIN_WARNING_URL = "https://www.cwa.gov.tw/V8/C/P/Warning/W26.html";
const OFFICIAL_WIND_WARNING_URL = "https://www.cwa.gov.tw/V8/C/P/Warning/W25.html";

const REGION_LABELS: Record<RegionFilter, string> = {
  all: "全部",
  north: "北部",
  central: "中部",
  south: "南部",
  east: "東部",
  islands: "離島",
};

const REGION_OPTIONS = Object.keys(REGION_LABELS) as RegionFilter[];

export function App() {
  const [state, setState] = useState<LoadState>({ status: "loading", data: null, error: null });
  const [region, setRegion] = useState<RegionFilter>("all");
  const [selectedCountyName, setSelectedCountyName] = useState(() => countyFromUrl());
  const loadGeneration = useRef(0);

  const load = async (preferCache = false) => {
    const generation = ++loadGeneration.current;
    const isCurrentLoad = () => loadGeneration.current === generation;
    setState((current) => ({ status: "loading", data: current.data, error: null }));

    // Start direct official retrieval immediately. Cache is a short-lived
    // interim fallback only; it must never delay or supersede the live result.
    const liveRequest = loadRiskDashboardData();
    let liveSettled = false;
    // Register this before the cache continuation. If both promises have
    // already resolved, the live microtask marks itself terminal first.
    const liveResult = liveRequest.then(
      (data) => {
        liveSettled = true;
        return data;
      },
      (error: unknown) => {
        liveSettled = true;
        throw error;
      },
    );

    if (preferCache) {
      void loadCachedRiskDashboardData()
        .then((cached) => {
          if (!isCurrentLoad() || liveSettled || !cached?.snapshot) return;
          setState({ status: "success", data: cached, error: null });
        })
        .catch(() => {
          // The direct request remains authoritative; an unavailable cache is
          // not a user-visible error by itself.
        });
    }

    try {
      const data = await liveResult;
      if (!isCurrentLoad()) return;
      if (data.fatal) {
        setState({ status: "error", data, error: "無法取得 CWA 即時資料，也沒有在時效內的可用快取。" });
      } else {
        setState({ status: "success", data, error: null });
      }
    } catch (error) {
      if (!isCurrentLoad()) return;
      setState({
        status: "error",
        data: null,
        error: error instanceof Error ? error.message : "無法載入資料。",
      });
    }
  };

  useEffect(() => {
    void load(true);
    return () => {
      // Invalidate pending cache/live promises after unmount so they cannot
      // update this App instance.
      loadGeneration.current += 1;
    };
  }, []);

  useEffect(() => {
    const syncCountyFromUrl = () => setSelectedCountyName(countyFromUrl());
    window.addEventListener("popstate", syncCountyFromUrl);
    return () => window.removeEventListener("popstate", syncCountyFromUrl);
  }, []);

  const snapshot = state.data?.snapshot ?? null;
  const selectedCounty = snapshot?.counties.find((county) => county.countyName === selectedCountyName) ?? null;
  const filteredCounties = useMemo(() => {
    if (!snapshot) return [];
    const candidates = region === "all" ? snapshot.counties : snapshot.counties.filter((county) => county.region === region);
    return [...candidates].sort(
      (a, b) =>
        b.warnings.length - a.warnings.length ||
        COUNTIES.findIndex((county) => county.countyName === a.countyName) -
          COUNTIES.findIndex((county) => county.countyName === b.countyName),
    );
  }, [region, snapshot]);

  const selectCounty = (countyName: string) => {
    setSelectedCountyName(countyName);
    const url = new window.URL(window.location.href);
    if (countyName) {
      url.searchParams.set("county", countyName);
    } else {
      url.searchParams.delete("county");
    }
    window.history.pushState(null, "", `${url.pathname}${url.search}${url.hash}`);
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(20,184,166,0.18),_transparent_32rem),linear-gradient(135deg,_#f8fafc_0%,_#eef2f7_52%,_#fff7ed_100%)] text-slate-900">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8">
        <Hero
          state={state}
          result={state.data}
          selectedCounty={selectedCounty}
          selectedCountyName={selectedCountyName}
          onSelectCounty={selectCounty}
          onRefresh={load}
        />

        {state.status === "loading" && !snapshot ? (
          <LoadingState />
        ) : state.status === "error" && !snapshot ? (
          <FatalState error={state.error} sources={state.data?.sources ?? []} onRetry={load} />
        ) : snapshot ? (
          <>
            <StateBanner result={state.data} isRefreshing={state.status === "loading"} />
            <OverviewStats snapshot={snapshot} result={state.data} />
            <InterpretationGuide />
            <CountySection
              counties={filteredCounties}
              region={region}
              setRegion={setRegion}
              warningState={warningViewState(state.data)}
              selectedCountyName={selectedCountyName}
              onSelectCounty={selectCounty}
            />
            <WarningSection
              warnings={snapshot.counties.flatMap((county) => county.warnings)}
              warningState={warningViewState(state.data)}
              warningStatus={state.data?.warnings}
            />
            <SignalSections snapshot={snapshot} />
            <SourceFooter sources={state.data?.sources ?? []} />
          </>
        ) : (
          <EmptyState onRetry={load} />
        )}
      </div>
    </main>
  );
}

function Hero({
  state,
  result,
  selectedCounty,
  selectedCountyName,
  onSelectCounty,
  onRefresh,
}: {
  state: LoadState;
  result: RiskDashboardLoadResult | null;
  selectedCounty: CountyRisk | null;
  selectedCountyName: string;
  onSelectCounty: (countyName: string) => void;
  onRefresh: () => void;
}) {
  const viewState = warningViewState(result);
  const presentation =
    state.status === "loading" && !result
      ? {
          eyebrow: "正在連線 CWA",
          title: "正在確認官方警特報",
          detail: "資料確認完成前，本站不會顯示沒有警報或其他結論。",
          icon: Clock3,
          containerClass: "border-sky-200 bg-sky-50",
          eyebrowClass: "text-sky-800",
          iconClass: "text-sky-700",
        }
      : countyWarningPresentation(selectedCounty, viewState);
  const primaryWarning = selectedCounty?.warnings[0];

  return (
    <section id="county-focus" className="overflow-hidden rounded-[1.5rem] border border-white/70 bg-white/90 shadow-soft backdrop-blur">
      <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1.05fr_0.95fr] lg:p-8">
        <div className="flex flex-col justify-between gap-7">
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-sm font-semibold text-teal-900">
                <Navigation className="h-4 w-4" aria-hidden="true" />
                出門前
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-medium text-slate-600">
                <Globe2 className="h-4 w-4" aria-hidden="true" />
                民間整理 · CWA 公開資料
              </span>
            </div>

            <div className="max-w-3xl">
              <p className="mb-2 hidden text-sm font-semibold uppercase tracking-[0.16em] text-slate-500 sm:block">Taiwan county warning check</p>
              <h1 className="text-3xl font-black leading-tight text-slate-950 sm:text-5xl">
                先看目的地，現在有沒有有效警特報
              </h1>
              <p className={`mt-4 max-w-2xl text-base leading-7 text-slate-700 sm:text-lg sm:leading-8 ${selectedCounty ? "hidden sm:block" : ""}`}>
                選一個縣市，先確認中央氣象署目前列出的警特報、影響範圍與時間；雨量、風速和溫度只作為出門前的觀測脈絡。
              </p>
            </div>

            <div className="max-w-xl">
              <label htmlFor="county-select" className="mb-2 block text-sm font-black text-slate-900">
                今天要去哪裡？
              </label>
              <div className="relative">
                <MapPin className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-teal-700" aria-hidden="true" />
                <select
                  id="county-select"
                  value={selectedCountyName}
                  onChange={(event) => onSelectCounty(event.target.value)}
                  className="min-h-14 w-full appearance-none rounded-2xl border border-slate-300 bg-white py-3 pl-12 pr-10 text-base font-bold text-slate-950 shadow-card outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
                >
                  <option value="">選擇縣市</option>
                  {COUNTIES.map((county) => (
                    <option key={county.geocode} value={county.countyName}>
                      {county.countyName}
                    </option>
                  ))}
                </select>
              </div>
              <p className={`mt-2 text-xs leading-5 text-slate-500 ${selectedCounty ? "hidden sm:block" : ""}`}>選擇結果會保留在網址中，方便直接分享同一個目的地。</p>
            </div>
          </div>

          <div className={`flex flex-col gap-3 sm:flex-row sm:items-center ${selectedCounty ? "hidden sm:flex" : ""}`}>
            <button
              type="button"
              onClick={() => onRefresh()}
              disabled={state.status === "loading"}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-card transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${state.status === "loading" ? "animate-spin" : ""}`} aria-hidden="true" />
              {state.status === "loading" ? "更新中" : "更新資料"}
            </button>
            <div className="text-xs leading-5 text-slate-500">
              {result?.warnings.sourceUpdatedAt
                ? `官方發布：${formatDateTime(result.warnings.sourceUpdatedAt)}`
                : state.status === "loading"
                  ? "正在讀取來源時間"
                  : "官方發布時間未提供"}
              {result?.warnings.coverage === "current" && result.warnings.fetchedAt ? (
                <><br />本站直接取得：{formatDateTime(result.warnings.fetchedAt)}</>
              ) : result?.warnings.coverage === "cached" && result.warnings.cacheGeneratedAt ? (
                <><br />快取建立：{formatDateTime(result.warnings.cacheGeneratedAt)}</>
              ) : result?.warnings.fetchedAt ? (
                <><br />最近嘗試：{formatDateTime(result.warnings.fetchedAt)}</>
              ) : null}
            </div>
          </div>
        </div>

        <div className={`rounded-3xl border p-5 sm:p-6 ${presentation.containerClass}`} aria-live="polite">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className={`text-sm font-black ${presentation.eyebrowClass}`}>{presentation.eyebrow}</p>
              <h2 className="mt-2 text-2xl font-black leading-tight text-slate-950 sm:text-3xl">{presentation.title}</h2>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {selectedCounty ? (
                <button
                  type="button"
                  onClick={() => onRefresh()}
                  disabled={state.status === "loading"}
                  aria-label={state.status === "loading" ? "正在更新資料" : "更新資料"}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/80 bg-white/80 text-slate-700 shadow-card sm:hidden"
                >
                  <RefreshCw className={`h-5 w-5 ${state.status === "loading" ? "animate-spin" : ""}`} aria-hidden="true" />
                </button>
              ) : null}
              <div className={`rounded-2xl bg-white/80 p-3 ${presentation.iconClass}`}>
                <presentation.icon className="h-6 w-6" aria-hidden="true" />
              </div>
            </div>
          </div>

          <p className={`mt-4 text-sm leading-6 text-slate-700 ${viewState === "current" && primaryWarning ? "hidden sm:block" : ""}`}>{presentation.detail}</p>

          {selectedCounty && result ? (
            <p className="mt-3 text-xs leading-5 text-slate-500 sm:hidden">
              {result.warnings.sourceUpdatedAt ? `官方發布：${formatDateTime(result.warnings.sourceUpdatedAt)}` : "官方發布時間未提供"}
              {result.warnings.coverage === "current" && result.warnings.fetchedAt ? (
                <><br />本站直接取得：{formatDateTime(result.warnings.fetchedAt)}</>
              ) : result.warnings.coverage === "cached" && result.warnings.cacheGeneratedAt ? (
                <><br />快取建立：{formatDateTime(result.warnings.cacheGeneratedAt)}</>
              ) : result.warnings.fetchedAt ? (
                <><br />最近嘗試：{formatDateTime(result.warnings.fetchedAt)}</>
              ) : null}
            </p>
          ) : null}

          {selectedCounty && primaryWarning ? (
            <div className="mt-5 rounded-2xl border border-white/80 bg-white/85 p-4">
              <div className="font-black text-slate-950">
                {primaryWarning.phenomena}{primaryWarning.significance}
              </div>
              <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">
                有效時間：{primaryWarning.startTime ? formatDateTime(primaryWarning.startTime) : "未提供"}
                {primaryWarning.endTime ? ` – ${formatDateTime(primaryWarning.endTime)}` : " – 以官方公告為準"}
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                {primaryWarning.affectedAreas.length > 0
                  ? `影響範圍：${primaryWarning.affectedAreas.join("、")}`
                  : `影響縣市：${primaryWarning.countyName}；細部範圍以官方公告為準`}
              </p>
              <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-700">
                <span className="font-black">本站整理的下一步：</span>
                {actionForWarning(primaryWarning)}
              </div>
              {selectedCounty.warnings.length > 1 ? (
                <p className="mt-2 text-xs font-semibold text-slate-500">另有 {selectedCounty.warnings.length - 1} 項警特報，請往下查看完整清單。</p>
              ) : null}
            </div>
          ) : null}

          <a
            href={officialWarningUrl(primaryWarning)}
            target="_blank"
            rel="noreferrer"
            className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            到 CWA 官方頁確認
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            本站不是政府官方服務；緊急狀況請依中央與地方政府發布資訊行動。
          </p>
        </div>
      </div>
    </section>
  );
}

function LoadingState() {
  return (
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-live="polite">
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="h-36 animate-pulse rounded-2xl border border-white/70 bg-white/70 shadow-card" />
      ))}
      <div className="col-span-full flex items-center justify-center gap-3 rounded-2xl border border-teal-100 bg-white/75 p-6 text-slate-600">
        <Loader2 className="h-5 w-5 animate-spin text-teal-700" aria-hidden="true" />
        正在整理 CWA 警特報與觀測資料
      </div>
    </section>
  );
}

function FatalState({ error, sources, onRetry }: { error: string; sources: SourceStatus[]; onRetry: () => void }) {
  return (
    <section className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-950 shadow-card" aria-live="assertive">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-black">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            目前無法確認警特報
          </h2>
          <p className="mt-2 text-sm leading-6">{error}</p>
          <a href={OFFICIAL_WARNING_URL} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 font-bold underline underline-offset-4">
            直接查看 CWA 官方警特報
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
        <button
          type="button"
          onClick={() => onRetry()}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          重新讀取
        </button>
      </div>
      {sources.length > 0 ? <SourceList sources={sources} /> : null}
    </section>
  );
}

function EmptyState({ onRetry }: { onRetry: () => void }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-card">
      <h2 className="text-xl font-black text-slate-950">目前沒有可顯示的資料</h2>
      <p className="mt-2 text-slate-600">來源可能暫時沒有資料或網路連線中斷；這不代表目前沒有警特報。</p>
      <button type="button" onClick={() => onRetry()} className="mt-5 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white">
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        重新讀取
      </button>
    </section>
  );
}

function StateBanner({ result, isRefreshing }: { result: RiskDashboardLoadResult | null; isRefreshing: boolean }) {
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
            來源無法取得或資料時間偏舊，因此頁面不會顯示「安全」或「無警報」結論。請先查看 CWA 官方頁。
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

function OverviewStats({ snapshot, result }: { snapshot: RiskSnapshot; result: RiskDashboardLoadResult | null }) {
  const warningState = warningViewState(result);
  const stats = [
    {
      label: "有效警特報縣市",
      value:
        warningState === "unavailable"
          ? "待確認"
          : `${warningState === "cached" ? "快取 " : ""}${snapshot.national.activeWarningCountyCount} / ${COUNTIES.length}`,
      detail:
        warningState === "current"
          ? "CWA 縣市警特報資料"
          : warningState === "cached"
            ? "不是目前無警報的證明"
            : "請直接查 CWA 官方頁",
      source: sourceSummary(result, "warnings"),
      icon: AlertTriangle,
      accent: "from-rose-600 to-orange-500",
    },
    {
      label: "24 小時最大雨量",
      value: snapshot.sections.rainfall.maxPast24h ? `${formatNumber(snapshot.sections.rainfall.maxPast24h.value)} mm` : "無資料",
      detail: snapshot.sections.rainfall.maxPast24h
        ? `${snapshot.sections.rainfall.maxPast24h.countyName} ${snapshot.sections.rainfall.maxPast24h.stationName}`
        : "雨量站未回傳",
      source: sourceSummary(result, "rainfall"),
      icon: CloudRain,
      accent: "from-sky-600 to-teal-500",
    },
    {
      label: "最大陣風觀測",
      value: snapshot.sections.wind.maxGust ? `${formatNumber(snapshot.sections.wind.maxGust.value)} m/s` : "無資料",
      detail: snapshot.sections.wind.maxGust
        ? `${snapshot.sections.wind.maxGust.countyName} ${snapshot.sections.wind.maxGust.stationName}`
        : "氣象站未回傳",
      source: sourceSummary(result, "weather"),
      icon: Wind,
      accent: "from-indigo-600 to-cyan-500",
    },
    {
      label: "最高溫觀測",
      value: snapshot.sections.temperature.hottest ? `${formatNumber(snapshot.sections.temperature.hottest.value)} °C` : "無資料",
      detail: snapshot.sections.temperature.hottest
        ? `${snapshot.sections.temperature.hottest.countyName} ${snapshot.sections.temperature.hottest.stationName}`
        : "氣象站未回傳",
      source: sourceSummary(result, "weather"),
      icon: Thermometer,
      accent: "from-amber-500 to-red-500",
    },
  ];

  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="警特報與觀測摘要">
      {stats.map((stat) => (
        <div key={stat.label} className="overflow-hidden rounded-2xl border border-white/70 bg-white p-5 shadow-card">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-500">{stat.label}</p>
              <p className="mt-2 text-2xl font-black text-slate-950">{stat.value}</p>
            </div>
            <div className={`rounded-2xl bg-gradient-to-br ${stat.accent} p-3 text-white shadow-card`}>
              <stat.icon className="h-5 w-5" aria-hidden="true" />
            </div>
          </div>
          <p className="mt-4 text-sm text-slate-600">{stat.detail}</p>
          <p className="mt-2 text-xs font-semibold text-slate-400">{stat.source}</p>
        </div>
      ))}
    </section>
  );
}

function InterpretationGuide() {
  const items = [
    {
      title: "官方警特報",
      detail: "判斷目的地是否有警示的主要依據；保留官方有效時間與細部影響範圍。",
      icon: AlertTriangle,
    },
    {
      title: "觀測資料",
      detail: "雨量、風速與溫度只提供脈絡，不等於官方安全判定，也不合成跨災種分數。",
      icon: Activity,
    },
    {
      title: "近期紀錄",
      detail: "地震報告與區域熱帶氣旋另列參考，不代表現在仍有地震或臺灣颱風警報。",
      icon: Database,
    },
  ];

  return (
    <section className="rounded-2xl border border-white/70 bg-white p-5 shadow-card">
      <div className="mb-4">
        <h2 className="text-xl font-black text-slate-950">這頁怎麼判讀</h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">官方發布、本站整理與背景紀錄分開呈現，避免把不同語義合成看似精準的「安全分數」。</p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {items.map((item) => (
          <div key={item.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <item.icon className="h-5 w-5 text-teal-700" aria-hidden="true" />
            <h3 className="mt-3 font-black text-slate-950">{item.title}</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">{item.detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function CountySection({
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
    document.getElementById("county-focus")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  };

  return (
    <section className="rounded-2xl border border-white/70 bg-white p-4 shadow-card sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-950">各縣市警特報與觀測</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">警特報與觀測分開標示；點縣市可帶回首屏查看行動提示。</p>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="依區域篩選縣市">
          {REGION_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={region === option}
              onClick={() => setRegion(option)}
              className={`min-h-10 rounded-xl border px-3 text-sm font-semibold transition ${
                region === option
                  ? "border-slate-950 bg-slate-950 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-400"
              }`}
            >
              {REGION_LABELS[option]}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
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

function CountyCard({ county, warningState, selected, onSelect }: { county: CountyRisk; warningState: WarningViewState; selected: boolean; onSelect: () => void }) {
  const hasWarning = county.warnings.length > 0;
  const status = countyCardStatus(warningState, hasWarning, county.warnings.length);

  return (
    <article className={`rounded-2xl border p-4 shadow-card ${status.containerClass} ${selected ? "ring-2 ring-teal-600 ring-offset-2" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-black text-slate-950">{county.countyName}</h3>
          <p className="mt-1 text-sm text-slate-600">{REGION_LABELS[county.region]}</p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-xs font-black ${status.badgeClass}`}>{status.label}</span>
      </div>

      {hasWarning && warningState !== "unavailable" ? (
        <div className="mt-4 space-y-2">
          {county.warnings.slice(0, 2).map((warning) => (
            <div key={`${warning.phenomena}-${warning.startTime}`} className="rounded-xl bg-white/80 px-3 py-2 text-sm leading-6 text-slate-800">
              <span className="font-black">{warning.phenomena}{warning.significance}</span>
              {warning.affectedAreas.length > 0 ? ` · ${warning.affectedAreas.join("、")}` : ""}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm leading-6 text-slate-600">{status.detail}</p>
      )}

      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs" aria-label={`${county.countyName}觀測摘要`}>
        <MiniMetric label="1h 雨" value={formatMetric(county.metrics.maxPast1h, "mm")} />
        <MiniMetric label="陣風" value={formatMetric(county.metrics.maxGustSpeed, "m/s")} />
        <MiniMetric label="高溫" value={formatMetric(county.metrics.maxTemperature, "°C")} />
      </div>

      <button type="button" onClick={onSelect} className="mt-4 min-h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700 hover:border-slate-500">
        查看這個縣市
      </button>
    </article>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/75 px-2 py-2">
      <div className="font-semibold text-slate-500">{label}</div>
      <div className="mt-1 font-black text-slate-900">{value}</div>
    </div>
  );
}

function WarningSection({
  warnings,
  warningState,
  warningStatus,
}: {
  warnings: WeatherWarning[];
  warningState: WarningViewState;
  warningStatus?: RiskDashboardLoadResult["warnings"];
}) {
  const uniqueWarnings = warnings.filter(
    (warning, index, list) =>
      list.findIndex(
        (item) => item.countyName === warning.countyName && item.phenomena === warning.phenomena && item.startTime === warning.startTime,
      ) === index,
  );

  return (
    <Card title={warningState === "cached" ? "快取中的有效警特報" : "官方有效警特報"} icon={AlertTriangle}>
      <p className="mb-4 text-xs font-semibold text-slate-500">
        {warningStatus?.sourceUpdatedAt ? `CWA 官方發布：${formatDateTime(warningStatus.sourceUpdatedAt)}` : "CWA 官方發布時間未提供"}
        {warningStatus?.coverage === "current" && warningStatus.fetchedAt ? (
          <><br />本站直接取得：{formatDateTime(warningStatus.fetchedAt)}</>
        ) : warningStatus?.coverage === "cached" && warningStatus.cacheGeneratedAt ? (
          <><br />快取建立：{formatDateTime(warningStatus.cacheGeneratedAt)}</>
        ) : null}
      </p>
      {warningState === "unavailable" ? (
        <WarningNotice tone="red">目前無法確認官方警特報資料；頁面不會把空資料解讀成沒有警報。</WarningNotice>
      ) : uniqueWarnings.length === 0 ? (
        warningState === "cached" ? (
          <WarningNotice tone="amber">時效內快取沒有列出有效警特報，但快取空白不能證明目前沒有警報，請到 CWA 官方頁確認。</WarningNotice>
        ) : (
          <WarningNotice tone="teal">截至上方標示的本站直接取得時間，這份 CWA 縣市警特報資料未列出仍有效的警示。這不是對其他災害或行程安全的保證。</WarningNotice>
        )
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {uniqueWarnings.map((warning) => (
            <article key={`${warning.countyName}-${warning.phenomena}-${warning.startTime}`} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="font-black text-slate-950">{warning.countyName}</div>
                <div className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-slate-700">
                  {warning.phenomena}{warning.significance}
                </div>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {warning.affectedAreas.length > 0 ? `影響範圍：${warning.affectedAreas.join("、")}` : "細部影響範圍以 CWA 公告為準"}
              </p>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                {warning.startTime ? `開始 ${formatDateTime(warning.startTime)}` : "開始時間未提供"}
                {warning.endTime ? ` · 結束 ${formatDateTime(warning.endTime)}` : ""}
              </p>
              <p className="mt-3 border-t border-slate-200 pt-3 text-sm leading-6 text-slate-700">
                <span className="font-black">本站整理：</span>{actionForWarning(warning)}
              </p>
              <a href={officialWarningUrl(warning)} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-teal-800 underline underline-offset-4">
                官方詳情 <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </article>
          ))}
        </div>
      )}
    </Card>
  );
}

function WarningNotice({ tone, children }: { tone: "red" | "amber" | "teal"; children: ReactNode }) {
  const toneClass = {
    red: "border-red-200 bg-red-50 text-red-950",
    amber: "border-amber-200 bg-amber-50 text-amber-950",
    teal: "border-teal-200 bg-teal-50 text-teal-950",
  }[tone];
  return <div className={`rounded-xl border px-4 py-3 text-sm leading-6 ${toneClass}`}>{children}</div>;
}

function SignalSections({ snapshot }: { snapshot: RiskSnapshot }) {
  const earthquake = snapshot.sections.earthquake.signal;
  const typhoon = snapshot.sections.typhoon.signal;

  return (
    <section className="grid gap-4 lg:grid-cols-3">
      <Card title="雨量觀測脈絡" icon={CloudRain}>
        <SignalLine label="1 小時最大" value={formatRank(snapshot.sections.rainfall.maxPast1h, "mm")} />
        <SignalLine label="3 小時最大" value={formatRank(snapshot.sections.rainfall.maxPast3h, "mm")} />
        <SignalLine label="24 小時最大" value={formatRank(snapshot.sections.rainfall.maxPast24h, "mm")} />
      </Card>

      <Card title="風與溫度觀測" icon={Wind}>
        <SignalLine label="最大陣風" value={formatRank(snapshot.sections.wind.maxGust, "m/s")} />
        <SignalLine label="平均風最大" value={formatRank(snapshot.sections.wind.maxAverage, "m/s")} />
        <SignalLine label="最高溫" value={formatRank(snapshot.sections.temperature.hottest, "°C")} />
      </Card>

      <Card title="近期紀錄（不納入判斷）" icon={Waves}>
        <SignalLine
          label="區域熱帶氣旋"
          value={
            typhoon
              ? `${typhoon.localName ?? typhoon.name ?? "未命名"} · 這不是臺灣颱風警報`
              : "資料未列活動中熱帶氣旋"
          }
        />
        <SignalLine
          label="最近地震報告"
          value={
            earthquake?.occurredAt
              ? `${formatDateTime(earthquake.occurredAt)}${earthquake.magnitude ? ` · 規模 ${formatNumber(earthquake.magnitude)}` : ""}`
              : "無資料"
          }
        />
        <p className="pt-3 text-xs leading-5 text-slate-500">地震報告記錄已發生事件；熱帶氣旋資料涵蓋西北太平洋與南海，兩者都不等於目前對臺警報。</p>
      </Card>
    </section>
  );
}

function SignalLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 py-3 last:border-0">
      <span className="text-sm font-semibold text-slate-500">{label}</span>
      <span className="max-w-[65%] text-right text-sm font-bold text-slate-900">{value}</span>
    </div>
  );
}

function SourceFooter({ sources }: { sources: SourceStatus[] }) {
  return (
    <footer className="rounded-2xl border border-white/70 bg-white/90 p-5 text-sm text-slate-600 shadow-card">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <h2 className="text-base font-black text-slate-950">資料來源、更新時間與限制</h2>
          <p className="mt-2 leading-6">
            本頁是民間整理工具，不是政府官方服務，也不代表中央氣象署背書。官方警特報保留其有效時間與影響範圍；本站提供的行動文字與觀測整理不是官方安全判定。
          </p>
        </div>
        <a href="https://opendata.cwa.gov.tw/" target="_blank" rel="noreferrer" className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 font-semibold text-slate-700 hover:border-slate-400">
          CWA 開放資料
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
        </a>
      </div>
      <SourceList sources={sources} />
    </footer>
  );
}

function SourceList({ sources }: { sources: SourceStatus[] }) {
  return (
    <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
      {sources.map((source) => {
        const status = sourceDisplay(source);
        return (
          <div key={source.key} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-bold text-slate-800">{source.label}</p>
                <p className="mt-0.5 text-xs text-slate-400">{source.id}</p>
              </div>
              <span className={`rounded-full px-2 py-1 text-[0.68rem] font-black ${status.badgeClass}`}>{status.label}</span>
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-500">
              來源時間：{source.updatedAt ? formatDateTime(source.updatedAt) : "未提供"}
              <br />
              {source.provenance === "cache"
                ? `快取建立：${source.cacheGeneratedAt ? formatDateTime(source.cacheGeneratedAt) : "未提供"}`
                : `本站取得：${source.fetchedAt ? formatDateTime(source.fetchedAt) : "未提供"}`}
            </p>
            {source.error ? <p className="mt-2 break-words text-xs leading-5 text-red-700">即時來源：{source.error}</p> : null}
            <a href={source.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-teal-800 underline underline-offset-2">
              查看資料集 <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          </div>
        );
      })}
    </div>
  );
}

function Card({ title, icon: Icon, children }: { title: string; icon: typeof Activity; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/70 bg-white p-5 shadow-card">
      <div className="mb-4 flex items-center gap-2">
        <div className="rounded-xl bg-slate-950 p-2 text-white">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </div>
        <h2 className="text-lg font-black text-slate-950">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function warningViewState(result: RiskDashboardLoadResult | null): WarningViewState {
  if (!result || result.warnings.currentness !== "current") return "unavailable";
  if (result.warnings.coverage === "current") return "current";
  if (result.warnings.coverage === "cached") return "cached";
  return "unavailable";
}

function countyWarningPresentation(county: CountyRisk | null, viewState: WarningViewState) {
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
      detail: "下方先列出第一項警特報、細部影響範圍與本站整理的下一步；完整內容請以官方公告為準。",
      icon: AlertTriangle,
      containerClass: "border-red-200 bg-red-50",
      eyebrowClass: "text-red-800",
      iconClass: "text-red-700",
    };
  }

  return {
    eyebrow: "CWA 警特報資料已取得",
    title: `${county.countyName} 未列有效縣市警特報`,
    detail: "這只代表截至本站上方直接取得時間，這份縣市警特報資料未列警示；不代表所有災害都安全，也不取代行程與交通判斷。",
    icon: Info,
    containerClass: "border-teal-200 bg-teal-50",
    eyebrowClass: "text-teal-900",
    iconClass: "text-teal-800",
  };
}

function countyCardStatus(warningState: WarningViewState, hasWarning: boolean, count: number) {
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

function sourceDisplay(source: SourceStatus) {
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

function sourceSummary(result: RiskDashboardLoadResult | null, key: SourceStatus["key"]): string {
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

function actionForWarning(warning: WeatherWarning): string {
  if (warning.phenomena.includes("雨")) return "先確認目的地是否位於警示範圍；避免前往溪河、低窪與山區易崩塌路段，並查看官方雨勢更新。";
  if (warning.phenomena.includes("風")) return "避開沿海與空曠處，固定易掉落物；騎車、行車與搭船前先確認官方更新。";
  if (warning.phenomena.includes("高溫")) return "補充水分並減少正午戶外曝曬；長者、幼童與慢性病族群要特別留意。";
  if (warning.phenomena.includes("低溫")) return "加強保暖並留意長者與心血管疾病族群；山區行程先查路況。";
  if (warning.phenomena.includes("霧")) return "行車減速、開啟適當車燈並增加車距；能見度不佳時延後山區或沿海行程。";
  return "先查看官方警特報全文與地方政府資訊，再決定是否調整行程。";
}

function officialWarningUrl(warning: WeatherWarning | undefined): string {
  if (warning?.phenomena.includes("雨")) return OFFICIAL_RAIN_WARNING_URL;
  if (warning?.phenomena.includes("風")) return OFFICIAL_WIND_WARNING_URL;
  return OFFICIAL_WARNING_URL;
}

function countyFromUrl(): string {
  if (typeof window === "undefined") return "";
  const countyName = new window.URL(window.location.href).searchParams.get("county") ?? "";
  return COUNTIES.some((county) => county.countyName === countyName) ? countyName : "";
}

function formatMetric(value: number | undefined, unit: string): string {
  return value === undefined ? "--" : `${formatNumber(value)} ${unit}`;
}

function formatRank(item: { countyName: string; stationName: string; value: number } | undefined, unit: string): string {
  if (!item) return "無資料";
  return `${item.countyName} ${item.stationName} · ${formatNumber(item.value)} ${unit}`;
}

function formatNumber(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "--";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatDateTime(value: string): string {
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
