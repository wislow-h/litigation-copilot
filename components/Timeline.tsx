import type { TimelineEvent, EventType } from "@/lib/types";

const TYPE_STYLE: Record<EventType, { label: string; dot: string; badge: string }> = {
  filing: { label: "소 제기", dot: "bg-indigo-500", badge: "bg-indigo-50 text-indigo-700" },
  submission: { label: "서면 제출", dot: "bg-sky-500", badge: "bg-sky-50 text-sky-700" },
  hearing: { label: "기일", dot: "bg-violet-500", badge: "bg-violet-50 text-violet-700" },
  evidence: { label: "증거", dot: "bg-teal-500", badge: "bg-teal-50 text-teal-700" },
  judgment: { label: "판결·결정", dot: "bg-rose-500", badge: "bg-rose-50 text-rose-700" },
  service: { label: "송달", dot: "bg-slate-400", badge: "bg-slate-100 text-slate-600" },
  deadline: { label: "기한", dot: "bg-red-500", badge: "bg-red-50 text-red-700" },
  other: { label: "기타", dot: "bg-slate-300", badge: "bg-slate-100 text-slate-500" },
};

function dday(date: string): string {
  const diff = Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000);
  if (diff < 0) return "지남";
  if (diff === 0) return "D-Day";
  return `D-${diff}`;
}

export default function Timeline({ events }: { events: TimelineEvent[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const todayIdx = events.findIndex((e) => e.date > today);

  const items: (TimelineEvent | "today")[] = [...events];
  items.splice(todayIdx === -1 ? events.length : todayIdx, 0, "today");

  return (
    <ol className="relative ml-3 border-l-2 border-slate-200">
      {items.map((item, i) => {
        if (item === "today") {
          return (
            <li key="today" className="relative mb-5 pl-6">
              <span className="absolute -left-[9px] top-1 h-4 w-4 rounded-full border-2 border-white bg-amber-400 ring-2 ring-amber-300" />
              <p className="text-sm font-bold text-amber-600">오늘 ({today})</p>
            </li>
          );
        }
        const style = TYPE_STYLE[item.type] ?? TYPE_STYLE.other;
        const isFutureDeadline = item.isDeadline && item.date >= today;
        return (
          <li key={i} className="relative mb-5 pl-6">
            <span
              className={`absolute -left-[7px] top-1.5 h-3 w-3 rounded-full border-2 border-white ${style.dot} ${
                isFutureDeadline ? "ring-2 ring-red-300" : ""
              }`}
            />
            <div
              className={`rounded-lg border p-3 ${
                isFutureDeadline ? "border-red-200 bg-red-50/50" : "border-slate-100 bg-white"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold tabular-nums">{item.date}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${style.badge}`}>
                  {style.label}
                </span>
                {isFutureDeadline && (
                  <span className="rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white">
                    {dday(item.date)}
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm font-medium">{item.title}</p>
              <p className="mt-0.5 text-sm text-slate-500">{item.description}</p>
              {item.sourceDoc && (
                <p className="mt-1 text-[11px] text-slate-400">출처: {item.sourceDoc}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
