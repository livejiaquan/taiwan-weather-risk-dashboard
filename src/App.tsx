import {
  AlertTriangle,
  ChevronDown,
  Clock3,
  CloudRain,
  Database,
  ExternalLink,
  Info,
  Loader2,
  MapPin,
  Moon,
  RefreshCw,
  Sun,
  Thermometer,
  Wind,
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
  REFRESH_SUGGESTED_AFTER_MINUTES,
  actionForWarning,
  answerTitle,
  countyMapStatus,
  countyWarningPresentation,
  formatAge,
  formatDateTime,
  formatMetric,
  formatNumber,
  formatValidity,
  minutesSince,
  officialWarningUrl,
  sourceDisplay,
  sourceSummary,
  warningTone,
  warningViewState,
  warningViewStateAt,
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

const TONE_BORDER: Record<Tone, string> = {
  alarm: "border-alarm",
  advisory: "border-advisory",
  calm: "border-calm",
  unknown: "border-unknown",
  accent: "border-accent",
};

/** The single page container: 1280px max with fixed gutters. */
const CONTAINER = "mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8";

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

  const snapshot = state.data?.snapshot ?? null;
  const viewState = warningViewStateAt(state.data, now);
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

      {/* One container; every block starts at its left edge or at the second column of the same 2-column grid. */}
      <main className={CONTAINER}>
        <section
          id="county-focus"
          tabIndex={-1}
          aria-label="目的地警特報"
          className="grid gap-8 pt-6 focus:outline-none lg:grid-cols-2 lg:pt-12"
        >
          <DestinationPanel
            state={state}
            viewState={viewState}
            statuses={mapStatuses}
            result={state.data}
            selectedCounty={selectedCounty}
            selectedCountyName={selectedCountyName}
            onSelectCounty={selectCounty}
          />
        </section>

        <div className="mt-12 flex flex-col gap-12 pb-16 lg:mt-16 lg:gap-16">
          {isLoading && !snapshot ? null : state.status === "error" && !snapshot ? (
            <>
              <FatalState error={state.error} sources={state.data?.sources ?? []} onRetry={() => void load()} />
              <MapSection snapshot={null} viewState={viewState} statuses={mapStatuses} selectedCountyName={selectedCountyName} onSelectCounty={selectCounty} />
            </>
          ) : snapshot ? (
            <>
              <StateBanner result={state.data} viewState={viewState} isRefreshing={isLoading} />
              <MapSection
                snapshot={snapshot}
                viewState={viewState}
                statuses={mapStatuses}
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
    <header className="sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur">
      <div className={`${CONTAINER} flex h-16 items-center justify-between gap-3`}>
        <a href="./" className="flex min-w-0 items-center gap-3 rounded-control" aria-label="出門前：台灣縣市警特報整理">
          <BrandMark />
          <span className="min-w-0">
            <h1 className="text-lg font-black leading-tight">出門前</h1>
            <span className="hidden text-sm text-muted sm:block">台灣縣市警特報整理</span>
          </span>
        </a>
        <div className="flex items-center gap-2">
          <FreshnessPill result={result} viewState={viewState} isLoading={isLoading} now={now} />
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            aria-label={isLoading ? "正在更新資料" : "更新資料"}
            className="grid h-11 w-11 place-items-center rounded-control border border-line bg-surface text-ink transition hover:border-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={theme === "dark" ? "切換為淺色模式" : "切換為深色模式"}
            className="grid h-11 w-11 place-items-center rounded-control border border-line bg-surface text-ink transition hover:border-accent"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
          </button>
        </div>
      </div>
    </header>
  );
}

function BrandMark() {
  return (
    <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-hidden="true">
      <rect width="32" height="32" rx="8" className="fill-ink" />
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
  if (!result) {
    return (
      <span className="inline-flex h-11 items-center gap-2 rounded-control border border-line bg-surface px-3 text-sm font-semibold text-muted">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        <span className="hidden sm:inline">{isLoading ? "連線 CWA" : "尚無資料"}</span>
      </span>
    );
  }

  const sourceState = warningViewState(result);
  const confirmedAt = sourceState === "cached" ? result.warnings.cacheGeneratedAt : result.warnings.fetchedAt;
  const age = minutesSince(confirmedAt, now);
  const expired = viewState === "unavailable" && sourceState !== "unavailable";
  const aging = viewState === "current" && age !== null && age >= REFRESH_SUGGESTED_AFTER_MINUTES;
  const tone: Tone = isLoading ? "unknown" : viewState === "unavailable" ? "alarm" : viewState === "cached" || aging ? "advisory" : "accent";
  const label = isLoading
    ? "更新中"
    : expired
      ? "已過期"
      : viewState === "unavailable"
        ? "無法確認"
        : viewState === "cached"
          ? "快取"
          : aging
            ? "建議更新"
            : "即時";
  const title =
    viewState === "unavailable"
      ? "警特報來源無法確認"
      : `${viewState === "cached" ? "快取建立" : "本站取得"}：${confirmedAt ? formatDateTime(confirmedAt) : "未提供"}`;

  return (
    <span
      className={`inline-flex h-11 items-center gap-2 rounded-control px-3 text-sm font-semibold ${TONE_CHIP[tone]}`}
      title={title}
      aria-label={`資料狀態：${label}${age !== null ? `，${formatAge(age)}` : ""}`}
    >
      <span className={`relative h-2 w-2 rounded-full ${TONE_BAR[tone]}`} aria-hidden="true">
        {tone === "accent" ? <span className="absolute inset-0 animate-ping rounded-full bg-accent opacity-50" /> : null}
      </span>
      <span>{label}</span>
      {age !== null ? <span className="tabular hidden font-medium sm:inline">{formatAge(age)}</span> : null}
    </span>
  );
}

function DestinationPanel({
  state,
  viewState,
  statuses,
  result,
  selectedCounty,
  selectedCountyName,
  onSelectCounty,
}: {
  state: LoadState;
  viewState: WarningViewState;
  statuses: Record<string, MapCountyStatus>;
  result: RiskDashboardLoadResult | null;
  selectedCounty: CountyRisk | null;
  selectedCountyName: string;
  onSelectCounty: (countyName: string) => void;
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

  return (
    <>
      <div className="flex min-w-0 flex-col gap-8">
        <div>
          <label htmlFor="county-select" className="mb-2 block text-sm font-bold text-muted">
            今天要去哪裡？
          </label>
          <div className="relative max-w-md">
            <MapPin className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-accent" aria-hidden="true" />
            <select
              id="county-select"
              value={selectedCountyName}
              onChange={(event) => onSelectCounty(event.target.value)}
              className="min-h-14 w-full appearance-none rounded-inner border border-line bg-surface py-3 pl-12 pr-12 text-lg font-bold text-ink outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/20"
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
            <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" aria-hidden="true" />
          </div>
        </div>

        <article aria-live="polite">
          <p className={`flex items-center gap-2 text-base font-bold ${TONE_TEXT[answer.tone]}`}>
            <span className={`h-3 w-3 rounded-sm ${TONE_BAR[answer.tone]}`} aria-hidden="true" />
            {answer.eyebrow}
          </p>
          {/* The visual heading splits into sizes and phrases; the label keeps one clean sentence for assistive tech. */}
          <h2 className="mt-3" aria-label={answerTitle(answer)}>
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
          {!selectedCountyName ? <NationalFigure result={result} viewState={viewState} /> : null}
          <p className="mt-4 max-w-xl text-base text-muted">{answer.detail}</p>

          <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
            <a
              href={officialWarningUrl(showWarnings[0])}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-touch items-center justify-center gap-2 rounded-inner bg-accent px-6 text-base font-bold text-accent-ink transition hover:opacity-90"
            >
              到 CWA 官方頁確認
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </a>
            <WarningTimes result={result} isLoading={state.status === "loading"} />
          </div>
        </article>
      </div>

      {/* Second column: the details behind the answer, or a quick county picker when none is chosen. */}
      <div className="min-w-0">
        {!result && state.status === "loading" ? (
          <LoadingState withCounty={Boolean(selectedCountyName)} />
        ) : !selectedCountyName && result?.snapshot ? (
          <CountyIndex
            counties={result.snapshot.counties}
            statuses={statuses}
            selectedCountyName={selectedCountyName}
            onSelectCounty={onSelectCounty}
          />
        ) : null}

        {showWarnings.length > 0 ? (
          <ul className="flex flex-col gap-6">
            {showWarnings.map((warning) => (
              <li key={`${warning.phenomena}-${warning.startTime}`} className={`border-l-4 pl-4 ${TONE_BORDER[warningTone(warning)]}`}>
                <p className="text-lg font-bold">
                  {warning.phenomena}
                  {warning.significance}
                </p>
                <p className="tabular text-sm text-muted">
                  {warning.startTime ? formatDateTime(warning.startTime) : "開始未提供"}
                  {warning.endTime ? ` 至 ${formatDateTime(warning.endTime)}` : " 起，結束以官方公告為準"}
                </p>
                <p className="mt-1 text-base">
                  {warning.affectedAreas.length > 0
                    ? `影響範圍：${warning.affectedAreas.join("、")}`
                    : `影響縣市：${warning.countyName}；細部範圍以官方公告為準`}
                </p>
              </li>
            ))}
            <li className="text-base">
              <span className="font-bold">本站整理的下一步：</span>
              {actionForWarning(showWarnings[0])}
            </li>
          </ul>
        ) : null}

        {selectedCounty && viewState !== "unavailable" ? (
          <CountyObservations county={selectedCounty} first={showWarnings.length === 0} />
        ) : null}
      </div>
    </>
  );
}

/** With no destination chosen, the nationwide count is the answer. */
function NationalFigure({ result, viewState }: { result: RiskDashboardLoadResult | null; viewState: WarningViewState }) {
  const snapshot = result?.snapshot;
  if (!snapshot || viewState === "unavailable") {
    // Rendered with interim text so the block keeps its height while loading.
    return (
      <p className="mt-6 text-xl font-bold text-muted">
        {!result ? "正在讀取全台警特報" : "全台狀態待確認，請以 CWA 官方頁為準"}
      </p>
    );
  }
  const statuses = snapshot.counties.map((county) => countyMapStatus(county, viewState));
  const tone: Tone = statuses.includes("alarm") ? "alarm" : statuses.includes("advisory") ? "advisory" : "calm";
  return (
    <p className="tabular mt-6">
      <span className={`text-4xl font-black lg:text-5xl ${TONE_FOCAL[tone]}`}>{snapshot.national.activeWarningCountyCount}</span>
      <span className="ml-2 text-xl font-bold">
        / {COUNTIES.length} 縣市{viewState === "cached" ? "（快取）" : ""}列有警特報
      </span>
    </p>
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

function CountyObservations({ county, first }: { county: CountyRisk; first: boolean }) {
  const items = [
    { label: "1 小時雨量", value: formatMetric(county.metrics.maxPast1h, "mm") },
    { label: "24 小時雨量", value: formatMetric(county.metrics.maxPast24h, "mm") },
    { label: "最大陣風", value: formatMetric(county.metrics.maxGustSpeed, "m/s") },
    { label: "最高溫", value: formatMetric(county.metrics.maxTemperature, "°C") },
  ];
  return (
    <div className={first ? "" : "mt-8 border-t border-line pt-6"}>
      <p className="text-sm text-muted">{county.countyName}測站最大值（觀測脈絡，不是官方判定）</p>
      <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {items.map((item) => (
          <div key={item.label}>
            <dt className="text-sm text-muted">{item.label}</dt>
            <dd className="tabular text-xl font-bold">{item.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function MapSection({
  snapshot,
  viewState,
  statuses,
  selectedCountyName,
  onSelectCounty,
}: {
  snapshot: RiskSnapshot | null;
  viewState: WarningViewState;
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
    if (county.warnings.length === 0) return viewState === "cached" ? `${countyName}：快取未列，待確認` : `${countyName}：未列有效警特報`;
    return `${countyName}：${county.warnings.map((warning) => `${warning.phenomena}${warning.significance}`).join("、")}`;
  };
  const summary = !snapshot || viewState === "unavailable"
    ? "全台狀態待確認"
    : `${snapshot.national.activeWarningCountyCount} / ${COUNTIES.length} 縣市${viewState === "cached" ? "（快取）" : ""}列有警特報`;

  return (
    <section aria-labelledby="map-title" className="grid gap-8 lg:grid-cols-2">
      <div className="min-w-0">
        <SectionHeading id="map-title" title="全台縣市" description={`${summary}。點地圖上的縣市可切換目的地。`} />
        <div className="aspect-[4/5] max-h-[40rem] w-full rounded-panel bg-sea py-4">
          <TaiwanMap
            statuses={statuses}
            selectedCountyName={selectedCountyName}
            hatched={viewState !== "current"}
            onSelect={onSelectCounty}
            describe={describe}
          />
        </div>
      </div>
      <div className="min-w-0">
        {/* Same heading structure as the map column, so the legend starts level with the map. */}
        <SectionHeading id="legend-title" title="怎麼讀這張地圖" description="顏色只代表 CWA 自己的分級，不是本站的風險分數。" />
        <ul className="grid gap-x-8 gap-y-4 sm:grid-cols-2" aria-labelledby="legend-title">
          {counts.map((item) => (
            <li key={item.status} className="flex items-start gap-3">
              <span
                className={`mt-1 h-4 w-4 shrink-0 rounded-sm ${TONE_BAR[item.status]}`}
                style={item.status === "unknown" ? HATCH_STYLE : undefined}
                aria-hidden="true"
              />
              <span className="min-w-0 text-base">
                <span className="font-bold">{item.label}</span>
                {snapshot ? <span className="tabular ml-2 text-muted">{item.count}</span> : null}
                <span className="block text-sm text-muted">{item.hint}</span>
              </span>
            </li>
          ))}
        </ul>
        {viewState !== "current" ? (
          <p className="mt-4 text-sm text-muted">斜線表示資料為快取或尚未確認，顏色不代表即時狀態。</p>
        ) : null}
        {snapshot && selectedCountyName ? (
          <div className="mt-12">
            <CountyIndex
              counties={snapshot.counties}
              statuses={statuses}
              selectedCountyName={selectedCountyName}
              onSelectCounty={onSelectCounty}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** Placeholder sized like the loaded answer so the page does not jump when data arrives. */
function LoadingState({ withCounty }: { withCounty: boolean }) {
  return (
    <div className="mt-6">
      <p className="flex items-center gap-2 text-base text-muted">
        <Loader2 className="h-4 w-4 animate-spin text-accent" aria-hidden="true" />
        正在整理 CWA 警特報與觀測資料
      </p>
      {withCounty ? (
        <div aria-hidden="true">
          <div className="mt-6 h-24 animate-pulse rounded-inner bg-raised" />
          <div className="mt-8 h-32 animate-pulse rounded-inner bg-raised sm:h-24" />
        </div>
      ) : null}
    </div>
  );
}

function FatalState({ error, sources, onRetry }: { error: string; sources: SourceStatus[]; onRetry: () => void }) {
  return (
    <section className="border-t-4 border-alarm pt-6" aria-live="assertive">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-black">
            <AlertTriangle className="h-6 w-6 text-alarm" aria-hidden="true" />
            目前無法確認官方警特報
          </h2>
          <p className="mt-2 text-base text-muted">{error}</p>
          <a href={OFFICIAL_WARNING_URL} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-touch items-center gap-2 text-base font-bold text-accent underline underline-offset-4">
            直接查看 CWA 官方警特報
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
        <button
          type="button"
          onClick={() => onRetry()}
          className="inline-flex min-h-touch items-center justify-center gap-2 rounded-inner bg-ink px-4 text-base font-bold text-bg"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          重新讀取
        </button>
      </div>
      {sources.length > 0 ? <div className="mt-6"><SourceList sources={sources} /></div> : null}
    </section>
  );
}

function EmptyState({ onRetry }: { onRetry: () => void }) {
  return (
    <section className="border-t border-line pt-8">
      <h2 className="text-2xl font-black">目前沒有可顯示的資料</h2>
      <p className="mt-2 text-base text-muted">來源可能暫時沒有資料或網路連線中斷；這不代表目前沒有警特報。</p>
      <button type="button" onClick={() => onRetry()} className="mt-6 inline-flex min-h-touch items-center justify-center gap-2 rounded-inner bg-ink px-4 text-base font-bold text-bg">
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        重新讀取
      </button>
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
      : viewState === "cached"
        ? {
            tone: "advisory" as Tone,
            icon: Database,
            strong: "目前顯示時效內快取。",
            body: "快取可保留最近警示，但「快取未列警報」不能證明現在沒有警報；請到官方頁確認。",
          }
        : result.degraded || isRefreshing
          ? {
              tone: "advisory" as Tone,
              icon: Info,
              strong: "警特報來源已直接取得；其他觀測資料可能不完整。",
              body: isRefreshing ? " 正在背景更新。" : ` ${failedSources} 個來源失敗，${staleSources} 個來源時間偏舊。`,
            }
          : null;

  if (!banner) return null;

  return (
    <div className={`flex items-start gap-3 rounded-inner px-4 py-3 text-base ${TONE_CHIP[banner.tone]}`} role="status">
      <banner.icon className="mt-1 h-5 w-5 shrink-0" aria-hidden="true" />
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
    <section aria-labelledby="warning-section-title">
      <SectionHeading
        id="warning-section-title"
        title={warningState === "cached" ? "快取中的有效警特報" : "官方有效警特報"}
        description="依警特報種類整理；同一種警特報在各縣市的影響範圍可能不同。"
      />
      <p className="tabular -mt-2 mb-6 text-sm text-muted">
        {warningStatus?.sourceUpdatedAt ? `CWA 官方發布：${formatDateTime(warningStatus.sourceUpdatedAt)}` : "CWA 官方發布時間未提供"}
        {warningStatus?.coverage === "current" && warningStatus.fetchedAt ? (
          <><br />本站直接取得：{formatDateTime(warningStatus.fetchedAt)}</>
        ) : warningStatus?.coverage === "cached" && warningStatus.cacheGeneratedAt ? (
          <><br />快取建立：{formatDateTime(warningStatus.cacheGeneratedAt)}</>
        ) : null}
      </p>

      {warningState === "unavailable" ? (
        <Notice tone="alarm">目前無法確認官方警特報資料；頁面不會把空資料解讀成沒有警報。</Notice>
      ) : groups.length === 0 ? (
        warningState === "cached" ? (
          <Notice tone="advisory">時效內快取沒有列出有效警特報，但快取空白不能證明目前沒有警報，請到 CWA 官方頁確認。</Notice>
        ) : (
          <Notice tone="calm">截至上方標示的本站直接取得時間，這份 CWA 縣市警特報資料未列出仍有效的警示。這不是對其他災害或行程安全的保證。</Notice>
        )
      ) : (
        <div className="flex flex-col gap-12">
          {groups.map((group) => (
            <WarningGroupCard key={group.key} group={group} selectedCountyName={selectedCountyName} />
          ))}
        </div>
      )}
    </section>
  );
}

function WarningGroupCard({ group, selectedCountyName }: { group: WarningGroup; selectedCountyName: string }) {
  const counties = [...new Set(group.warnings.map((warning) => warning.countyName))];
  // Collapsed: two counties on phones, four on wider screens.
  const [expanded, setExpanded] = useState(group.warnings.length <= 2);
  const ordered = [...group.warnings].sort(
    (a, b) => Number(b.countyName === selectedCountyName) - Number(a.countyName === selectedCountyName),
  );
  const visible = expanded ? ordered : ordered.slice(0, 4);

  return (
    <article className={`border-t-4 pt-6 ${TONE_BORDER[group.tone]}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-2xl font-black">{group.title}</h3>
          <p className="tabular mt-1 text-base text-muted">
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
          className="inline-flex min-h-touch items-center gap-2 rounded-control border border-line px-4 text-base font-bold text-accent transition hover:border-accent"
        >
          官方詳情 <ExternalLink className="h-4 w-4" aria-hidden="true" />
        </a>
      </div>

      <p className="mt-4 max-w-3xl text-base">
        <span className="font-bold">本站整理：</span>
        {actionForWarning(group.warnings[0])}
      </p>

      <ul className="mt-6 grid gap-4 lg:grid-cols-2 lg:gap-x-8">
        {visible.map((warning, index) => (
          <li
            key={`${warning.countyName}-${warning.startTime}`}
            className={`rounded-inner px-4 py-4 ${warning.countyName === selectedCountyName ? "bg-accent-soft" : "bg-surface"} ${
              !expanded && index >= 2 ? "hidden lg:block" : ""
            }`}
          >
            <div className="text-lg font-bold">{warning.countyName}</div>
            <p className="mt-1 text-base">
              {warning.affectedAreas.length > 0 ? `影響範圍：${warning.affectedAreas.join("、")}` : "細部影響範圍以 CWA 公告為準"}
            </p>
            <p className="tabular mt-1 text-sm text-muted">{formatValidity(warning)}</p>
          </li>
        ))}
      </ul>
      {group.warnings.length > 2 ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className={`mt-4 inline-flex min-h-touch items-center gap-2 rounded-control text-base font-bold text-accent ${
            group.warnings.length <= 4 && !expanded ? "lg:hidden" : ""
          }`}
        >
          {expanded ? "收合" : `顯示全部 ${group.warnings.length} 個縣市的範圍與時間`}
          <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
      ) : null}
    </article>
  );
}

function CountyIndex({
  counties,
  statuses,
  selectedCountyName,
  onSelectCounty,
}: {
  counties: CountyRisk[];
  statuses: Record<string, MapCountyStatus>;
  selectedCountyName: string;
  onSelectCounty: (countyName: string) => void;
}) {
  const selectAndReveal = (countyName: string) => {
    onSelectCounty(countyName);
    document.getElementById("county-focus")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  };

  return (
    <section aria-labelledby="county-index-title">
      <SectionHeading id="county-index-title" title="依地區選縣市" description="色塊與地圖相同；數字是該縣市目前列出的警特報項數。" />
      <div className="divide-y divide-line border-y border-line">
        {REGIONS.map((region) => (
          <div key={region} className="flex flex-col gap-2 py-4">
            <h3 className="text-sm font-bold text-muted">{REGION_LABELS[region]}</h3>
            <div className="flex flex-wrap gap-2">
              {counties
                .filter((county) => county.region === region)
                .map((county) => {
                  const status = statuses[county.countyName] ?? "unknown";
                  const selected = county.countyName === selectedCountyName;
                  return (
                    <button
                      key={county.countyName}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => selectAndReveal(county.countyName)}
                      className={`inline-flex min-h-touch items-center gap-2 rounded-control border px-3 text-base font-bold transition ${
                        selected ? "border-ink bg-ink text-bg" : "border-line bg-surface hover:border-accent"
                      }`}
                    >
                      <span
                        className={`h-3 w-3 rounded-sm ${TONE_BAR[status]}`}
                        style={status === "unknown" ? HATCH_STYLE : undefined}
                        aria-hidden="true"
                      />
                      {county.countyName}
                      {county.warnings.length > 0 && status !== "unknown" ? (
                        <span className="tabular text-sm font-semibold">
                          {county.warnings.length}
                          <span className="sr-only"> 項警特報</span>
                        </span>
                      ) : null}
                    </button>
                  );
                })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ObservationSection({ snapshot, result }: { snapshot: RiskSnapshot; result: RiskDashboardLoadResult | null }) {
  const { rainfall, wind, temperature, earthquake, typhoon } = snapshot.sections;
  const rows = [
    { icon: CloudRain, label: "1 小時最大雨量", item: rainfall.maxPast1h, unit: "mm", source: "rainfall" as const },
    { icon: CloudRain, label: "24 小時最大雨量", item: rainfall.maxPast24h, unit: "mm", source: "rainfall" as const },
    { icon: Wind, label: "最大陣風", item: wind.maxGust, unit: "m/s", source: "weather" as const },
    { icon: Thermometer, label: "最高溫", item: temperature.hottest, unit: "°C", source: "weather" as const },
  ];

  return (
    <section aria-labelledby="observation-title" className="grid gap-12 lg:grid-cols-2 lg:gap-8">
      <div>
        <SectionHeading
          id="observation-title"
          title="全台測站觀測"
          description="自動測站的當下數值，只是出門前的脈絡；不等於官方判定。"
        />
        <dl className="grid divide-y divide-line border-y border-line sm:grid-cols-2 sm:gap-x-8 sm:divide-y-0">
          {rows.map((row) => (
            <div key={row.label} className="py-4 sm:border-b sm:border-line">
              <dt className="flex items-center gap-2 text-sm font-semibold text-muted">
                <row.icon className="h-4 w-4" aria-hidden="true" />
                {row.label}
              </dt>
              <dd className="mt-1">
                <span className="tabular text-2xl font-bold">{row.item ? formatNumber(row.item.value) : "--"}</span>
                <span className="ml-1 text-sm font-semibold text-muted">{row.item ? row.unit : "無資料"}</span>
                <span className="mt-1 block text-base">{row.item ? `${row.item.countyName} ${row.item.stationName}` : "測站未回傳"}</span>
                <span className="tabular mt-1 block text-xs text-muted">{sourceSummary(result, row.source)}</span>
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div>
        <SectionHeading id="records-title" title="近期紀錄" description="已發生的事件與區域資料，不納入目的地警特報判斷。" />
        <dl className="divide-y divide-line border-y border-line">
          <div className="py-4">
            <dt className="text-sm font-semibold text-muted">區域熱帶氣旋</dt>
            <dd className="mt-1 text-lg font-bold">
              {typhoon.signal ? `${typhoon.signal.localName ?? typhoon.signal.name ?? "未命名"}（西北太平洋與南海路徑資料）` : "資料未列活動中熱帶氣旋"}
            </dd>
            {typhoon.signal ? <dd className="mt-1 text-base text-muted">這不是臺灣颱風警報；颱風警報以上方 CWA 警特報為準。</dd> : null}
          </div>
          <div className="py-4">
            <dt className="text-sm font-semibold text-muted">最近顯著有感地震</dt>
            <dd className="tabular mt-1 text-lg font-bold">
              {earthquake.signal?.occurredAt
                ? `${formatDateTime(earthquake.signal.occurredAt)}${earthquake.signal.magnitude ? `，規模 ${formatNumber(earthquake.signal.magnitude)}` : ""}`
                : "無資料"}
            </dd>
            {earthquake.signal?.description ? <dd className="mt-1 text-base text-muted">{earthquake.signal.description}</dd> : null}
          </div>
        </dl>
      </div>
    </section>
  );
}

function SourceFooter({ sources }: { sources: SourceStatus[] }) {
  return (
    <footer className="grid gap-8 border-t border-line pt-12 lg:grid-cols-2">
      <div>
        <h2 className="text-xl font-bold">資料來源與限制</h2>
        <p className="mt-2 text-base text-muted">
          本頁是民間整理工具，不是政府官方服務，也不代表中央氣象署背書；緊急狀況請依中央與地方政府發布資訊行動。
        </p>
        <ul className="mt-4 list-disc space-y-1 pl-6 text-base text-muted">
          <li>官方警特報是判斷目的地有無警示的主要依據。</li>
          <li>來源失敗、資料過期或只有快取時，本站不下「沒有警報」的結論。</li>
          <li>行動建議與觀測整理是本站整理，不是官方安全判定。</li>
          <li>地圖邊界：taiwan-atlas，源自內政部國土測繪中心開放資料。</li>
        </ul>
        <a href="https://opendata.cwa.gov.tw/" target="_blank" rel="noreferrer" className="mt-4 inline-flex min-h-touch items-center gap-2 text-base font-bold text-accent underline underline-offset-4">
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
    <ul className="divide-y divide-line border-y border-line">
      {sources.map((source) => {
        const status = sourceDisplay(source);
        return (
          <li key={source.key} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
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

function SectionHeading({ id, title, description }: { id: string; title: string; description: string }) {
  return (
    <div className="mb-6">
      <h2 id={id} className="text-2xl font-black">
        {title}
      </h2>
      <p className="mt-1 text-base text-muted">{description}</p>
    </div>
  );
}

function Notice({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <div className={`flex items-start gap-3 rounded-inner px-4 py-3 text-base ${TONE_CHIP[tone]}`}>
      <Clock3 className="mt-1 h-5 w-5 shrink-0" aria-hidden="true" />
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
