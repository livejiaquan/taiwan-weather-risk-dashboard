import { useEffect, useRef, useState } from "react";
import { loadCachedRiskDashboardData, loadRiskDashboardData } from "../../lib/cwaClient";
import type { LoadState } from "./types";

export function useDashboardData() {
  const [state, setState] = useState<LoadState>({ status: "loading", data: null, error: null });
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

  return { state, load };
}
