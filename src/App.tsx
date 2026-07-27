import {
  Activity,
  AlertTriangle,
  ArrowDownUp,
  CloudRain,
  ExternalLink,
  Gauge,
  Globe2,
  Info,
  Loader2,
  MapPin,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Thermometer,
  Waves,
  Wind,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  loadCachedRiskDashboardData,
  loadRiskDashboardData,
  type RiskDashboardLoadResult,
  type SourceStatus,
} from "./lib/cwaClient";
import { COUNTIES, type CountyRisk, type RiskLevel, type RiskSnapshot, type WeatherWarning } from "./lib/riskEngine";

type LoadState =
  | { status: "loading"; data: null; error: null }
  | { status: "success"; data: RiskDashboardLoadResult; error: null }
  | { status: "error"; data: RiskDashboardLoadResult | null; error: string };

type RegionFilter = "all" | CountyRisk["region"];

const REGION_LABELS: Record<RegionFilter, string> = {
  all: "全部",
  north: "北部",
  central: "中部",
  south: "南部",
  east: "東部",
  islands: "離島",
};

const LEVEL_META: Record<
  RiskLevel,
  {
    label: string;
    shortLabel: string;
    color: string;
    bg: string;
    border: string;
    text: string;
    icon: typeof ShieldCheck;
  }
> = {
  safe: {
    label: "整體安全",
    shortLabel: "安全",
    color: "#059669",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    text: "text-emerald-800",
    icon: ShieldCheck,
  },
  watch: {
    label: "留意局部變化",
    shortLabel: "觀察",
    color: "#0284c7",
    bg: "bg-sky-50",
    border: "border-sky-200",
    text: "text-sky-800",
    icon: Info,
  },
  elevated: {
    label: "局部風險升高",
    shortLabel: "注意",
    color: "#d97706",
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-900",
    icon: ShieldAlert,
  },
  high: {
    label: "天氣風險偏高",
    shortLabel: "警戒",
    color: "#dc2626",
    bg: "bg-red-50",
    border: "border-red-200",
    text: "text-red-900",
    icon: AlertTriangle,
  },
  stale: {
    label: "資料待確認",
    shortLabel: "待確認",
    color: "#64748b",
    bg: "bg-slate-50",
    border: "border-slate-200",
    text: "text-slate-700",
    icon: Info,
  },
};

const REGION_OPTIONS = Object.keys(REGION_LABELS) as RegionFilter[];

