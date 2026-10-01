import { AlertTriangle, CloudRain, Thermometer, Waves, Wind } from "lucide-react";
import type { RiskDashboardLoadResult, SourceStatus } from "../../../lib/cwaClient";
import { COUNTIES, type RiskSnapshot } from "../../../lib/riskEngine";
import { warningViewState, formatNumber, sourceSummary, formatRank, formatDateTime } from "../presentation";
import { Card, SignalLine } from "./Primitives";

export function OverviewStats({ snapshot, result }: { snapshot: RiskSnapshot; result: RiskDashboardLoadResult | null }) {
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
      accent: "from-cobalt-700 to-sky-600",
    },
    {
      label: "24 小時最大雨量",
      value: snapshot.sections.rainfall.maxPast24h ? `${formatNumber(snapshot.sections.rainfall.maxPast24h.value)} mm` : "無資料",
      detail: snapshot.sections.rainfall.maxPast24h
        ? `${snapshot.sections.rainfall.maxPast24h.countyName} ${snapshot.sections.rainfall.maxPast24h.stationName}`
        : "雨量站未回傳",
      source: sourceSummary(result, "rainfall"),
      icon: CloudRain,
      accent: "from-sky-700 to-cobalt-600",
    },
    {
      label: "最大陣風觀測",
      value: snapshot.sections.wind.maxGust ? `${formatNumber(snapshot.sections.wind.maxGust.value)} m/s` : "無資料",
      detail: snapshot.sections.wind.maxGust
        ? `${snapshot.sections.wind.maxGust.countyName} ${snapshot.sections.wind.maxGust.stationName}`
        : "氣象站未回傳",
      source: sourceSummary(result, "weather"),
      icon: Wind,
      accent: "from-cobalt-800 to-sky-600",
    },
    {
      label: "最高溫觀測",
      value: snapshot.sections.temperature.hottest ? `${formatNumber(snapshot.sections.temperature.hottest.value)} °C` : "無資料",
      detail: snapshot.sections.temperature.hottest
        ? `${snapshot.sections.temperature.hottest.countyName} ${snapshot.sections.temperature.hottest.stationName}`
        : "氣象站未回傳",
      source: sourceSummary(result, "weather"),
      icon: Thermometer,
      accent: "from-teal-700 to-sky-600",
    },
  ];

  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="警特報與觀測摘要">
      {stats.map((stat) => (
        <div key={stat.label} className="overflow-hidden rounded-2xl border border-line/80 bg-white/90 p-5 shadow-card">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-600">{stat.label}</p>
              <p className="mt-2 text-3xl font-black tabular-nums text-slate-950">{stat.value}</p>
            </div>
            <div className={`rounded-2xl bg-gradient-to-br ${stat.accent} p-3 text-white shadow-card`}>
              <stat.icon className="h-5 w-5" aria-hidden="true" />
            </div>
          </div>
          <p className="mt-4 text-sm text-slate-600">{stat.detail}</p>
          <p className="mt-2 text-sm font-semibold text-slate-600">{stat.source}</p>
        </div>
      ))}
    </section>
  );
}

export function SignalSections({ snapshot, sources }: { snapshot: RiskSnapshot; sources: SourceStatus[] }) {
  const earthquake = snapshot.sections.earthquake.signal;
  const typhoon = snapshot.sections.typhoon.signal;
  const typhoonSource = sources.find((source) => source.key === "typhoon");

  return (
    <div className="space-y-6">
    <section className="grid gap-4 lg:grid-cols-2" aria-label="上次取得的觀測資料">
      <p className="text-base leading-7 text-slate-700 lg:col-span-2">
        觀測資料為上次取得的快照，並非持續更新。請按「更新資料」重新取得，或查看<a href="#data-sources" className="font-bold text-teal-800 underline underline-offset-4">各來源時間</a>。
      </p>
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

    </section>
    <section aria-label="近期紀錄，不代表目前警報">
      <Card title="近期紀錄（不納入判斷）" icon={Waves}>
        <SignalLine
          label="區域熱帶氣旋"
          value={
            typhoon
              ? `${typhoon.localName ?? typhoon.name ?? "未命名"} · 這不是臺灣颱風警報`
              : typhoonSource?.status !== "success" || typhoonSource.stale ? "來源無法確認，沒有可用紀錄" : "這份來源資料未列活動中熱帶氣旋"
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
        <p className="pt-3 text-sm leading-5 text-slate-600">地震報告記錄已發生事件；熱帶氣旋資料涵蓋西北太平洋與南海，兩者都不等於目前對臺警報。</p>
      </Card>
    </section>
    </div>
  );
}
