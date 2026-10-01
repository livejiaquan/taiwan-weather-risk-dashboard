import type { ReactNode } from "react";
import type { Activity } from "lucide-react";
import { formatDateTime } from "../presentation";

export function Card({ title, icon: Icon, children }: { title: string; icon: typeof Activity; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line/80 bg-white/90 p-5 shadow-card">
      <div className="mb-4 flex items-center gap-2">
        <div className="rounded-xl bg-cobalt-700 p-2 text-white">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </div>
        <h2 className="text-xl font-black sm:text-2xl text-slate-950">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export function WarningNotice({ tone, children }: { tone: "red" | "amber" | "teal"; children: ReactNode }) {
  const toneClass = {
    red: "border-red-200 bg-red-50 text-red-950",
    amber: "border-amber-200 bg-amber-50 text-amber-950",
    teal: "border-teal-200 bg-teal-50 text-teal-950",
  }[tone];
  return <div className={`rounded-xl border px-4 py-3 text-base leading-7 ${toneClass}`}>{children}</div>;
}

export function TimeStamp({ value }: { value?: string }) {
  if (!value || !Number.isFinite(Date.parse(value))) return <span>未提供</span>;
  return <time dateTime={value}>{formatDateTime(value)}</time>;
}

export function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/75 px-2 py-2">
      <div className="font-semibold text-slate-600">{label}</div>
      <div className="mt-1 font-black text-slate-900">{value}</div>
    </div>
  );
}

export function SignalLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[minmax(4.5rem,0.4fr)_minmax(0,1fr)] items-start gap-3 border-b border-slate-200 py-3 last:border-0">
      <span className="text-sm font-semibold text-slate-600">{label}</span>
      <span className="text-right text-base font-bold leading-7 text-slate-900">{value}</span>
    </div>
  );
}
