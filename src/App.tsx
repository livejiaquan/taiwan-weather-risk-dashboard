import { useEffect, useMemo, useState } from "react";
import { COUNTIES } from "./lib/riskEngine";
import { dashboardAtTime } from "./lib/warningClock";
import { useWarningClock } from "./hooks/useWarningClock";
import { useDashboardData } from "./features/dashboard/useDashboardData";
import type { RegionFilter } from "./features/dashboard/types";
import { countyFromUrl, warningViewState } from "./features/dashboard/presentation";
import { SiteHeader } from "./features/dashboard/components/SiteHeader";
import { DestinationCheck } from "./features/dashboard/components/DestinationCheck";
import { LoadingState, FatalState, StateBanner, EmptyState } from "./features/dashboard/components/LoadStates";
import { OverviewStats, SignalSections } from "./features/dashboard/components/ObservationSections";
import { InterpretationGuide } from "./features/dashboard/components/InterpretationGuide";
import { CountySection } from "./features/dashboard/components/CountyExplorer";
import { WarningSection } from "./features/dashboard/components/WarningList";
import { SourceFooter } from "./features/dashboard/components/SourceDetails";

export function App() {
  const { state, load } = useDashboardData();
  const [region, setRegion] = useState<RegionFilter>("all");
  const [selectedCountyName, setSelectedCountyName] = useState(() => countyFromUrl());
  useEffect(() => {
    const syncCountyFromUrl = () => setSelectedCountyName(countyFromUrl());
    window.addEventListener("popstate", syncCountyFromUrl);
    return () => window.removeEventListener("popstate", syncCountyFromUrl);
  }, []);

  const now = useWarningClock(state.data);
  const data = useMemo(() => dashboardAtTime(state.data, now), [state.data, now]);
  const snapshot = data?.snapshot ?? null;
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
    <main className="dashboard-shell min-h-screen bg-[radial-gradient(circle_at_92%_0%,_rgba(186,230,253,0.5),_transparent_28rem),radial-gradient(circle_at_0%_20%,_rgba(15,118,110,0.08),_transparent_30rem),_#F6F7F2] text-ink">
      <a
        href="#county-focus"
        className="fixed left-4 top-4 z-50 -translate-y-24 rounded-xl bg-cobalt-700 px-4 py-3 font-bold text-white shadow-card transition-transform focus:translate-y-0"
      >
        跳到主要內容
      </a>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
        <SiteHeader />
        <DestinationCheck
          state={state}
          result={data}
          evaluatedAt={new Date(now).toISOString()}
          selectedCounty={selectedCounty}
          selectedCountyName={selectedCountyName}
          onSelectCounty={selectCounty}
          onRefresh={load}
        />

        {state.status === "loading" && !snapshot ? (
          <LoadingState />
        ) : state.status === "error" && !snapshot ? (
          <FatalState error={state.error} sources={data?.sources ?? []} onRetry={load} />
        ) : snapshot ? (
          <>
            <StateBanner result={data} isRefreshing={state.status === "loading"} />
            <CountySection
              counties={filteredCounties}
              region={region}
              setRegion={setRegion}
              warningState={warningViewState(data)}
              selectedCountyName={selectedCountyName}
              onSelectCounty={selectCounty}
            />
            <WarningSection
              warnings={snapshot.counties.flatMap((county) => county.warnings)}
              warningState={warningViewState(data)}
              warningStatus={data?.warnings}
            />
            <InterpretationGuide />
            <OverviewStats snapshot={snapshot} result={data} />
            <SignalSections snapshot={snapshot} sources={data?.sources ?? []} />
            <SourceFooter sources={data?.sources ?? []} />
          </>
        ) : (
          <EmptyState onRetry={load} />
        )}
      </div>
    </main>
  );
}
