import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import {
  loadCachedRiskDashboardData,
  loadRiskDashboardData,
  type RiskDashboardLoadResult,
  type SourceStatus,
} from "../lib/cwaClient";
import { buildRiskSnapshot, type WeatherWarning } from "../lib/riskEngine";

vi.mock("../lib/cwaClient", () => ({
  loadCachedRiskDashboardData: vi.fn(),
  loadRiskDashboardData: vi.fn(),
}));

const mockedLoadCachedRiskDashboardData = vi.mocked(loadCachedRiskDashboardData);
const mockedLoadRiskDashboardData = vi.mocked(loadRiskDashboardData);

const GENERATED_AT = "2026-05-30T00:30:00+08:00";
const WARNING_UPDATED_AT = "2026-05-30T00:10:00+08:00";
const FETCHED_AT = "2026-05-29T16:30:00.000Z";

const SOURCE_FIXTURES = {
  warnings: {
    id: "W-C0033-001",
    label: "縣市天氣警特報",
    url: "https://example.test/warnings.json",
  },
  rainfall: {
    id: "O-A0002-001",
    label: "自動雨量站雨量資料",
    url: "https://example.test/rainfall.json",
  },
  weather: {
    id: "O-A0001-001",
    label: "自動氣象站觀測資料",
    url: "https://example.test/weather.json",
  },
  earthquake: {
    id: "E-A0015-005",
    label: "顯著有感地震縣市震度",
    url: "https://example.test/earthquake.json",
  },
  typhoon: {
    id: "W-C0034-005",
    label: "熱帶氣旋路徑",
    url: "https://example.test/typhoon.json",
  },
} as const;

function makeSource(
  key: SourceStatus["key"],
  overrides: Partial<SourceStatus> = {},
): SourceStatus {
  return {
    key,
    ...SOURCE_FIXTURES[key],
    status: "success",
    provenance: "live",
    updatedAt: key === "warnings" ? WARNING_UPDATED_AT : GENERATED_AT,
    fetchedAt: FETCHED_AT,
    stale: false,
    ...overrides,
  };
}

function makeSnapshot(warnings: WeatherWarning[] = []) {
  return buildRiskSnapshot({
    generatedAt: GENERATED_AT,
    warnings,
    rainfallStations: [],
    weatherStations: [],
    earthquake: null,
    typhoon: null,
  });
}

function makeCurrentResult(warnings: WeatherWarning[] = []): RiskDashboardLoadResult {
  return {
    snapshot: makeSnapshot(warnings),
    sources: (Object.keys(SOURCE_FIXTURES) as SourceStatus["key"][]).map((key) => makeSource(key)),
    warnings: {
      coverage: "current",
      currentness: "current",
      sourceUpdatedAt: WARNING_UPDATED_AT,
      fetchedAt: FETCHED_AT,
    },
    degraded: false,
    fatal: false,
    cacheUsed: false,
  };
}

function makeUnavailableWarningResult(): RiskDashboardLoadResult {
  return {
    ...makeCurrentResult(),
    sources: [
      makeSource("warnings", {
        status: "error",
        provenance: "none",
        updatedAt: undefined,
        stale: true,
        error: "warning source unavailable",
      }),
      makeSource("rainfall"),
      makeSource("weather"),
      makeSource("earthquake"),
      makeSource("typhoon"),
    ],
    warnings: {
      coverage: "unavailable",
      currentness: "unknown",
      fetchedAt: FETCHED_AT,
    },
    degraded: true,
  };
}

function makeCachedEmptyWarningResult(): RiskDashboardLoadResult {
  const cacheGeneratedAt = "2026-05-30T00:20:00+08:00";
  return {
    ...makeCurrentResult(),
    sources: [
      makeSource("warnings", {
        status: "error",
        provenance: "cache",
        cacheGeneratedAt,
        error: "warning source unavailable",
      }),
      makeSource("rainfall"),
      makeSource("weather"),
      makeSource("earthquake"),
      makeSource("typhoon"),
    ],
    warnings: {
      coverage: "cached",
      currentness: "current",
      sourceUpdatedAt: WARNING_UPDATED_AT,
      fetchedAt: FETCHED_AT,
      cacheGeneratedAt,
    },
    degraded: true,
    cacheUsed: true,
  };
}

