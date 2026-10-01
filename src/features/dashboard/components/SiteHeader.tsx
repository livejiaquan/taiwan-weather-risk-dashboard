

export function SiteHeader() {
  return (
    <header className="flex items-center justify-between gap-4 border-b border-line/80 pb-4 sm:pb-5">
      <a href="#county-focus" className="inline-flex items-center gap-3 rounded-xl" aria-label="台灣生活資料誌：天氣風險與警特報首頁">
        <span className="grid h-10 w-10 place-items-center rounded-[14px] bg-cobalt-700 text-sm font-black tracking-tight text-white shadow-card" aria-hidden="true">台</span>
        <span>
          <span className="block text-sm font-bold tracking-[0.12em] text-teal-800">台灣生活資料誌</span>
          <span className="block text-sm font-black tracking-tight text-ink sm:text-base">天氣風險與警特報</span>
        </span>
      </a>
      <span className="hidden rounded-full border border-sky-100 bg-white/70 px-3 py-1.5 text-sm font-semibold text-slate-600 sm:block">資料優先 · CWA 公開資料</span>
    </header>
  );
}
