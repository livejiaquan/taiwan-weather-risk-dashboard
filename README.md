# 出門前｜台灣縣市警特報整理

一個以目的地為起點的公共資訊工具：選擇台灣縣市後，先查看目前有效的中央氣象署（CWA）警特報、細部影響範圍、有效時間與資料狀態，再把雨量、風速和溫度當作觀測脈絡。

本專案是民間整理介面，不是政府官方服務，也不代表中央氣象署背書。它不會宣稱某地「安全」，緊急狀況請以中央與地方政府公告為準。

**線上版：** [https://livejiaquan.github.io/taiwan-weather-risk-dashboard/](https://livejiaquan.github.io/taiwan-weather-risk-dashboard/)

## 產品任務

陌生使用者應能在數秒內回答：

- 我的目的地是否列有目前有效的 CWA 警特報？
- 警特報實際影響山區、平地或其他哪個範圍？
- 何時開始、何時結束，資料最後何時取得？
- 這是官方警特報、觀測脈絡，還是本站整理？
- 我下一步應該做什麼，去哪裡確認官方原文？

使命、外部研究、替代方案與 roadmap 見 [`PRODUCT_STRATEGY.md`](./PRODUCT_STRATEGY.md)。

## 目前功能

- 縣市一次選擇與可分享的 `?county=` URL。
- 目前有效的縣市警特報、affected areas、開始與結束時間。
- 警報資料的 `live`、`cache`、`unavailable` 狀態與逐來源時間。
- 資料時間在瀏覽器端依資料本身的時間計算，分四段標示（見下方「資料時效」）；無效、未來或超過 7 天的快照拒絕採用。
- 警特報來源失敗時 fail closed，不把空資料解讀成無警報。
- 雨量、風速與溫度另列為 CWA 觀測脈絡。
- 地震報告與區域熱帶氣旋另列為近期紀錄，不納入目前天氣警報判斷。
- 全台縣市警特報地圖：依 CWA 的「警報」「特報」字詞上色；「未列」用中性色而非綠色，快取或無法確認時整張地圖加斜線。
- 警特報依種類分組（例如「陸上強風特報：全台 22 個縣市」），逐縣市保留影響範圍與有效時間。
- 頁首資料狀態燈號（即時／快取／無法確認／建議更新）與相對時間；頁面開著超過 30 分鐘會提示更新。
- 深色／淺色模式（預設跟隨系統，可手動切換）。
- Loading、empty、partial、cached、fatal 與 responsive desktop/mobile 狀態。

設計依據：使用者研究 [`docs/ux-research.md`](./docs/ux-research.md)、同類產品調查 [`docs/design-research.md`](./docs/design-research.md)、設計語言 [`docs/design-system.md`](./docs/design-system.md)。

## 資料來源與語義

預設從 CWA 公開 AWS Open Data mirror 讀取；瀏覽器不需要、也不會內嵌 API key。

| Dataset | 本站用途 | 不代表 |
| --- | --- | --- |
| `Warning/W-C0033-001.json` | 目前縣市警特報、有效時間、影響範圍 | 所有災害都安全或不安全 |
| `Observation/O-A0002-001.json` | 自動雨量站觀測 | 官方豪大雨警報本身 |
| `Observation/O-A0001-001.json` | 自動氣象站溫度、風速、陣風 | 縣市整體狀態 |
| `Earthquake/E-A0015-005.json` | 最近顯著有感地震報告 | 仍在持續的地震風險 |
| `Warning/W-C0034-005.json` | 西北太平洋與南海活動中熱帶氣旋紀錄 | 臺灣已發布颱風警報 |

官方確認入口：

- [CWA 目前警特報](https://www.cwa.gov.tw/V8/C/P/Warning/FIFOWS.html)
- [CWA 豪大雨特報](https://www.cwa.gov.tw/V8/C/P/Warning/W26.html)
- [CWA 陸上強風特報](https://www.cwa.gov.tw/V8/C/P/Warning/W25.html)
- [CWA 開放資料平臺](https://opendata.cwa.gov.tw/)

## 本機開發

需求：Node.js 20、22 或 24 以上版本（符合 Vitest 支援範圍）與 npm。

```bash
npm install
npm run dev
```

Vite 會輸出本機預覽網址。

## 驗證

```bash
npm run lint
npm run test
npm run build
```

會影響使用者看到的變更，還必須從 production build 實際檢查 desktop/mobile、主要資料狀態、互動、overflow 與 browser console；build success 本身不是完整驗收。

## 縣市地圖

`src/lib/countyShapes.ts` 由 `npm run build:map` 產生：讀取 `scripts/data/counties-mercator-10t.json`（[taiwan-atlas](https://github.com/dkaoster/taiwan-atlas)，MIT，源自內政部「直轄市、縣市界線」開放資料），簡化後輸出預先投影的 SVG path（約 30 KiB），執行期不需要地圖函式庫或圖磚。

## Static cache

```bash
npm run fetch:data
```

腳本會產生 `public/data/latest.json`。這份 fallback **只保存完整的縣市警特報**，不再打包數千筆雨量站、氣象站、地震或熱帶氣旋 raw records；觀測脈絡只由瀏覽器的 live path 取得。Artifact 有 64 KiB raw 上限測試，目前真實產物約 6 KiB。

應用程式會先用 cache 快速首繪，隨即要求 CWA live sources，並在成功後取代畫面；live 失敗時才保留 cache。

### 資料時效

GitHub 排程實際約 3–4 小時才跑一次，所以時效門檻是依實際能做到的頻率訂定，而不是依 cron 的設定。資料時間的算法：live 是本站取得時間，cache 是快照建立時間。年齡由瀏覽器即時計算，頁面一直開著也會跟著變老。

| 資料時間 | 畫面 |
| --- | --- |
| ≤ 90 分鐘 | 即時；答案旁以中性色標「資料時間 HH:MM · N 分鐘前」 |
| ≤ 6 小時 | 答案與地圖照常顯示，時間標示改成琥珀色；若有警特報，註明它們仍在 CWA 標示的有效期間內 |
| ≤ 24 小時 | 同上，再加一行「本站每 3–4 小時更新一次」並附上官方連結 |
| > 24 小時 | 仍顯示最後一筆資料，但不下結論（「無法確認」）、地圖加斜線，頂部加一條說明 |

每項警特報都會在當下時間重新套用它自己的 CWA 有效期間，已經到期的會移除並註明。

Warning cache 只有在完整覆蓋 22 縣市、縣市名稱與代碼一致，且 hazard／有效時間／影響區域 schema 可解析時才會被採用或覆蓋部署產物。Generator 每次 request 有 8 秒 timeout，只對 network、timeout 或 HTTP 5xx 重試一次；warning 仍失敗時不寫入、不 rename，保留 last-known-good artifact。

GitHub Actions 排程只作 best-effort fallback：排程可能延遲或漏跑，因此不是警示更新 SLA，也不應是長期正式部署的唯一 ingestion path。Build／deploy job 分別設 15／10 分鐘上限，避免上游或 runner 無界等待。

獨立的 `freshness.yml` 會錯開部署排程，從公開 Pages URL 重新下載 artifact；它會檢查 HTTP/JSON、6 小時時效（超過就離開「稍舊」區間）、未來時間、warning source 狀態與完整 22 縣市 schema。可在本機執行 `npm run probe:freshness`；失敗診斷、重跑與 rollback 步驟見 [`docs/RECOVERY.md`](./docs/RECOVERY.md)。

## 部署

目前 workflow 可在 `main` 更新或手動觸發時測試、建立 cache、build 並部署 GitHub Pages。GitHub Pages 版本已提供 canonical、robots 與 sitemap；正式網域上線前仍需完成：

- 可配合自訂網域的 Vite base 與社群預覽圖片；
- 已選定網域的 DNS、HTTPS、rollback 與維護責任驗證。

Repository 內目前沒有網域、DNS 或外部監控 credential；不可把 sample/mock 或過期 cache 當 production fallback。

## 已知限制

- 一個縣市可能同時包含山區、平地、沿海等不同條件；請閱讀警特報的細部影響範圍。
- 自動測站會因站點密度、海拔、供電或通訊出現差異與缺值。
- 本站行動文字是依警特報類型整理的通用提醒，不是個人化醫療、交通或災防指令。
- 「未列有效縣市警特報」只描述該份 CWA 資料，不是整體安全保證。