export function App() {
  const [state, setState] = useState<LoadState>({ status: "loading", data: null, error: null });
  const [region, setRegion] = useState<RegionFilter>("all");

  const load = async (preferCache = false) => {
    setState((current) => ({ status: "loading", data: current.data, error: null }) as LoadState);
    try {
      if (preferCache) {
        const cached = await loadCachedRiskDashboardData();
        if (cached?.snapshot) {
          setState({ status: "success", data: cached, error: null });
        }
      }

      const data = await loadRiskDashboardData();
      if (data.fatal) {
        setState({ status: "error", data, error: "無法取得 CWA 即時資料，也沒有可用快取。" });
      } else {
        setState({ status: "success", data, error: null });
      }
    } catch (error) {
      setState({
        status: "error",
        data: null,
        error: error instanceof Error ? error.message : "無法載入資料。",
      });
    }
  };

  useEffect(() => {
    void load(true);
  }, []);

  const snapshot = state.data?.snapshot ?? null;
  const filteredCounties = useMemo(() => {
    if (!snapshot) return [];
    if (region === "all") return snapshot.counties;
    return snapshot.counties.filter((county) => county.region === region);
  }, [region, snapshot]);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(20,184,166,0.18),_transparent_32rem),linear-gradient(135deg,_#f8fafc_0%,_#eef2f7_52%,_#fff7ed_100%)] text-slate-900">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8">
        <Hero
          state={state}
          snapshot={snapshot}
          onRefresh={load}
        />

        {state.status === "loading" && !snapshot ? (
          <LoadingState />
        ) : state.status === "error" && !snapshot ? (
          <FatalState
            error={state.error}
            sources={state.data?.sources ?? []}
            onRetry={load}
          />
        ) : snapshot ? (
          <>
            <StateBanner
              result={state.data}
              isRefreshing={state.status === "loading"}
            />
            <OverviewStats snapshot={snapshot} />
            <RiskCharts snapshot={snapshot} />
            <CountySection
              snapshot={snapshot}
              counties={filteredCounties}
              region={region}
              setRegion={setRegion}
            />
            <WarningSection warnings={snapshot.counties.flatMap((county) => county.warnings)} />
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
  snapshot,
  onRefresh,
}: {
  state: LoadState;
  snapshot: RiskSnapshot | null;
  onRefresh: () => void;
}) {
  const level = snapshot?.national.level ?? "stale";
  const meta = LEVEL_META[level];
  const Icon = meta.icon;

  return (
    <section className="overflow-hidden rounded-[1.5rem] border border-white/70 bg-white/85 shadow-soft backdrop-blur">
      <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1.15fr_0.85fr] lg:p-8">
        <div className="flex flex-col justify-between gap-8">
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-sm font-medium text-teal-800">
                <Globe2 className="h-4 w-4" aria-hidden="true" />
                CWA official public data
              </span>
              <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold ${meta.bg} ${meta.border} ${meta.text}`}>
                <Icon className="h-4 w-4" aria-hidden="true" />
                {meta.label}
              </span>
            </div>
            <div className="max-w-3xl">
              <p className="mb-2 text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">Taiwan Weather Risk Dashboard</p>
              <h1 className="text-3xl font-black leading-tight text-slate-950 sm:text-5xl">
                台灣天氣風險即時儀表板
              </h1>
              <p className="mt-4 text-lg leading-8 text-slate-700">
                {snapshot?.national.answer ?? "正在讀取中央氣象署公開資料，整理全台警特報、雨量、風速、溫度、颱風與地震訊號。"}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={() => onRefresh()}
              disabled={state.status === "loading"}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-card transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${state.status === "loading" ? "animate-spin" : ""}`} aria-hidden="true" />
              更新資料
            </button>
            <div className="text-sm text-slate-500">
              更新時間：{snapshot ? formatDateTime(snapshot.generatedAt) : "讀取中"}
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
          <HeroMetric
            label="最高風險分數"
            value={snapshot ? snapshot.national.score : "--"}
            unit="/ 100+"
            icon={Gauge}
          />
          <HeroMetric
            label="有警特報縣市"
            value={snapshot ? snapshot.national.activeWarningCountyCount : "--"}
            unit={` / ${COUNTIES.length}`}
            icon={AlertTriangle}
          />
          <HeroMetric
            label="目前主要狀態"
            value={meta.shortLabel}
            unit=""
            icon={meta.icon}
          />
        </div>
      </div>
    </section>
  );
}

