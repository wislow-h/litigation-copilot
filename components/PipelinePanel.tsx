"use client";

import type { PipelineState, ProviderName } from "@/lib/types";
import Timeline from "./Timeline";
import OptionCard from "./OptionCard";

const PROVIDER_META: Record<ProviderName, { title: string; sub: string; accent: string }> = {
  upstage: {
    title: "Upstage",
    sub: "Document Parse → Solar Pro 3",
    accent: "border-t-purple-500",
  },
  openai: {
    title: "OpenAI",
    sub: "Files API → Responses (GPT-5.5)",
    accent: "border-t-emerald-500",
  },
};

const STEPS = [
  { key: "parsing", label: "문서 파싱" },
  { key: "analyzing", label: "추출·분석" },
  { key: "done", label: "완료" },
] as const;

function stepState(status: PipelineState["status"], step: string): "done" | "active" | "todo" {
  const order = ["queued", "parsing", "analyzing", "done"];
  const cur = order.indexOf(status);
  const idx = order.indexOf(step);
  if (cur > idx) return "done";
  if (cur === idx) return "active";
  return "todo";
}

function fmtMs(ms: number) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}초` : `${ms}ms`;
}

export default function PipelinePanel({
  provider,
  state,
  onRetry,
}: {
  provider: ProviderName;
  state: PipelineState;
  onRetry: () => void;
}) {
  const meta = PROVIDER_META[provider];
  const running = state.status === "parsing" || state.status === "analyzing" || state.status === "queued";

  return (
    <div className={`rounded-2xl border border-slate-200 border-t-4 bg-white shadow-sm ${meta.accent}`}>
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="text-lg font-bold">{meta.title}</h2>
          <p className="text-xs text-slate-400">{meta.sub}</p>
        </div>
        {state.status === "done" && state.metrics && (
          <div className="text-right text-xs text-slate-500">
            <p>
              파싱 {fmtMs(state.metrics.parseMs)} · 분석 {fmtMs(state.metrics.analyzeMs)} ·{" "}
              <span className="font-semibold text-slate-700">총 {fmtMs(state.metrics.totalMs)}</span>
            </p>
            <p>
              이벤트 {state.metrics.eventCount}개 · 옵션 {state.metrics.optionCount}개
            </p>
          </div>
        )}
        {(state.status === "error" || state.status === "done") && (
          <button
            onClick={onRetry}
            className="ml-3 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            다시 분석
          </button>
        )}
      </div>

      <div className="p-5">
        {/* 단계 표시 */}
        {running && (
          <div className="mb-4">
            <div className="flex items-center gap-2">
              {STEPS.map((s, i) => {
                const st = stepState(state.status, s.key);
                return (
                  <div key={s.key} className="flex items-center gap-2">
                    {i > 0 && <div className="h-px w-6 bg-slate-200" />}
                    <span
                      className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                        st === "active"
                          ? "bg-indigo-600 text-white"
                          : st === "done"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-slate-100 text-slate-400"
                      }`}
                    >
                      {st === "active" && (
                        <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
                      )}
                      {st === "done" ? "✓ " : ""}
                      {s.label}
                    </span>
                  </div>
                );
              })}
            </div>
            {state.detail && <p className="mt-2 text-xs text-slate-500">{state.detail}</p>}
          </div>
        )}

        {state.status === "error" && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <p className="font-semibold">분석 실패</p>
            <p className="mt-1 break-all text-xs">{state.error}</p>
          </div>
        )}

        {state.notes.length > 0 && (
          <div className="mb-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
            {state.notes.map((n, i) => (
              <p key={i}>ℹ️ {n}</p>
            ))}
          </div>
        )}

        {state.status === "done" && state.result && (
          <div className="space-y-6">
            {/* 사건 개요 */}
            <section className="rounded-xl bg-slate-50 p-4">
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                {state.result.caseInfo.caseNumber && <span>사건번호 {state.result.caseInfo.caseNumber}</span>}
                {state.result.caseInfo.court && <span>{state.result.caseInfo.court}</span>}
                <span>{state.result.caseInfo.caseType}</span>
              </div>
              <p className="mt-1 text-sm font-semibold text-indigo-700">
                현재 단계: {state.result.caseInfo.currentStage}
              </p>
              {state.result.caseInfo.parties.length > 0 && (
                <p className="mt-1 text-xs text-slate-500">
                  당사자: {state.result.caseInfo.parties.map((p) => `${p.role} ${p.name}`).join(" / ")}
                </p>
              )}
              {state.result.caseInfo.userPosition && (
                <p className="mt-1 text-xs text-slate-500">내 위치(추정): {state.result.caseInfo.userPosition}</p>
              )}
              <p className="mt-2 text-sm leading-relaxed text-slate-700">
                {state.result.caseInfo.plainSummary}
              </p>
            </section>

            {/* 타임라인 */}
            <section>
              <h3 className="mb-3 font-semibold">📅 사건 타임라인</h3>
              <Timeline events={state.result.timeline} />
            </section>

            {/* 옵션 */}
            <section>
              <h3 className="mb-3 font-semibold">🧭 지금 선택할 수 있는 것들</h3>
              <div className="space-y-3">
                {state.result.options.map((opt, i) => (
                  <OptionCard key={i} option={opt} index={i} />
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
