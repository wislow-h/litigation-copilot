import type { CaseOption } from "@/lib/types";

const URGENCY: Record<CaseOption["urgency"], { label: string; cls: string }> = {
  high: { label: "긴급", cls: "bg-red-600 text-white" },
  medium: { label: "보통", cls: "bg-amber-100 text-amber-800" },
  low: { label: "여유", cls: "bg-slate-100 text-slate-600" },
};

export default function OptionCard({ option, index }: { option: CaseOption; index: number }) {
  const u = URGENCY[option.urgency] ?? URGENCY.medium;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-semibold">
          <span className="mr-1.5 text-indigo-500">옵션 {index + 1}.</span>
          {option.title}
        </h4>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${u.cls}`}>
          {u.label}
        </span>
      </div>
      <p className="mt-1.5 text-sm text-slate-600">{option.description}</p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold text-emerald-700">👍 장점</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-slate-600">
            {option.pros.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold text-rose-700">👎 단점·위험</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-slate-600">
            {option.cons.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      </div>

      {option.requiredEvidence.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-slate-500">필요한 증거·서류</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {option.requiredEvidence.map((ev, i) => (
              <span key={i} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                {ev}
              </span>
            ))}
          </div>
        </div>
      )}

      {option.deadline && (
        <p className="mt-3 text-xs font-semibold text-red-600">⏰ 기한: {option.deadline}</p>
      )}
    </div>
  );
}