function HeroMetric({
  label,
  value,
  unit,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  unit: string;
  icon: typeof Gauge;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between text-slate-500">
        <span className="text-sm font-medium">{label}</span>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="flex items-end gap-1">
        <span className="text-3xl font-black text-slate-950">{value}</span>
        <span className="pb-1 text-sm font-semibold text-slate-500">{unit}</span>
      </div>
    </div>
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

function FatalState({
  error,
  sources,
  onRetry,
}: {
  error: string;
  sources: SourceStatus[];
  onRetry: () => void;
}) {
  return (
    <section className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-950 shadow-card">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-black">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            即時資料讀取失敗
          </h2>
          <p className="mt-2 text-sm leading-6">{error}</p>
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
      <h2 className="text-xl font-black text-slate-950">目前沒有可顯示的天氣風險資料</h2>
      <p className="mt-2 text-slate-600">可能是來源暫時沒有資料或網路連線中斷。</p>
      <button
        type="button"
        onClick={() => onRetry()}
        className="mt-5 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white"
      >
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        重新讀取
      </button>
    </section>
  );
}

function StateBanner({
  result,
  isRefreshing,
}: {
  result: RiskDashboardLoadResult | null;
  isRefreshing: boolean;
}) {
  if (!result) return null;

  const staleSources = result.sources.filter((source) => source.stale);
  const failedSources = result.sources.filter((source) => source.status === "error");

  if (!result.degraded && !isRefreshing) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900 shadow-card">
        官方來源讀取正常，資料依 CWA 公開資料更新時間判定。
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-card">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 font-semibold">
          <Info className="h-4 w-4" aria-hidden="true" />
          {isRefreshing ? "正在更新資料" : result.cacheUsed ? "先顯示快取資料" : "部分資料需要留意"}
        </div>
        <div className="text-amber-900">
          {result.cacheUsed ? "背景會嘗試更新 CWA 即時來源" : `${failedSources.length} 個來源失敗，${staleSources.length} 個來源可能偏舊`}
        </div>
      </div>
    </div>
  );
}

function OverviewStats({ snapshot }: { snapshot: RiskSnapshot }) {
  const topCounty = snapshot.counties[0];
  const stats = [
    {
      label: "最高風險縣市",
      value: topCounty?.countyName ?? "無",
      detail: topCounty ? LEVEL_META[topCounty.level].label : "",
      icon: MapPin,
      accent: "from-red-500 to-orange-500",
    },
    {
      label: "最大24小時雨量",
      value: snapshot.sections.rainfall.maxPast24h ? `${formatNumber(snapshot.sections.rainfall.maxPast24h.value)} mm` : "無資料",
      detail: snapshot.sections.rainfall.maxPast24h
        ? `${snapshot.sections.rainfall.maxPast24h.countyName} ${snapshot.sections.rainfall.maxPast24h.stationName}`
        : "雨量站未回傳",
      icon: CloudRain,
      accent: "from-sky-500 to-teal-500",
    },
    {
      label: "最大陣風",
      value: snapshot.sections.wind.maxGust ? `${formatNumber(snapshot.sections.wind.maxGust.value)} m/s` : "無資料",
      detail: snapshot.sections.wind.maxGust
        ? `${snapshot.sections.wind.maxGust.countyName} ${snapshot.sections.wind.maxGust.stationName}`
        : "氣象站未回傳",
      icon: Wind,
      accent: "from-indigo-500 to-cyan-500",
    },
    {
      label: "最高溫",
      value: snapshot.sections.temperature.hottest ? `${formatNumber(snapshot.sections.temperature.hottest.value)} °C` : "無資料",
      detail: snapshot.sections.temperature.hottest
        ? `${snapshot.sections.temperature.hottest.countyName} ${snapshot.sections.temperature.hottest.stationName}`
        : "氣象站未回傳",
      icon: Thermometer,
      accent: "from-amber-500 to-red-500",
    },
  ];

  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {stats.map((stat) => (
        <div key={stat.label} className="group overflow-hidden rounded-2xl border border-white/70 bg-white p-5 shadow-card transition hover:-translate-y-1 hover:shadow-soft">
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
        </div>
      ))}
    </section>
  );
}

