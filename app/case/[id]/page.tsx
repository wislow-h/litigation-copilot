"use client";

import { use, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { CaseMeta, ProviderName } from "@/lib/types";
import PipelinePanel from "@/components/PipelinePanel";

const POLL_MS = 2500;

export default function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [meta, setMeta] = useState<CaseMeta | null>(null);
  const [notFound, setNotFound] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/cases/${id}`, { cache: "no-store" });
    if (res.status === 404) {
      setNotFound(true);
      return null;
    }
    const data: CaseMeta = await res.json();
    setMeta(data);
    return data;
  }, [id]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;

    async function loop() {
      const data = await refresh();
      if (stopped || !data) return;
      const running = Object.values(data.pipelines).some(
        (p) => p.status === "queued" || p.status === "parsing" || p.status === "analyzing"
      );
      if (running) timer = setTimeout(loop, POLL_MS);
    }
    loop();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [refresh]);

  async function retry(provider: ProviderName) {
    await fetch(`/api/cases/${id}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider }),
    });
    // 폴링 재시작
    setTimeout(refresh, 300);
    router.refresh();
    window.location.reload();
  }

  async function remove() {
    if (!confirm("이 사건과 업로드된 모든 파일을 삭제할까요?")) return;
    await fetch(`/api/cases/${id}`, { method: "DELETE" });
    router.push("/");
  }

  if (notFound) {
    return (
      <div className="py-20 text-center text-slate-500">
        사건을 찾을 수 없습니다. <a href="/" className="text-indigo-600 underline">홈으로</a>
      </div>
    );
  }
  if (!meta) {
    return <div className="py-20 text-center text-slate-400">불러오는 중…</div>;
  }

  const providers = Object.keys(meta.pipelines) as ProviderName[];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <a href="/" className="text-sm text-slate-400 hover:text-indigo-600">← 홈</a>
          <h1 className="text-2xl font-bold">{meta.title}</h1>
          <p className="text-xs text-slate-400">
            {new Date(meta.createdAt).toLocaleString("ko-KR")} ·{" "}
            {meta.files.map((f) => f.name).join(", ")}
          </p>
        </div>
        <button
          onClick={remove}
          className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
        >
          사건 삭제
        </button>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        ⚠️ 본 분석은 AI가 생성한 <strong>참고 자료</strong>이며 법률 자문이 아닙니다. 항소기한 등
        중요한 기한과 결정은 반드시 법원 문서 원본과 변호사 상담으로 확인하세요.
      </div>

      <div className={`grid gap-6 ${providers.length > 1 ? "lg:grid-cols-2" : "max-w-3xl"}`}>
        {providers.map((p) => (
          <PipelinePanel
            key={p}
            provider={p}
            state={meta.pipelines[p]!}
            onRetry={() => retry(p)}
          />
        ))}
      </div>
    </div>
  );
}
