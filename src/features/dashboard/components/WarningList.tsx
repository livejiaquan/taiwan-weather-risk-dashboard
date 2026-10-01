import { AlertTriangle } from "lucide-react";
import type { RiskDashboardLoadResult } from "../../../lib/cwaClient";
import type { WeatherWarning } from "../../../lib/riskEngine";
import type { WarningViewState } from "../types";
import { Card, WarningNotice } from "./Primitives";
import { WarningSourceTimes } from "./SourceDetails";
import { WarningRecord } from "./WarningRecord";

export function WarningSection({
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
      <div className="mb-4"><WarningSourceTimes status={warningStatus} /></div>
      {warningState === "unavailable" ? (
        <WarningNotice tone="red">目前無法確認官方警特報資料；頁面不會把空資料解讀成沒有警報。</WarningNotice>
      ) : uniqueWarnings.length === 0 ? (
        warningState === "cached" ? (
          <WarningNotice tone="amber">時效內快取沒有列出有效警特報，但快取空白不能證明目前沒有警報，請到 CWA 官方頁確認。</WarningNotice>
        ) : (
          <WarningNotice tone="teal">依最近取得的 CWA 資料與目前時間，未列出仍有效的縣市警示；已發布但尚未生效的警特報請選擇目的地查看。這不是對其他災害或行程安全的保證。</WarningNotice>
        )
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {uniqueWarnings.map((warning) => (
            <WarningRecord key={`${warning.countyName}-${warning.phenomena}-${warning.startTime}`} warning={warning} showCounty />
          ))}
        </div>
      )}
    </Card>
  );
}
