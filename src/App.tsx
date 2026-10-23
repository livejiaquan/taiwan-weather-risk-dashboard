import {
  AlertTriangle,
  ChevronDown,
  Clock3,
  ExternalLink,
  Info,
  Loader2,
  Moon,
  RefreshCw,
  Sun,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { TaiwanMap } from "./components/TaiwanMap";
import {
  loadCachedRiskDashboardData,
  loadRiskDashboardData,
  type RiskDashboardLoadResult,
  type SourceStatus,
} from "./lib/cwaClient";
import {
  OFFICIAL_WARNING_URL,
  actionForWarning,
  answerTitle,
  countyMapStatus,
  countyWarningPresentation,
  dataAgeTier,
  dataTimeLabel,
  formatAge,
  formatClock,
  formatDateTime,
  formatMetric,
  formatNumber,
  formatValidity,
  minutesSince,
  officialWarningUrl,
  sourceDisplay,
  snapshotEffectiveAt,
  sourceSummary,
  warningTone,
  warningViewStateAt,
  warningDataTime,
  type AnswerPresentation,
  type MapCountyStatus,
  type Tone,
  type WarningViewState,
} from "./lib/presentation";
import { COUNTIES, type CountyRisk, type RiskSnapshot, type WeatherWarning } from "./lib/riskEngine";

type LoadState =
  | { status: "loading"; data: RiskDashboardLoadResult | null; error: null }
  | { status: "success"; data: RiskDashboardLoadResult; error: null }
  | { status: "error"; data: RiskDashboardLoadResult | null; error: string };

const REGION_LABELS: Record<CountyRisk["region"], string> = {
  north: "北部",
  central: "中部",
  south: "南部",
  east: "東部",
  islands: "離島",
};

const REGIONS = Object.keys(REGION_LABELS) as CountyRisk["region"][];

const TONE_TEXT: Record<Tone, string> = {
  alarm: "text-alarm-ink",
  advisory: "text-advisory-ink",
  calm: "text-calm-ink",
  unknown: "text-unknown-ink",
  accent: "text-accent",
};

const TONE_BAR: Record<Tone, string> = {
  alarm: "bg-alarm",
  advisory: "bg-advisory",
  calm: "bg-calm",
  unknown: "bg-unknown",
  accent: "bg-accent",
};

// Solid status colours for the focal answer (large text, >= 3:1 in both themes).
const TONE_FOCAL: Record<Tone, string> = {
  alarm: "text-alarm",
  advisory: "text-advisory",
  calm: "text-calm-ink",
  unknown: "text-unknown-ink",
  accent: "text-accent",
};

/** Left-aligned page with JMA-like gutters (20px phone, 40px desktop). */
const PAGE = "w-full px-5 pb-16 pt-3 lg:px-10";

const TONE_CHIP: Record<Tone, string> = {
  alarm: "bg-alarm-soft text-alarm-ink",
  advisory: "bg-advisory-soft text-advisory-ink",
  calm: "bg-raised text-calm-ink",
  unknown: "bg-raised text-unknown-ink",
  accent: "bg-accent-soft text-accent",
};

// Mirrors the map's hatch so "待確認" is distinguishable without relying on colour.
const HATCH_STYLE = {
  backgroundImage: "repeating-linear-gradient(45deg, rgb(var(--surface) / 0.75) 0 1.5px, transparent 1.5px 4px)",
};

const MAP_LEGEND: Array<{ status: MapCountyStatus; label: string; hint: string }> = [
  { status: "alarm", label: "警報", hint: "例如颱風警報" },
  { status: "advisory", label: "特報", hint: "例如大雨、強風特報" },
  { status: "calm", label: "未列有效警特報", hint: "不等於安全" },
  { status: "unknown", label: "待確認", hint: "來源未確認或僅有快取" },
];

export function App() {
  const [state, setState] = useState<LoadState>({ status: "loading", data: null, error: null });
  const [selectedCountyName, setSelectedCountyName] = useState(() => countyFromUrl());
  const loadGeneration = useRef(0);
  const now = useNow();
  const [theme, toggleTheme] = useTheme();

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

  const viewState = warningViewStateAt(state.data, now);
  // Warnings whose own CWA validity ended since the snapshot was taken drop out here.
  const effective = useMemo(
    () => (state.data?.snapshot ? snapshotEffectiveAt(state.data.snapshot, now) : null),
    [state.data, now],
  );
  const snapshot = effective?.snapshot ?? null;
  const selectedCounty = snapshot?.counties.find((county) => county.countyName === selectedCountyName) ?? null;
  const isLoading = state.status === "loading";

  const mapStatuses = useMemo(() => {
    const statuses: Record<string, MapCountyStatus> = {};
    for (const county of snapshot?.counties ?? []) statuses[county.countyName] = countyMapStatus(county, viewState);
    return statuses;
  }, [snapshot, viewState]);

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
    <div className="min-h-screen bg-bg text-ink">
      <a
        href="#county-focus"
        className="fixed left-4 top-4 z-50 -translate-y-24 rounded-control bg-accent px-4 py-3 font-bold text-accent-ink transition-transform focus:translate-y-0"
      >
        跳到主要內容
      </a>

      <SiteHeader
        result={state.data}
        viewState={viewState}
        isLoading={isLoading}
        now={now}
        onRefresh={() => void load()}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      {/* JMA rhythm: left-aligned page, a wide list column and a narrow map column (docs/references/tokens.md). */}
      <main className={PAGE}>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1043px)_320px] lg:items-start">
          <section id="county-focus" tabIndex={-1} aria-label="目的地警特報" className="min-w-0 focus:outline-none">
            <Breadcrumb selectedCountyName={selectedCountyName} onSelectCounty={selectCounty} />
            <AnswerTable
              state={state}
              viewState={viewState}
              result={state.data}
              snapshot={snapshot}
              endedCount={effective?.endedCount ?? 0}
              now={now}
              selectedCounty={selectedCounty}
              selectedCountyName={selectedCountyName}
            />
          </section>

          <aside className={`${isLoading && !snapshot ? "hidden lg:block" : ""} min-w-0 lg:sticky lg:top-16 lg:row-span-2`}>
            <MapPanel
              snapshot={snapshot}
              viewState={viewState}
              result={state.data}
              now={now}
              statuses={mapStatuses}
              selectedCountyName={selectedCountyName}
              onSelectCounty={selectCounty}
            />
          </aside>

          <div className="flex min-w-0 flex-col gap-6">
            {isLoading && !snapshot ? null : state.status === "error" && !snapshot ? (
              <FatalState error={state.error} sources={state.data?.sources ?? []} onRetry={() => void load()} />
            ) : snapshot ? (
              <>
                <StateBanner result={state.data} viewState={viewState} isRefreshing={isLoading} />
                <NationalTable
                  counties={snapshot.counties}
                  viewState={viewState}
                  selectedCountyName={selectedCountyName}
                  onSelectCounty={selectCounty}
                />
                <WarningSection
                  warnings={snapshot.counties.flatMap((county) => county.warnings)}
                  warningState={viewState}
                  warningStatus={state.data?.warnings}
                  selectedCountyName={selectedCountyName}
                />
                <ObservationSection snapshot={snapshot} result={state.data} />
                <SourceFooter sources={state.data?.sources ?? []} />
              </>
            ) : (
              <EmptyState onRetry={() => void load()} />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function SiteHeader({
  result,
  viewState,
  isLoading,
  now,
  onRefresh,
  theme,
  onToggleTheme,
}: {
  result: RiskDashboardLoadResult | null;
  viewState: WarningViewState;
  isLoading: boolean;
  now: number;
  onRefresh: () => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
}) {
  return (
    // A solid brand bar with divided items, after the JMA navigation bar.
    <header className="sticky top-0 z-40 bg-brand text-white shadow-[0_1px_3px_rgb(211_214_221)] dark:shadow-none">
      <div className="flex h-12 items-stretch lg:h-[52px]">
        <a href="./" className="flex min-w-0 items-center gap-2 px-3 lg:px-4" aria-label="出門前：台灣縣市警特報整理">
          <BrandMark />
          <span className="min-w-0">
            <h1 className="text-lg font-bold leading-tight">出門前</h1>
            <span className="hidden text-xs leading-tight text-white/90 sm:block">台灣縣市警特報整理</span>
          </span>
        </a>
        <a
          href="#county-focus"
          className="hidden items-center border-l border-white/30 px-8 text-base font-bold md:flex"
        >
          縣市警特報
        </a>
        <a href="#national-title" className="hidden items-center border-l border-white/30 px-8 text-base font-bold md:flex">
          全台一覽
        </a>
        <div className="ml-auto flex items-center gap-2 border-l border-white/30 px-2 lg:px-3">
          <FreshnessPill result={result} viewState={viewState} isLoading={isLoading} now={now} />
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            aria-label={isLoading ? "正在更新資料" : "更新資料"}
            className="grid h-11 w-11 place-items-center rounded-control bg-white/15 text-white transition hover:bg-white/25 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-5 w-5 ${isLoading ? "animate-spin" : ""}`} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={theme === "dark" ? "切換為淺色模式" : "切換為深色模式"}
            className="grid h-11 w-11 place-items-center rounded-control bg-white/15 text-white transition hover:bg-white/25"
          >
            {theme === "dark" ? <Sun className="h-5 w-5" aria-hidden="true" /> : <Moon className="h-5 w-5" aria-hidden="true" />}
          </button>
        </div>
      </div>
    </header>
  );
}

function BrandMark() {
  return (
    <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-hidden="true">
      <rect width="32" height="32" rx="6" fill="#fff" />
      <path d="M19.5 5.5c2.6 1.4 3.4 4.6 2.7 8.3-.7 3.8-2.6 8.7-5.6 12.2-.6.7-1.7.5-1.9-.4-.8-3-2.6-5.5-4-8-1.5-2.8-.9-6.5 1.5-9.3 2-2.3 5-3.8 7.3-2.8Z" className="fill-advisory" />
      <path d="M17.8 9.5c1.2.8 1.4 2.6.9 4.5-.5 2-1.6 4.3-2.8 5.7-1-1.8-2.2-3.4-2.6-5.1-.5-2.4 2.3-6.3 4.5-5.1Z" className="fill-alarm" />
    </svg>
  );
}

function FreshnessPill({
  result,
  viewState,
  isLoading,
  now,
}: {
  result: RiskDashboardLoadResult | null;
  viewState: WarningViewState;
  isLoading: boolean;
  now: number;
}) {
  const dataTime = !result || viewState === "unavailable" ? undefined : warningDataTime(result);
  const age = minutesSince(dataTime, now);
  const tier = age === null ? null : dataAgeTier(age);
  const label = isLoading ? "更新中" : !result ? "連線 CWA" : tier === null ? "無法取得資料" : tier === "fresh" ? "即時" : formatAge(age ?? 0);
  // On the brand bar: a white chip for fresh data, amber once past 90 minutes, red when nothing loads.
  const chip =
    isLoading || !result
      ? "bg-white/15 text-white"
      : tier === null
        ? "bg-alarm text-on-alarm"
        : tier === "fresh"
          ? "bg-white text-brand"
          : "bg-advisory-soft text-advisory-ink";
  const title = dataTime ? `資料時間：${formatDateTime(dataTime)}` : "目前取不到 CWA 警特報資料";

  return (
    <span
      className={`inline-flex h-11 items-center gap-2 rounded-control px-3 text-sm font-bold ${chip}`}
      title={title}
      aria-label={`資料狀態：${label}${tier === "fresh" && age !== null ? `，${formatAge(age)}` : ""}`}
    >
      {isLoading || !result ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
      <span className={isLoading || !result ? "hidden sm:inline" : ""}>{label}</span>
      {tier === "fresh" && age !== null && !isLoading ? <span className="tabular hidden font-medium sm:inline">{formatAge(age)}</span> : null}
    </span>
  );
}

/** JMA-style tab breadcrumb; the second tab is the destination picker. */
function Breadcrumb({ selectedCountyName, onSelectCounty }: { selectedCountyName: string; onSelectCounty: (countyName: string) => void }) {
  return (
    <div className="mb-3 flex items-stretch">
      <button
        type="button"
        onClick={() => onSelectCounty("")}
        className="relative z-10 flex min-h-touch items-center gap-2 rounded-l-control bg-brand pl-3 pr-4 text-base font-bold text-white"
      >
        <span className="h-5 w-1 bg-white" aria-hidden="true" />
        全台
      </button>
      <span className="-ml-px w-4 bg-brand [clip-path:polygon(0_0,100%_50%,0_100%)]" aria-hidden="true" />
      <div className="relative -ml-2 flex min-w-0 items-center rounded-r-control bg-band pl-5 pr-2">
        <label htmlFor="county-select" className="sr-only">
          今天要去哪裡？
        </label>
        <select
          id="county-select"
          value={selectedCountyName}
          onChange={(event) => onSelectCounty(event.target.value)}
          className="min-h-touch w-full min-w-[9rem] appearance-none border-0 bg-transparent py-2 pr-8 text-base font-bold text-ink outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <option value="">選擇縣市</option>
          {REGIONS.map((region) => (
            <optgroup key={region} label={REGION_LABELS[region]}>
              {COUNTIES.filter((county) => county.region === region).map((county) => (
                <option key={county.geocode} value={county.countyName}>
                  {county.countyName}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 h-5 w-5 text-ink" aria-hidden="true" />
      </div>
      <p className="ml-4 hidden items-center text-sm text-muted sm:flex" aria-hidden="true">
        今天要去哪裡？
      </p>
    </div>
  );
}

/** A JMA table title bar: brand colour, white text, 10px inset. */
function TitleBar({ id, children, action }: { id?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-3 bg-brand px-3 py-1 text-white">
      <h2 id={id} className="text-base font-bold">
        {children}
      </h2>
      {action}
    </div>
  );
}

/** The light-blue second row that carries the update time. */
function Band({ children }: { children: ReactNode }) {
  return <div className="tabular border-t border-rule bg-band px-3 py-1 text-center text-sm">{children}</div>;
}

const LEVEL_CELL: Record<"alarm" | "advisory", string> = {
  alarm: "bg-alarm text-on-alarm",
  advisory: "bg-advisory text-on-advisory",
};

function AnswerTable({
  state,
  viewState,
  result,
  snapshot,
  endedCount,
  now,
  selectedCounty,
  selectedCountyName,
}: {
  state: LoadState;
  viewState: WarningViewState;
  result: RiskDashboardLoadResult | null;
  snapshot: RiskSnapshot | null;
  endedCount: number;
  now: number;
  selectedCounty: CountyRisk | null;
  selectedCountyName: string;
}) {
  const answer: AnswerPresentation =
    state.status === "loading" && !result
      ? {
          eyebrow: "正在連線 CWA",
          focal: ["正在確認", "官方警特報"],
          detail: "資料確認完成前，本站不會顯示沒有警報或其他結論。",
          tone: "unknown",
        }
      : countyWarningPresentation(selectedCounty, viewState, selectedCounty?.countyName ?? (selectedCountyName || undefined));
  const showWarnings = selectedCounty && viewState !== "unavailable" ? selectedCounty.warnings : [];
  const headingParts = [answer.lead, answer.focal.length > 0 ? "focal" : undefined, answer.tail].filter(Boolean);
  const dataTime = viewState === "unavailable" ? undefined : warningDataTime(result);

  return (
    <article className="border border-rule bg-surface" aria-live="polite">
      <div className="flex min-h-9 items-center bg-brand px-3 py-1 text-base font-bold text-white">
        {selectedCountyName || "全台"}的警特報（發布狀況）
      </div>
      <Band>{dataTime ? `${formatDateTime(dataTime)} 資料` : state.status === "loading" ? "正在讀取資料時間" : "資料時間未提供"}</Band>

      <div className="border-t border-rule px-4 py-4 lg:px-6">
        <p className={`flex items-center gap-2 text-base font-bold ${TONE_TEXT[answer.tone]}`}>
          <span className={`h-3 w-3 ${TONE_BAR[answer.tone]}`} aria-hidden="true" />
          {answer.eyebrow}
        </p>
        {/* The visual heading splits into sizes and phrases; the label keeps one clean sentence for assistive tech. */}
        <h2 className="mt-2" aria-label={answerTitle(answer)}>
          {headingParts.map((part, index) => (
            <Fragment key={part}>
              {index > 0 ? " " : null}
              {part === "focal" ? (
                <span className={`block text-4xl font-black leading-tight tracking-tight lg:text-5xl ${TONE_FOCAL[answer.tone]}`}>
                  {/* Each segment is an unbreakable phrase; lines may only break between them. */}
                  {answer.focal.map((segment) => (
                    <span key={segment} className="inline-block">
                      {segment}
                    </span>
                  ))}
                </span>
              ) : (
                <span className="block text-xl font-bold">{part}</span>
              )}
            </Fragment>
          ))}
        </h2>
        {!selectedCountyName ? <NationalFigure result={result} snapshot={snapshot} viewState={viewState} /> : null}
        <DataAgeNote
          result={result}
          viewState={viewState}
          now={now}
          showsWarnings={selectedCountyName ? showWarnings.length > 0 : (snapshot?.national.activeWarningCountyCount ?? 0) > 0}
          endedCount={endedCount}
        />
        <p className="mt-2 max-w-2xl text-base text-muted">{answer.detail}</p>
        {!result && state.status === "loading" ? <LoadingState withCounty={Boolean(selectedCountyName)} /> : null}
      </div>

      {/* Level column + content, as in the JMA per-area table. */}
      {showWarnings.map((warning) => (
        <div key={`${warning.phenomena}-${warning.startTime}`} className="grid grid-cols-[5.5rem_minmax(0,1fr)] border-t border-rule sm:grid-cols-[8rem_minmax(0,1fr)]">
          <div className={`flex items-center justify-center px-2 text-base font-bold ${LEVEL_CELL[warningTone(warning)]}`}>
            {warning.significance}
          </div>
          <div className="px-4 py-2">
            <p className="flex flex-wrap items-baseline gap-x-3">
              <span className="text-lg font-bold">
                {warning.phenomena}
                {warning.significance}
              </span>
              <span className="tabular text-sm text-muted">
                {warning.startTime ? formatDateTime(warning.startTime) : "開始未提供"}
                {warning.endTime ? ` 至 ${formatDateTime(warning.endTime)}` : " 起，結束以官方公告為準"}
              </span>
            </p>
            <p className="text-base">
              {warning.affectedAreas.length > 0
                ? `影響範圍：${warning.affectedAreas.join("、")}`
                : `影響縣市：${warning.countyName}；細部範圍以官方公告為準`}
            </p>
          </div>
        </div>
      ))}
      {showWarnings.length > 0 ? (
        <p className="border-t border-rule bg-band/40 px-4 py-3 text-base">
          <span className="font-bold">本站整理的下一步：</span>
          {actionForWarning(showWarnings[0])}
        </p>
      ) : null}

      {selectedCounty && viewState !== "unavailable" ? <CountyObservations county={selectedCounty} /> : null}

      <div className="flex flex-col gap-3 border-t border-rule px-4 py-4 sm:flex-row sm:items-center lg:px-6">
        <a
          href={officialWarningUrl(showWarnings[0])}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-touch items-center justify-center gap-2 rounded-control bg-brand px-5 text-base font-bold text-white transition hover:opacity-90"
        >
          到 CWA 官方頁確認
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
        </a>
        <WarningTimes result={result} isLoading={state.status === "loading"} />
      </div>
    </article>
  );
}

/** With no destination chosen, the nationwide count is the answer. */
function NationalFigure({
  result,
  snapshot,
  viewState,
}: {
  result: RiskDashboardLoadResult | null;
  snapshot: RiskSnapshot | null;
  viewState: WarningViewState;
}) {
  if (!snapshot || viewState === "unavailable") {
    // Rendered with interim text so the block keeps its height while loading.
    return (
      <p className="mt-4 text-xl font-bold text-muted">
        {!result ? "正在讀取全台警特報" : "全台狀態待確認，請以 CWA 官方頁為準"}
      </p>
    );
  }
  const statuses = snapshot.counties.map((county) => countyMapStatus(county, viewState));
  const tone: Tone = statuses.includes("alarm") ? "alarm" : statuses.includes("advisory") ? "advisory" : "calm";
  return (
    <p className="tabular mt-4">
      <span className={`text-4xl font-black lg:text-5xl ${TONE_FOCAL[tone]}`}>{snapshot.national.activeWarningCountyCount}</span>
      <span className="ml-2 text-xl font-bold">/ {COUNTIES.length} 縣市列有警特報</span>
    </p>
  );
}

/**
 * The data-time label beside the answer. Age only changes this label (amber past
 * 90 minutes); the answer itself stays visible until the data is 24 hours old.
 */
function DataAgeNote({
  result,
  viewState,
  now,
  showsWarnings,
  endedCount,
}: {
  result: RiskDashboardLoadResult | null;
  viewState: WarningViewState;
  now: number;
  showsWarnings: boolean;
  endedCount: number;
}) {
  const dataTime = viewState === "unavailable" ? undefined : warningDataTime(result);
  const age = minutesSince(dataTime, now);
  if (!dataTime || age === null) return null;
  const tier = dataAgeTier(age);

  return (
    <div className="mt-3 text-base">
      <p className={`tabular font-semibold ${tier === "fresh" ? "text-muted" : "text-advisory-ink"}`}>{dataTimeLabel(dataTime, now)}</p>
      {tier !== "fresh" && tier !== "expired" && showsWarnings ? (
        <p className="text-muted">這些警特報仍在 CWA 標示的有效期間內。</p>
      ) : null}
      {endedCount > 0 ? <p className="text-muted">另有 {endedCount} 項已在資料時間之後到期，未列入。</p> : null}
      {tier === "old" || tier === "expired" ? (
        <p className="text-muted">
          本站每 3–4 小時更新一次，最新數據請見{" "}
          <a href={OFFICIAL_WARNING_URL} target="_blank" rel="noreferrer" className="font-semibold text-accent underline underline-offset-4">
            CWA 官方警特報
          </a>
          。
        </p>
      ) : null}
    </div>
  );
}

function WarningTimes({ result, isLoading }: { result: RiskDashboardLoadResult | null; isLoading: boolean }) {
  return (
    <p className="tabular text-sm text-muted">
      {result?.warnings.sourceUpdatedAt
        ? `官方發布：${formatDateTime(result.warnings.sourceUpdatedAt)}`
        : isLoading
          ? "正在讀取來源時間"
          : "官方發布時間未提供"}
      {result?.warnings.coverage === "current" && result.warnings.fetchedAt ? (
        <><br />本站直接取得：{formatDateTime(result.warnings.fetchedAt)}</>
      ) : result?.warnings.coverage === "cached" && result.warnings.cacheGeneratedAt ? (
        <><br />快取建立：{formatDateTime(result.warnings.cacheGeneratedAt)}</>
      ) : result?.warnings.fetchedAt ? (
        <><br />最近嘗試：{formatDateTime(result.warnings.fetchedAt)}</>
      ) : null}
    </p>
  );
}

function CountyObservations({ county }: { county: CountyRisk }) {
  const items = [
    { label: "1 小時雨量", value: formatMetric(county.metrics.maxPast1h, "mm") },
    { label: "24 小時雨量", value: formatMetric(county.metrics.maxPast24h, "mm") },
    { label: "最大陣風", value: formatMetric(county.metrics.maxGustSpeed, "m/s") },
    { label: "最高溫", value: formatMetric(county.metrics.maxTemperature, "°C") },
  ];
  return (
    <div className="border-t border-rule">
      <p className="bg-band px-3 py-1 text-center text-sm">{county.countyName}測站最大值（觀測脈絡，不是官方判定）</p>
      <dl className="grid grid-cols-2 border-t border-rule sm:grid-cols-4">
        {items.map((item, index) => (
          <div key={item.label} className={`px-4 py-3 text-center ${index > 0 ? "border-l border-rule" : ""} ${index >= 2 ? "border-t border-rule sm:border-t-0" : ""} ${index === 2 ? "border-l-0 sm:border-l" : ""}`}>
            <dt className="text-sm text-muted">{item.label}</dt>
            <dd className="tabular text-xl font-bold">{item.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

const HAZARD_COLUMNS = [
  { key: "typhoon", label: "颱風", test: (phenomena: string) => phenomena.includes("颱風") },
  { key: "rain", label: "豪大雨", test: (phenomena: string) => phenomena.includes("雨") },
  { key: "wind", label: "強風", test: (phenomena: string) => phenomena.includes("風") && !phenomena.includes("颱風") },
  { key: "temperature", label: "高低溫", test: (phenomena: string) => phenomena.includes("溫") },
  { key: "fog", label: "濃霧", test: (phenomena: string) => phenomena.includes("霧") },
] as const;

function hazardCell(county: CountyRisk, test: (phenomena: string) => boolean): "alarm" | "advisory" | null {
  const matches = county.warnings.filter((warning) => test(warning.phenomena));
  if (matches.length === 0) return null;
  return matches.some((warning) => warningTone(warning) === "alarm") ? "alarm" : "advisory";
}

/** The JMA nationwide grid: one row per county, one coloured cell per hazard. */
function NationalTable({
  counties,
  viewState,
  selectedCountyName,
  onSelectCounty,
}: {
  counties: CountyRisk[];
  viewState: WarningViewState;
  selectedCountyName: string;
  onSelectCounty: (countyName: string) => void;
}) {
  const selectAndReveal = (countyName: string) => {
    onSelectCounty(countyName);
    document.getElementById("county-focus")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  };
  // Only data within 24 hours may show an empty cell as "none listed".
  const conclusive = viewState === "current";

  return (
    <section aria-labelledby="national-title" className="border border-rule bg-surface">
      <TitleBar id="national-title">全台縣市警特報（各縣市）</TitleBar>
      <Band>色塊：紅＝警報、橙＝特報；灰＝未列。點縣市名稱可切換目的地。</Band>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-center">
          {REGIONS.map((region) => (
            <tbody key={region}>
              <tr className="bg-band">
                <th scope="col" className="w-[30%] border-t-2 border-rule px-2 py-2 text-base font-bold">
                  {REGION_LABELS[region]}
                </th>
                {HAZARD_COLUMNS.map((column) => (
                  <th key={column.key} scope="col" className="border-l border-t-2 border-rule px-1 py-2 text-sm font-normal">
                    {column.label}
                  </th>
                ))}
              </tr>
              {counties
                .filter((county) => county.region === region)
                .map((county) => (
                  <tr key={county.countyName} className="border-t border-rule">
                    <th scope="row" className={`p-0 font-normal ${county.countyName === selectedCountyName ? "bg-accent-soft" : ""}`}>
                      <button
                        type="button"
                        aria-pressed={county.countyName === selectedCountyName}
                        onClick={() => selectAndReveal(county.countyName)}
                        className="min-h-touch w-full px-2 text-base underline underline-offset-4 lg:min-h-9"
                      >
                        {county.countyName}
                      </button>
                    </th>
                    {HAZARD_COLUMNS.map((column) => {
                      const level = hazardCell(county, column.test);
                      return (
                        <td
                          key={column.key}
                          className={`border-l border-rule text-sm font-bold ${level ? LEVEL_CELL[level] : "bg-none text-muted"}`}
                          style={!level && !conclusive ? HATCH_STYLE : undefined}
                        >
                          {level === "alarm" ? "警" : level === "advisory" ? "特" : conclusive ? "" : "---"}
                          {level ? <span className="sr-only">{`${column.label}${level === "alarm" ? "警報" : "特報"}`}</span> : null}
                        </td>
                      );
                    })}
                  </tr>
                ))}
            </tbody>
          ))}
        </table>
      </div>
    </section>
  );
}

function MapPanel({
  snapshot,
  viewState,
  result,
  now,
  statuses,
  selectedCountyName,
  onSelectCounty,
}: {
  snapshot: RiskSnapshot | null;
  viewState: WarningViewState;
  result: RiskDashboardLoadResult | null;
  now: number;
  statuses: Record<string, MapCountyStatus>;
  selectedCountyName: string;
  onSelectCounty: (countyName: string) => void;
}) {
  const counts = MAP_LEGEND.map((item) => ({
    ...item,
    count: snapshot ? COUNTIES.filter((county) => (statuses[county.countyName] ?? "unknown") === item.status).length : 0,
  }));
  const describe = (countyName: string) => {
    const county = snapshot?.counties.find((candidate) => candidate.countyName === countyName);
    if (!county || viewState === "unavailable") return `${countyName}：待確認`;
    if (county.warnings.length === 0) return viewState === "expired" ? `${countyName}：資料超過 24 小時，待確認` : `${countyName}：未列有效警特報`;
    return `${countyName}：${county.warnings.map((warning) => `${warning.phenomena}${warning.significance}`).join("、")}`;
  };
  const dataTime = viewState === "unavailable" ? undefined : warningDataTime(result);
  const summary = !snapshot || viewState === "unavailable"
    ? "全台狀態待確認"
    : `${snapshot.national.activeWarningCountyCount} / ${COUNTIES.length} 縣市${viewState === "expired" ? "（24 小時前的資料）" : ""}列有警特報`;

  return (
    <section aria-labelledby="map-title" className="border border-rule bg-surface">
      <TitleBar id="map-title">警特報地圖</TitleBar>
      <Band>{dataTime ? `${formatClock(dataTime, now)} 資料 · ${summary}` : summary}</Band>
      <div className="aspect-[360/520] w-full border-t border-rule bg-sea">
        <TaiwanMap
          statuses={statuses}
          selectedCountyName={selectedCountyName}
          hatched={viewState !== "current"}
          onSelect={onSelectCounty}
          describe={describe}
        />
      </div>
      <ul className="grid gap-2 border-t border-rule px-3 py-3" aria-label="地圖圖例">
        {counts.map((item) => (
          <li key={item.status} className="flex items-center gap-2 text-sm">
            <span
              className={`h-4 w-4 shrink-0 border border-rule ${TONE_BAR[item.status]}`}
              style={item.status === "unknown" ? HATCH_STYLE : undefined}
              aria-hidden="true"
            />
            <span className="font-bold">{item.label}</span>
            {snapshot ? <span className="tabular text-muted">{item.count}</span> : null}
            <span className="ml-auto text-muted">{item.hint}</span>
          </li>
        ))}
      </ul>
      {viewState !== "current" ? <p className="border-t border-rule px-3 py-2 text-sm text-muted">斜線表示資料尚未確認或超過 24 小時。</p> : null}
    </section>
  );
}

/** Placeholder sized like the loaded answer so the page does not jump when data arrives. */
function LoadingState({ withCounty }: { withCounty: boolean }) {
  return (
    <div className="mt-4">
      <p className="flex items-center gap-2 text-base text-muted">
        <Loader2 className="h-4 w-4 animate-spin text-accent" aria-hidden="true" />
        正在整理 CWA 警特報與觀測資料
      </p>
      {withCounty ? (
        <div aria-hidden="true">
          <div className="mt-4 h-24 animate-pulse bg-raised" />
          <div className="mt-4 h-24 animate-pulse bg-raised" />
        </div>
      ) : null}
    </div>
  );
}

function FatalState({ error, sources, onRetry }: { error: string; sources: SourceStatus[]; onRetry: () => void }) {
  return (
    <section className="border border-rule bg-surface" aria-live="assertive">
      <div className="flex min-h-9 items-center gap-2 bg-alarm px-3 py-1 text-on-alarm">
        <AlertTriangle className="h-5 w-5" aria-hidden="true" />
        <h2 className="text-base font-bold">目前無法確認官方警特報</h2>
      </div>
      <div className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-base text-muted">{error}</p>
          <a href={OFFICIAL_WARNING_URL} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-touch items-center gap-2 text-base font-bold text-accent underline underline-offset-4">
            直接查看 CWA 官方警特報
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
        <button
          type="button"
          onClick={() => onRetry()}
          className="inline-flex min-h-touch items-center justify-center gap-2 rounded-control bg-brand px-4 text-base font-bold text-white"
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
    <section className="border border-rule bg-surface">
      <TitleBar>目前沒有可顯示的資料</TitleBar>
      <div className="px-4 py-4">
        <p className="text-base text-muted">來源可能暫時沒有資料或網路連線中斷；這不代表目前沒有警特報。</p>
        <button type="button" onClick={() => onRetry()} className="mt-4 inline-flex min-h-touch items-center justify-center gap-2 rounded-control bg-brand px-4 text-base font-bold text-white">
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          重新讀取
        </button>
      </div>
    </section>
  );
}

function StateBanner({
  result,
  viewState,
  isRefreshing,
}: {
  result: RiskDashboardLoadResult | null;
  viewState: WarningViewState;
  isRefreshing: boolean;
}) {
  if (!result) return null;

  const dataTime = warningDataTime(result);
  const failedSources = result.sources.filter((source) => source.status === "error").length;
  const staleSources = result.sources.filter((source) => source.stale).length;

  const banner =
    viewState === "unavailable"
      ? {
          tone: "alarm" as Tone,
          icon: AlertTriangle,
          strong: "警特報狀態待確認。",
          body: "來源無法取得或資料時間偏舊，因此頁面不會顯示「安全」或「無警報」結論。請先查看 CWA 官方頁。",
        }
      : viewState === "expired"
        ? {
            tone: "advisory" as Tone,
            icon: Clock3,
            strong: "這是 24 小時前的資料。",
            body: ` GitHub 排程延遲，最後成功更新 ${dataTime ? formatDateTime(dataTime) : "時間未提供"}；要看最新請到 CWA 官方網站。`,
          }
        : result.degraded || isRefreshing
          ? {
              tone: "calm" as Tone,
              icon: Info,
              strong:
                result.warnings.coverage === "cached"
                  ? "目前顯示本站快照；即時來源暫時取不到。"
                  : "警特報來源已直接取得；其他觀測資料可能不完整。",
              body: isRefreshing ? " 正在背景更新。" : ` ${failedSources} 個來源失敗，${staleSources} 個來源時間偏舊。`,
            }
          : null;

  if (!banner) return null;

  return (
    <div className={`flex items-start gap-3 border border-rule px-4 py-3 text-base ${TONE_CHIP[banner.tone]}`} role="status">
      <banner.icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <div>
        <span className="font-bold">{banner.strong}</span>
        {banner.body}
      </div>
    </div>
  );
}

interface WarningGroup {
  key: string;
  title: string;
  tone: "alarm" | "advisory";
  warnings: WeatherWarning[];
}

function WarningSection({
  warnings,
  warningState,
  warningStatus,
  selectedCountyName,
}: {
  warnings: WeatherWarning[];
  warningState: WarningViewState;
  warningStatus?: RiskDashboardLoadResult["warnings"];
  selectedCountyName: string;
}) {
  const groups = useMemo(() => groupWarnings(warnings), [warnings]);

  return (
    <section aria-labelledby="warning-section-title" className="border border-rule bg-surface">
      <TitleBar id="warning-section-title">{warningState === "expired" ? "最後一筆資料中的警特報" : "官方有效警特報"}</TitleBar>
      <Band>
        {warningStatus?.sourceUpdatedAt ? `CWA 官方發布：${formatDateTime(warningStatus.sourceUpdatedAt)}` : "CWA 官方發布時間未提供"}
        {warningStatus?.coverage === "current" && warningStatus.fetchedAt ? (
          <><br />本站直接取得：{formatDateTime(warningStatus.fetchedAt)}</>
        ) : warningStatus?.coverage === "cached" && warningStatus.cacheGeneratedAt ? (
          <><br />快取建立：{formatDateTime(warningStatus.cacheGeneratedAt)}</>
        ) : null}
      </Band>

      {warningState === "unavailable" ? (
        <Notice tone="alarm">目前無法確認官方警特報資料；頁面不會把空資料解讀成沒有警報。</Notice>
      ) : groups.length === 0 ? (
        warningState === "expired" ? (
          <Notice tone="advisory">24 小時前的資料沒有列出有效警特報，但這不能代表現在沒有警報，請到 CWA 官方頁確認。</Notice>
        ) : (
          <Notice tone="calm">截至資料時間，這份 CWA 縣市警特報資料未列出仍有效的警示。這不是對其他災害或行程安全的保證。</Notice>
        )
      ) : (
        groups.map((group) => <WarningGroupRows key={group.key} group={group} selectedCountyName={selectedCountyName} />)
      )}
    </section>
  );
}

function WarningGroupRows({ group, selectedCountyName }: { group: WarningGroup; selectedCountyName: string }) {
  const counties = [...new Set(group.warnings.map((warning) => warning.countyName))];
  const ordered = [...group.warnings].sort(
    (a, b) => Number(b.countyName === selectedCountyName) - Number(a.countyName === selectedCountyName),
  );

  return (
    <article className="border-t-2 border-rule">
      <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] sm:grid-cols-[8rem_minmax(0,1fr)]">
        <div className={`flex items-center justify-center px-2 text-base font-bold ${LEVEL_CELL[group.tone]}`}>
          {group.tone === "alarm" ? "警報" : "特報"}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 bg-band px-4 py-2">
          <div className="min-w-0">
            <h3 className="text-lg font-bold">{group.title}</h3>
            <p className="tabular text-sm text-muted">
              {counties.length === COUNTIES.length
                ? `全台 ${counties.length} 個縣市`
                : counties.length > 8
                  ? `${counties.length} 個縣市`
                  : `${counties.length} 個縣市：${counties.join("、")}`}
            </p>
          </div>
          <a
            href={officialWarningUrl(group.warnings[0])}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-touch items-center gap-2 rounded-control border border-rule bg-surface px-3 text-sm font-bold text-accent"
          >
            官方詳情 <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
      </div>
      <p className="border-t border-rule px-4 py-2 text-base">
        <span className="font-bold">本站整理：</span>
        {actionForWarning(group.warnings[0])}
      </p>
      {ordered.map((warning) => (
        <div
          key={`${warning.countyName}-${warning.startTime}`}
          className={`grid grid-cols-[5.5rem_minmax(0,1fr)] border-t border-rule sm:grid-cols-[8rem_minmax(0,1fr)_16rem] ${
            warning.countyName === selectedCountyName ? "bg-accent-soft" : ""
          }`}
        >
          <div className="flex items-center justify-center border-r border-rule px-2 py-2 text-base font-bold">{warning.countyName}</div>
          <p className="px-4 py-2 text-base">
            {warning.affectedAreas.length > 0 ? `影響範圍：${warning.affectedAreas.join("、")}` : "細部影響範圍以 CWA 公告為準"}
          </p>
          <p className="tabular col-start-2 px-4 pb-2 text-sm text-muted sm:col-start-3 sm:border-l sm:border-rule sm:py-2">{formatValidity(warning)}</p>
        </div>
      ))}
    </article>
  );
}

function ObservationSection({ snapshot, result }: { snapshot: RiskSnapshot; result: RiskDashboardLoadResult | null }) {
  const { rainfall, wind, temperature, earthquake, typhoon } = snapshot.sections;
  const rows = [
    { label: "1 小時最大雨量", item: rainfall.maxPast1h, unit: "mm", source: "rainfall" as const },
    { label: "24 小時最大雨量", item: rainfall.maxPast24h, unit: "mm", source: "rainfall" as const },
    { label: "最大陣風", item: wind.maxGust, unit: "m/s", source: "weather" as const },
    { label: "最高溫", item: temperature.hottest, unit: "°C", source: "weather" as const },
  ];

  return (
    <section aria-labelledby="observation-title" className="border border-rule bg-surface">
      <TitleBar id="observation-title">全台測站觀測（觀測脈絡，不是官方判定）</TitleBar>
      <Band>自動測站的當下數值，只是出門前的脈絡；不等於官方判定。</Band>
      <table className="w-full border-collapse text-left">
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-t border-rule">
              <th scope="row" className="w-[30%] bg-band/40 px-3 py-2 text-base font-normal">
                {row.label}
              </th>
              <td className="border-l border-rule px-3 py-2">
                <span className="tabular text-xl font-bold">{row.item ? formatNumber(row.item.value) : "--"}</span>
                <span className="ml-1 text-sm text-muted">{row.item ? row.unit : "無資料"}</span>
                <span className="ml-3 text-base">{row.item ? `${row.item.countyName} ${row.item.stationName}` : "測站未回傳"}</span>
                <span className="tabular block text-xs text-muted">{sourceSummary(result, row.source)}</span>
              </td>
            </tr>
          ))}
          <tr className="border-t-2 border-rule">
            <th scope="row" className="bg-band/40 px-3 py-2 text-base font-normal">
              區域熱帶氣旋
            </th>
            <td className="border-l border-rule px-3 py-2 text-base">
              {typhoon.signal ? `${typhoon.signal.localName ?? typhoon.signal.name ?? "未命名"}（西北太平洋與南海路徑資料；不是臺灣颱風警報）` : "資料未列活動中熱帶氣旋"}
            </td>
          </tr>
          <tr className="border-t border-rule">
            <th scope="row" className="bg-band/40 px-3 py-2 text-base font-normal">
              最近顯著有感地震
            </th>
            <td className="tabular border-l border-rule px-3 py-2 text-base">
              {earthquake.signal?.occurredAt
                ? `${formatDateTime(earthquake.signal.occurredAt)}${earthquake.signal.magnitude ? `，規模 ${formatNumber(earthquake.signal.magnitude)}` : ""}`
                : "無資料"}
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

function SourceFooter({ sources }: { sources: SourceStatus[] }) {
  return (
    <footer className="border border-rule bg-surface">
      <TitleBar>資料來源與限制</TitleBar>
      <div className="px-4 py-3 text-base text-muted">
        <p>本頁是民間整理工具，不是政府官方服務，也不代表中央氣象署背書；緊急狀況請依中央與地方政府發布資訊行動。</p>
        <ul className="mt-2 list-disc space-y-1 pl-6">
          <li>官方警特報是判斷目的地有無警示的主要依據。</li>
          <li>來源失敗或資料超過 24 小時時，本站不下「沒有警報」的結論。</li>
          <li>行動建議與觀測整理是本站整理，不是官方安全判定。</li>
          <li>地圖邊界：taiwan-atlas，源自內政部國土測繪中心開放資料。版面節奏參考日本氣象廳警報頁。</li>
        </ul>
        <a href="https://opendata.cwa.gov.tw/" target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-touch items-center gap-2 font-bold text-accent underline underline-offset-4">
          CWA 開放資料平臺
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
        </a>
      </div>
      <SourceList sources={sources} />
    </footer>
  );
}

function SourceList({ sources }: { sources: SourceStatus[] }) {
  return (
    <ul>
      {sources.map((source) => {
        const status = sourceDisplay(source);
        return (
          <li key={source.key} className="flex flex-col gap-2 border-t border-rule px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="min-w-0">
              <a href={source.url} target="_blank" rel="noreferrer" className="text-base font-bold text-ink underline-offset-4 hover:underline">
                {source.label}
              </a>
              <span className="ml-2 text-sm text-muted">{source.id}</span>
              {source.error ? <p className="mt-1 break-words text-sm text-alarm-ink">即時來源：{source.error}</p> : null}
            </div>
            <div className="flex shrink-0 items-start gap-3 sm:text-right">
              <p className="tabular text-xs text-muted">
                來源時間：{source.updatedAt ? formatDateTime(source.updatedAt) : "未提供"}
                <br />
                {source.provenance === "cache"
                  ? `快取建立：${source.cacheGeneratedAt ? formatDateTime(source.cacheGeneratedAt) : "未提供"}`
                  : `本站取得：${source.fetchedAt ? formatDateTime(source.fetchedAt) : "未提供"}`}
              </p>
              <span className={`rounded-control px-2 py-1 text-sm font-bold ${TONE_CHIP[status.tone]}`}>{status.label}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Notice({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <div className={`flex items-start gap-3 border-t border-rule px-4 py-3 text-base ${TONE_CHIP[tone]}`}>
      <Clock3 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}

function groupWarnings(warnings: WeatherWarning[]): WarningGroup[] {
  const unique = warnings.filter(
    (warning, index, list) =>
      list.findIndex(
        (item) => item.countyName === warning.countyName && item.phenomena === warning.phenomena && item.startTime === warning.startTime,
      ) === index,
  );
  const groups = new Map<string, WarningGroup>();
  for (const warning of unique) {
    const key = `${warning.phenomena}${warning.significance}`;
    const group = groups.get(key) ?? { key, title: key, tone: warningTone(warning), warnings: [] };
    group.warnings.push(warning);
    groups.set(key, group);
  }
  return [...groups.values()].sort(
    (a, b) => Number(b.tone === "alarm") - Number(a.tone === "alarm") || b.warnings.length - a.warnings.length,
  );
}

function countyFromUrl(): string {
  if (typeof window === "undefined") return "";
  const countyName = new window.URL(window.location.href).searchParams.get("county") ?? "";
  return COUNTIES.some((county) => county.countyName === countyName) ? countyName : "";
}

function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

const THEME_STORAGE_KEY = "theme";

function useTheme(): ["light" | "dark", () => void] {
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "dark" : "light",
  );

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#0b151e" : "#ecf1f4");
  }, [theme]);

  const toggle = () =>
    setTheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        // Storage can be blocked; the toggle still works for this visit.
      }
      return next;
    });

  return [theme, toggle];
}
