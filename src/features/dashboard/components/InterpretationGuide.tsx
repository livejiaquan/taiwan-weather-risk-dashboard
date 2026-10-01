import { Activity, AlertTriangle, Database } from "lucide-react";

export function InterpretationGuide() {
  const items = [
    {
      title: "官方警特報",
      detail: "判斷目的地是否有警示的主要依據；保留官方有效時間與細部影響範圍。",
      icon: AlertTriangle,
    },
    {
      title: "觀測資料",
      detail: "雨量、風速與溫度只提供脈絡，不等於官方安全判定，也不合成跨災種分數。",
      icon: Activity,
    },
    {
      title: "近期紀錄",
      detail: "地震報告與區域熱帶氣旋另列參考，不代表現在仍有地震或臺灣颱風警報。",
      icon: Database,
    },
  ];

  return (
    <section className="rounded-2xl border border-line/80 bg-white/90 p-5 shadow-card">
      <div className="mb-4">
        <h2 className="text-xl font-black text-slate-950">這頁怎麼判讀</h2>
        <p className="mt-1 text-base leading-7 text-slate-600">官方發布、本站整理與背景紀錄分開呈現，避免把不同語義合成看似精準的「安全分數」。</p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {items.map((item) => (
          <div key={item.title} className="rounded-2xl border border-line/70 bg-[#F6F7F2] p-4">
            <item.icon className="h-5 w-5 text-teal-700" aria-hidden="true" />
            <h3 className="mt-3 font-black text-slate-950">{item.title}</h3>
            <p className="mt-2 text-base leading-7 text-slate-600">{item.detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