function taipeiRain(endTime: string): WeatherWarning {
  return {
    countyName: "臺北市",
    geocode: "63",
    phenomena: "大雨",
    significance: "特報",
    startTime: "2026-05-30T00:00:00+08:00",
    endTime,
    affectedAreas: ["山區"],
  };
}

function arrangeResult(result: RiskDashboardLoadResult, cached: RiskDashboardLoadResult | null = null) {
  mockedLoadCachedRiskDashboardData.mockResolvedValue(cached);
  mockedLoadRiskDashboardData.mockResolvedValue(result);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("App trust-first warning contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Fixtures were fetched at 00:30 Taipei time; pin "now" a few minutes later
    // so the UI's data-age bands treat them as fresh (under 90 minutes).
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-05-30T00:35:00+08:00"));
    window.history.replaceState(null, "", "/");
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("keeps the answer for data a few hours old and labels its age in amber", async () => {
    vi.setSystemTime(new Date("2026-05-30T03:30:00+08:00"));
    window.history.replaceState(null, "", "/?county=臺北市");
    arrangeResult(makeCurrentResult([taipeiRain("2026-05-30T06:00:00+08:00")]));

    render(<App />);

    expect(await screen.findByRole("heading", { name: "臺北市 有 1 項警特報" })).toBeInTheDocument();
    expect(screen.getByText("資料時間 00:30 · 3 小時前")).toBeInTheDocument();
    expect(screen.getByText("這些警特報仍在 CWA 標示的有效期間內。")).toBeInTheDocument();
    expect(screen.queryByText(/本站每 3–4 小時更新一次/)).not.toBeInTheDocument();
    expect(screen.queryByText(/警特報狀態待確認/)).not.toBeInTheDocument();
  });

  it("drops a warning whose own validity ended after the snapshot was taken", async () => {
    vi.setSystemTime(new Date("2026-05-30T03:30:00+08:00"));
    window.history.replaceState(null, "", "/?county=臺北市");
    arrangeResult(makeCurrentResult([taipeiRain("2026-05-30T02:00:00+08:00")]));

    render(<App />);

    expect(await screen.findByRole("heading", { name: "臺北市 未列有效縣市警特報" })).toBeInTheDocument();
    expect(screen.getByText("另有 1 項已在資料時間之後到期，未列入。")).toBeInTheDocument();
  });

  it("points to the official source once data is more than six hours old, still showing the answer", async () => {
    vi.setSystemTime(new Date("2026-05-30T08:40:00+08:00"));
    window.history.replaceState(null, "", "/?county=臺北市");
    arrangeResult(makeCurrentResult());

    render(<App />);

    expect(await screen.findByRole("heading", { name: "臺北市 未列有效縣市警特報" })).toBeInTheDocument();
    expect(screen.getByText("資料時間 00:30 · 8 小時前")).toBeInTheDocument();
    expect(screen.getByText(/本站每 3–4 小時更新一次/)).toBeInTheDocument();
  });

  it("draws no conclusion from data more than 24 hours old but keeps it on screen", async () => {
    vi.setSystemTime(new Date("2026-05-31T01:00:00+08:00"));
    window.history.replaceState(null, "", "/?county=臺北市");
    arrangeResult(makeCurrentResult());

    render(<App />);

    expect(await screen.findByRole("heading", { name: "無法確認 臺北市 現況" })).toBeInTheDocument();
    expect(screen.getByText("這是 24 小時前的資料。")).toBeInTheDocument();
    expect(screen.getByText("資料時間 05/30 00:30 · 1 天前")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "最後一筆資料中的警特報" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "臺北市 未列有效縣市警特報" })).not.toBeInTheDocument();
  });

  it("counts distinct counties when one county has two warnings of the same kind", async () => {
    const base = { countyName: "臺北市", geocode: "63", phenomena: "大雨", significance: "特報", affectedAreas: ["山區"] };
    arrangeResult(
      makeCurrentResult([
        { ...base, startTime: "2026-05-30T00:00:00+08:00", endTime: "2026-05-30T02:00:00+08:00" },
        { ...base, startTime: "2026-05-30T00:20:00+08:00", endTime: "2026-05-30T03:00:00+08:00" },
      ]),
    );

    render(<App />);

    expect(await screen.findByText("1 個縣市：臺北市")).toBeInTheDocument();
  });

  it("provides a keyboard skip link to the destination warning check", () => {
    mockedLoadCachedRiskDashboardData.mockReturnValue(new Promise(() => {}));
    mockedLoadRiskDashboardData.mockReturnValue(new Promise(() => {}));

    render(<App />);

    expect(screen.getByRole("link", { name: "跳到主要內容" })).toHaveAttribute(
      "href",
      "#county-focus",
    );
    expect(document.getElementById("county-focus")).toHaveAttribute("tabindex", "-1");
  });

  it("keeps the first loading paint neutral until official warning data is confirmed", () => {
    window.history.replaceState(null, "", "/?county=臺北市");
    mockedLoadCachedRiskDashboardData.mockReturnValue(new Promise(() => {}));
    mockedLoadRiskDashboardData.mockReturnValue(new Promise(() => {}));

    render(<App />);

    expect(screen.getByRole("heading", { name: "正在確認官方警特報" })).toBeInTheDocument();
    expect(screen.getByText(/資料確認完成前，本站不會顯示沒有警報或其他結論/)).toBeInTheDocument();
    expect(screen.getByText(/正在整理 CWA 警特報與觀測資料/)).toBeInTheDocument();
    expect(screen.queryByText(/未列有效縣市警特報/)).not.toBeInTheDocument();
    expect(screen.queryByText("整體安全")).not.toBeInTheDocument();
    expect(screen.queryByText(/官方來源讀取正常/)).not.toBeInTheDocument();
  });

  it("starts direct official retrieval immediately even when cache is still pending", async () => {
    window.history.replaceState(null, "", "/?county=臺北市");
    const cache = deferred<RiskDashboardLoadResult | null>();
    mockedLoadCachedRiskDashboardData.mockReturnValue(cache.promise);
    mockedLoadRiskDashboardData.mockResolvedValue(makeCurrentResult());

    render(<App />);

    expect(mockedLoadCachedRiskDashboardData).toHaveBeenCalledOnce();
    expect(mockedLoadRiskDashboardData).toHaveBeenCalledOnce();
    expect(await screen.findByRole("heading", { name: "臺北市 未列有效縣市警特報" })).toBeInTheDocument();

    await act(async () => {
      cache.resolve(makeCachedEmptyWarningResult());
      await cache.promise;
    });
    expect(screen.getByRole("heading", { name: "臺北市 未列有效縣市警特報" })).toBeInTheDocument();
    expect(screen.getByText("資料時間 00:30 · 5 分鐘前")).toBeInTheDocument();
    expect(screen.queryByText(/資料時間 00:20/)).not.toBeInTheDocument();
  });

  it("does not briefly accept a cache result when cache and live settle in the same turn", async () => {
    window.history.replaceState(null, "", "/?county=臺北市");
    mockedLoadCachedRiskDashboardData.mockResolvedValue(makeCachedEmptyWarningResult());
    mockedLoadRiskDashboardData.mockResolvedValue(makeCurrentResult());

    render(<App />);

    expect(await screen.findByRole("heading", { name: "臺北市 未列有效縣市警特報" })).toBeInTheDocument();
    expect(screen.getByText("資料時間 00:30 · 5 分鐘前")).toBeInTheDocument();
    expect(screen.queryByText(/資料時間 00:20/)).not.toBeInTheDocument();
  });

  it("shows a valid cache only while live data is unresolved, then replaces it with live truth", async () => {
    window.history.replaceState(null, "", "/?county=臺北市");
    const live = deferred<RiskDashboardLoadResult>();
    mockedLoadCachedRiskDashboardData.mockResolvedValue(makeCachedEmptyWarningResult());
    mockedLoadRiskDashboardData.mockReturnValue(live.promise);

    render(<App />);

    expect(await screen.findByText("資料時間 00:20 · 15 分鐘前")).toBeInTheDocument();
    await act(async () => {
      live.resolve(makeCurrentResult());
      await live.promise;
    });
    expect(await screen.findByRole("heading", { name: "臺北市 未列有效縣市警特報" })).toBeInTheDocument();
    expect(screen.queryByText(/資料時間 00:20/)).not.toBeInTheDocument();
  });

  it("replaces an interim cache with the fail-closed fatal state when live cannot confirm warnings", async () => {
    window.history.replaceState(null, "", "/?county=臺北市");
    const live = deferred<RiskDashboardLoadResult>();
    const fatalResult: RiskDashboardLoadResult = {
      ...makeUnavailableWarningResult(),
      snapshot: null,
      fatal: true,
    };
    mockedLoadCachedRiskDashboardData.mockResolvedValue(makeCachedEmptyWarningResult());
    mockedLoadRiskDashboardData.mockReturnValue(live.promise);

    render(<App />);

    expect(await screen.findByText("資料時間 00:20 · 15 分鐘前")).toBeInTheDocument();
    await act(async () => {
      live.resolve(fatalResult);
      await live.promise;
    });
    expect(await screen.findByRole("heading", { name: "目前無法確認官方警特報" })).toBeInTheDocument();
    expect(screen.getByText(/無法取得 CWA 即時資料，也沒有在時效內的可用快取/)).toBeInTheDocument();
    expect(screen.queryByText(/資料時間 00:20/)).not.toBeInTheDocument();
    expect(screen.queryByText("整體安全")).not.toBeInTheDocument();
  });

  it("keeps a newer manual refresh authoritative when an older live request settles late", async () => {
    window.history.replaceState(null, "", "/?county=臺北市");
    const initialLive = deferred<RiskDashboardLoadResult>();
    const refreshedWarning: WeatherWarning = {
      countyName: "臺北市",
      geocode: "63",
      phenomena: "豪雨",
      significance: "特報",
      startTime: "2026-05-30T00:00:00+08:00",
      endTime: "2026-05-30T02:00:00+08:00",
      affectedAreas: ["山區"],
    };
    mockedLoadCachedRiskDashboardData.mockResolvedValue(makeCachedEmptyWarningResult());
    mockedLoadRiskDashboardData.mockReturnValueOnce(initialLive.promise).mockResolvedValueOnce(makeCurrentResult([refreshedWarning]));

    render(<App />);

    expect(await screen.findByText("資料時間 00:20 · 15 分鐘前")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "更新資料" })[0]);
    expect(await screen.findByRole("heading", { name: "臺北市 有 1 項警特報" })).toBeInTheDocument();

    await act(async () => {
      initialLive.resolve(makeCurrentResult());
      await initialLive.promise;
    });
    expect(screen.getByRole("heading", { name: "臺北市 有 1 項警特報" })).toBeInTheDocument();
  });

  it("does not show a safe or official-normal conclusion when the warning source is unavailable", async () => {
    window.history.replaceState(null, "", "/?county=臺北市");
    arrangeResult(makeUnavailableWarningResult());

    render(<App />);

    expect(await screen.findByRole("heading", { name: "無法確認 臺北市 現況" })).toBeInTheDocument();
    expect(screen.getByText(/警特報狀態待確認/)).toBeInTheDocument();
    expect(screen.getByText(/目前無法確認官方警特報資料/)).toBeInTheDocument();
    expect(screen.queryByText("整體安全")).not.toBeInTheDocument();
    expect(screen.queryByText(/台灣目前整體天氣風險偏低/)).not.toBeInTheDocument();
    expect(screen.queryByText(/官方來源讀取正常/)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "臺北市 未列有效縣市警特報" })).not.toBeInTheDocument();
  });

  it("shows a recent snapshot as data with its own time rather than as live confirmation", async () => {
    window.history.replaceState(null, "", "/?county=臺北市");
    const cachedResult = makeCachedEmptyWarningResult();
    arrangeResult(cachedResult, cachedResult);

    render(<App />);

    expect(await screen.findByRole("heading", { name: "臺北市 未列有效縣市警特報" })).toBeInTheDocument();
    // The age is measured from the snapshot (00:20), not from when the browser loaded it.
    expect(screen.getByText("資料時間 00:20 · 15 分鐘前")).toBeInTheDocument();
    expect(screen.getAllByText(/快取建立：.*00:20/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/本站直接取得/)).not.toBeInTheDocument();
    expect(screen.queryByText(/官方來源讀取正常/)).not.toBeInTheDocument();
  });

  it("hydrates the selected county from the URL and updates the URL when selection changes", async () => {
    window.history.replaceState(null, "", "/?county=臺北市");
    arrangeResult(makeCurrentResult());

    render(<App />);

    const countySelect = await screen.findByLabelText("今天要去哪裡？");
    expect(countySelect).toHaveValue("臺北市");
    expect(screen.getByRole("heading", { name: "臺北市 未列有效縣市警特報" })).toBeInTheDocument();
    expect(document.getElementById("county-focus")).toContainElement(countySelect);

    fireEvent.change(countySelect, { target: { value: "高雄市" } });

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "高雄市 未列有效縣市警特報" })).toBeInTheDocument();
      expect(new window.URL(window.location.href).searchParams.get("county")).toBe("高雄市");
    });
  });

  it("syncs county selection on browser back/popstate and safely ignores an invalid county", async () => {
    window.history.replaceState(null, "", "/?county=臺北市");
    arrangeResult(makeCurrentResult());

    render(<App />);

    const countySelect = await screen.findByLabelText("今天要去哪裡？");
    fireEvent.change(countySelect, { target: { value: "高雄市" } });
    expect(countySelect).toHaveValue("高雄市");

    await act(async () => {
      const navigated = new Promise<void>((resolve) => {
        window.addEventListener("popstate", () => resolve(), { once: true });
      });
      window.history.back();
      await navigated;
    });
    await waitFor(() => {
      expect(countySelect).toHaveValue("臺北市");
      expect(screen.getByRole("heading", { name: "臺北市 未列有效縣市警特報" })).toBeInTheDocument();
    });

    act(() => {
      window.history.pushState(null, "", "/?county=不存在縣市");
      window.dispatchEvent(new window.PopStateEvent("popstate"));
    });
    await waitFor(() => {
      expect(countySelect).toHaveValue("");
      expect(screen.getByRole("heading", { name: "選一個縣市查看" })).toBeInTheDocument();
    });
  });

  it("shows official validity, affected areas, and a clearly labeled site interpretation for current warnings", async () => {
    window.history.replaceState(null, "", "/?county=臺北市");
    const warning: WeatherWarning = {
      countyName: "臺北市",
      geocode: "63",
      phenomena: "豪雨",
      significance: "特報",
      startTime: "2026-05-30T00:00:00+08:00",
      endTime: "2026-05-30T02:00:00+08:00",
      affectedAreas: ["山區", "低窪地區"],
    };
    arrangeResult(makeCurrentResult([warning]));

    render(<App />);

    expect(await screen.findByRole("heading", { name: "臺北市 有 1 項警特報" })).toBeInTheDocument();
    expect(screen.getByText("CWA 有效警特報")).toBeInTheDocument();
    expect(screen.getAllByText(/官方發布：.*2026.*05.*30.*00:10/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/本站直接取得：.*2026.*05.*30.*00:30/).length).toBeGreaterThan(0);

    const warningSectionHeading = screen.getByRole("heading", { name: "官方有效警特報" });
    const warningSection = warningSectionHeading.closest("section");
    expect(warningSection).toBeInstanceOf(window.HTMLElement);
    if (!(warningSection instanceof window.HTMLElement)) throw new Error("Warning section not found");
    const warningContent = within(warningSection);

    expect(warningContent.getByText("影響範圍：山區、低窪地區")).toBeInTheDocument();
    expect(warningContent.getByText(/開始.*2026.*05.*30.*00:00.*結束.*2026.*05.*30.*02:00/)).toBeInTheDocument();
    expect(warningContent.getByText("本站整理：")).toBeInTheDocument();
    expect(warningContent.getByRole("link", { name: /官方詳情/ })).toHaveAttribute(
      "href",
      "https://www.cwa.gov.tw/V8/C/P/Warning/W26.html",
    );
  });
});
