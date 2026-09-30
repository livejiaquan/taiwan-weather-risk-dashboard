import { useEffect, useState } from "react";
import type { RiskDashboardLoadResult } from "../lib/cwaClient";
import { nextWarningCheckDelay } from "../lib/warningClock";

export function useWarningClock(result: RiskDashboardLoadResult | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let timer: ReturnType<typeof globalThis.setTimeout>;
    const update = () => {
      globalThis.clearTimeout(timer);
      const currentTime = Date.now();
      setNow(currentTime);
      timer = globalThis.setTimeout(update, nextWarningCheckDelay(result, currentTime));
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") update();
    };
    update();
    window.addEventListener("focus", update);
    window.addEventListener("pageshow", update);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      globalThis.clearTimeout(timer);
      window.removeEventListener("focus", update);
      window.removeEventListener("pageshow", update);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [result]);
  return now;
}