function RiskCharts({ snapshot }: { snapshot: RiskSnapshot }) {
  const riskDistribution = (["high", "elevated", "watch", "safe"] as RiskLevel[]).map((level) => ({
    level: LEVEL_META[level].shortLabel,
    count: snapshot.counties.filter((county) => county.level === level).length,
    color: LEVEL_META[level].color,
  }));

  const topRank = snapshot.counties.slice(0, 8).map((county) => ({
    county: county.countyName,
    score: county.score,
    color: LEVEL_META[county.level].color,
  }));

  return (
    <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
      <Card title="今天要注意什麼" icon={Activity}>
        <div className="space-y-3">
          {snapshot.attentionToday.map((item) => (
            <div key={item} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
              {item}
            </div>
          ))}
        </div>
      </Card>

      <Card title="縣市風險排行" icon={ArrowDownUp}>
        <div className="space-y-3">
          {topRank.map((entry) => (
            <div key={entry.county} className="grid grid-cols-[4.5rem_1fr_3rem] items-center gap-3">
              <div className="text-sm font-bold text-slate-600">{entry.county}</div>
              <div className="h-5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(8, Math.min(100, (entry.score / Math.max(120, snapshot.national.score)) * 100))}%`,
                    backgroundColor: entry.color,
                  }}
                />
              </div>
              <div className="text-right text-sm font-black text-slate-900">{entry.score}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {riskDistribution.map((item) => (
            <div key={item.level} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center">
              <div className="text-lg font-black" style={{ color: item.color }}>
                {item.count}
              </div>
              <div className="text-xs font-medium text-slate-500">{item.level}</div>
            </div>
          ))}
        </div>
      </Card>
    </section>
  );
}

function CountySection({
  snapshot,
  counties,
  region,
  setRegion,
}: {
  snapshot: RiskSnapshot;
  counties: CountyRisk[];
  region: RegionFilter;
  setRegion: (region: RegionFilter) => void;
}) {
  return (
    <section className="rounded-2xl border border-white/70 bg-white p-4 shadow-card sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-950">縣市風險狀態</h2>
          <p className="mt-1 text-sm text-slate-500">依警特報與即時觀測自動排序，點選區域快速篩選。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {REGION_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
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
          <CountyCard key={county.countyName} county={county} />
        ))}
      </div>

      {snapshot.counties.every((county) => county.score === 0) ? (
        <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          目前所有縣市都沒有明顯警特報或觀測風險訊號。
        </div>
      ) : null}
    </section>
  );
}

