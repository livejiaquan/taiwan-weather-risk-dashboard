import type { RiskDashboardLoadResult } from "../../lib/cwaClient";
import type { CountyRisk } from "../../lib/riskEngine";

export type LoadState =
  | { status: "loading"; data: RiskDashboardLoadResult | null; error: null }
  | { status: "success"; data: RiskDashboardLoadResult; error: null }
  | { status: "error"; data: RiskDashboardLoadResult | null; error: string };

export type RegionFilter = "all" | CountyRisk["region"];
export type WarningViewState = "current" | "cached" | "unavailable";
