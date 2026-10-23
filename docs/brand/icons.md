# Icon 與品牌標記

- **唯一的 icon 集是 Lucide**：`lucide-react` 0.468，ISC 授權。
- **繪製參數**：24px 格線、`strokeWidth={1.75}`、圓角線端與接點、不填色、顏色用 `currentColor`。
- **尺寸只有兩種**：按鈕內 20px，標籤、連結與表格內 16px。本站沒有需要 24px 的導覽或標題 icon。

## 品牌標記

| 項目 | 規格 |
| --- | --- |
| 檔案 | `public/brand/mark.svg`；這裡另存一份 `docs/brand/mark.svg` |
| 容器 | 64 × 64 圓角方形，圓角是邊長的 22%（14.08），實心填 `#C24D29`（橙紅，HSL 14°／65%／46%）。沒有邊框、陰影或漸層 |
| 內容 | Lucide `cloud-lightning`，白色，佔邊長 58%，`stroke-width: 2`，置中 |
| favicon | `public/favicon.svg`，與 mark.svg 相同 |
| apple-touch-icon | `public/apple-touch-icon.png`，180 × 180，由 mark.svg 轉出。直角，因為 iOS 會自己加圓角 |
| 頁首 | `BrandMark` 元件以同樣結構畫出 32px 版本 |
| 字標 | 「出門前」16px／600，字距 -0.01em；副標 12px／500；標記與字標間距 10px |
| 深色模式 | 容器色不變（`--mark` 在兩個主題都是同一色） |

## 站內 icon 對照

| 用途 | 位置 | Lucide |
| --- | --- | --- |
| 品牌標記 | 頁首左側 | `cloud-lightning`（stroke 2，例外） |
| 更新資料 | 頁首按鈕、錯誤卡片與空資料的「重新讀取」 | `refresh-cw` |
| 切換深色／淺色 | 頁首按鈕 | `moon`／`sun` |
| 載入中 | 頁首燈號、載入提示 | `loader-2` |
| 縣市選單展開 | 麵包屑的縣市分頁 | `chevron-down` |
| 外部連結 | 「到 CWA 官方頁確認」「官方詳情」、頁尾連結 | `external-link` |
| 無法確認或錯誤 | 錯誤卡片標題、待確認說明條 | `alert-triangle` |
| 資料時間說明 | 24 小時前資料的說明條、提醒框 | `clock-3` |
| 一般說明 | 觀測資料不完整的說明條 | `info` |

## 被替換掉的手繪 SVG

| 檔案 | 原本 | 現在 |
| --- | --- | --- |
| `src/App.tsx` 的 `BrandMark` | 手繪的白底方塊加橙紅雨滴路徑 | Lucide `cloud-lightning` 品牌標記 |
| `index.html` 的 favicon | 內嵌 data URI 的手繪雨滴 SVG | `favicon.svg`（品牌標記），另加 `apple-touch-icon.png` |
| `src/components/TaiwanMap.tsx` | 縣市地圖（資料圖，不是 icon） | 保留 |

## GitHub 露出

- UI 裡原本就沒有 GitHub 連結。
- 「24 小時前的資料」說明條原本寫「GitHub 排程延遲」，已改成「自動更新排程延遲」。
- `dist/` 裡沒有任何 `github.com`。不分大小寫搜「github」只剩 4 筆，都是站點本身的網址 `livejiaquan.github.io`：canonical、og:url、robots.txt 和 sitemap 各一筆。