function CountyCard({ county }: { county: CountyRisk }) {
  const meta = LEVEL_META[county.level];
  const Icon = meta.icon;
  const reasons = county.reasons.length > 0 ? county.reasons.slice(0, 3) : ["目前未見明顯風險訊號"];

  return (
    <article className={`rounded-2xl border p-4 shadow-card ${meta.bg} ${meta.border}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-black text-slate-950">{county.countyName}</h3>
            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${meta.text} bg-white/70`}>
              {meta.shortLabel}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-600">{REGION_LABELS[county.region]} · 分數 {county.score}</p>
        </div>
        <Icon className={`h-5 w-5 ${meta.text}`} aria-hidden="true" />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {reasons.map((reason) => (
          <span key={reason} className="rounded-full bg-white/75 px-2.5 py-1 text-xs font-semibold text-slate-700">
            {reason}
          </span>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
        <MiniMetric label="1h雨" value={formatMetric(county.metrics.maxPast1h, "mm")} />
        <MiniMetric label="陣風" value={formatMetric(county.metrics.maxGustSpeed, "m/s")} />
        <MiniMetric label="高溫" value={formatMetric(county.metrics.maxTemperature, "°C")} />
      </div>
    </article>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/70 px-2 py-2">
      <div className="font-semibold text-slate-500">{label}</div>
      <div className="mt-1 font-black text-slate-900">{value}</div>
    </div>
  );
}

function WarningSection({ warnings }: { warnings: WeatherWarning[] }) {
  const uniqueWarnings = warnings.filter(
    (warning, index, list) =>
      list.findIndex(
        (item) =>
          item.countyName === warning.countyName &&
          item.phenomena === warning.phenomena &&
          item.startTime === warning.startTime,
      ) === index,
  );

  return (
    <Card title="目前警特報" icon={AlertTriangle}>
      {uniqueWarnings.length === 0 ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          CWA 縣市警特報目前沒有回傳作用中的警示。
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {uniqueWarnings.map((warning) => (
            <div key={`${warning.countyName}-${warning.phenomena}-${warning.startTime}`} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="font-black text-slate-950">{warning.countyName}</div>
                <div className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-slate-700">
                  {warning.phenomena}{warning.significance}
                </div>
              </div>
              <p className="mt-2 text-sm text-slate-600">
                {warning.affectedAreas.length > 0 ? `影響：${warning.affectedAreas.join("、")}` : "影響範圍以 CWA 公告為準"}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                {warning.startTime ? `開始 ${formatDateTime(warning.startTime)}` : "開始時間未提供"}
                {warning.endTime ? ` · 結束 ${formatDateTime(warning.endTime)}` : ""}
              </p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function SignalSections({ snapshot }: { snapshot: RiskSnapshot }) {
  const earthquake = snapshot.sections.earthquake.signal;
  const typhoon = snapshot.sections.typhoon.signal;

  return (
    <section className="grid gap-4 lg:grid-cols-3">
      <Card title="雨量觀測" icon={CloudRain}>
        <SignalLine label="1小時最大" value={formatRank(snapshot.sections.rainfall.maxPast1h, "mm")} />
        <SignalLine label="3小時最大" value={formatRank(snapshot.sections.rainfall.maxPast3h, "mm")} />
        <SignalLine label="24小時最大" value={formatRank(snapshot.sections.rainfall.maxPast24h, "mm")} />
      </Card>

      <Card title="風與溫度" icon={Wind}>
        <SignalLine label="最大陣風" value={formatRank(snapshot.sections.wind.maxGust, "m/s")} />
        <SignalLine label="平均風最大" value={formatRank(snapshot.sections.wind.maxAverage, "m/s")} />
        <SignalLine label="最高溫" value={formatRank(snapshot.sections.temperature.hottest, "°C")} />
      </Card>

      <Card title="颱風與地震" icon={Waves}>
        <SignalLine
          label="熱帶氣旋"
          value={
            snapshot.sections.typhoon.active && typhoon
              ? `${typhoon.localName ?? typhoon.name ?? "未命名"} · 約 ${formatNumber(typhoon.distanceKmFromTaiwan)} km`
              : "目前無近距活動訊號"
          }
        />
        <SignalLine
          label="近期有感地震"
          value={
            snapshot.sections.earthquake.recent && earthquake
              ? `${formatNumber(earthquake.magnitude)} · ${earthquake.description ?? "CWA 地震報告"}`
              : earthquake?.occurredAt
                ? `最近一筆 ${formatDateTime(earthquake.occurredAt)}`
                : "無資料"
          }
        />
      </Card>
    </section>
  );
}

function SignalLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 py-3 last:border-0">
      <span className="text-sm font-semibold text-slate-500">{label}</span>
      <span className="text-right text-sm font-bold text-slate-900">{value}</span>
    </div>
  );
}

function SourceFooter({ sources }: { sources: SourceStatus[] }) {
  return (
    <footer className="rounded-2xl border border-white/70 bg-white/85 p-5 text-sm text-slate-600 shadow-card">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-base font-black text-slate-950">資料來源與限制</h2>
          <p className="mt-2 leading-6">
            本專案使用中央氣象署 CWA Open Weather Data 公開資料，風險分數為儀表板整理後的使用者提示，實際災防決策請以 CWA 官方警特報與地方政府公告為準。
          </p>
        </div>
        <a
          href="https://opendata.cwa.gov.tw/"
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 font-semibold text-slate-700 hover:border-slate-400"
        >
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
      {sources.map((source) => (
        <div key={source.key} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold text-slate-800">{source.id}</span>
            <span className={`h-2.5 w-2.5 rounded-full ${source.status === "success" ? "bg-emerald-500" : "bg-red-500"}`} />
          </div>
          <p className="mt-1 text-xs font-medium text-slate-500">{source.label}</p>
          <p className="mt-2 text-xs text-slate-500">
            {source.status === "success" ? source.updatedAt ? formatDateTime(source.updatedAt) : "未提供時間" : source.error}
          </p>
        </div>
      ))}
    </div>
  );
}

function Card({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Activity;
  children: ReactNode;
}) {
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
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}
