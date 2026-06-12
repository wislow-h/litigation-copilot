import { getCase, updatePipeline } from "./store";
import type { ProviderName } from "./types";
import type { PipelineProvider } from "./providers/types";
import { upstageProvider } from "./providers/upstage";
import { openaiProvider } from "./providers/openai";

export const PROVIDERS: Record<ProviderName, PipelineProvider> = {
  upstage: upstageProvider,
  openai: openaiProvider,
};

export function availableProviders(): { name: ProviderName; label: string; available: boolean }[] {
  return (Object.values(PROVIDERS) as PipelineProvider[]).map((p) => ({
    name: p.name,
    label: p.label,
    available: p.available(),
  }));
}

/**
 * 사건 분석을 백그라운드로 시작한다 (await 하지 않음).
 * 두 파이프라인은 병렬 실행되며 한쪽이 실패해도 다른 쪽은 계속 진행된다.
 */
export function startAnalysis(caseId: string, providers: ProviderName[]) {
  for (const name of providers) {
    void runProvider(caseId, name).catch((e) => {
      console.error(`[pipeline:${name}] 예기치 못한 오류`, e);
    });
  }
}

export async function runProvider(caseId: string, name: ProviderName) {
  const provider = PROVIDERS[name];
  const meta = await getCase(caseId);
  if (!meta) return;

  if (!provider.available()) {
    await updatePipeline(caseId, name, {
      status: "error",
      error: `${name.toUpperCase()}_API_KEY 가 설정되지 않았습니다 (.env 파일 확인)`,
    });
    return;
  }

  await updatePipeline(caseId, name, {
    status: "parsing",
    detail: "시작 중",
    error: undefined,
    result: undefined,
    metrics: undefined,
    notes: [],
    startedAt: new Date().toISOString(),
    finishedAt: undefined,
  });

  try {
    const result = await provider.run(caseId, meta.files, (status, detail) =>
      updatePipeline(caseId, name, { status, detail })
    );
    await updatePipeline(caseId, name, {
      status: "done",
      detail: undefined,
      result: result.analysis,
      metrics: result.metrics,
      notes: result.notes,
      finishedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error(`[pipeline:${name}]`, e);
    await updatePipeline(caseId, name, {
      status: "error",
      detail: undefined,
      error: e instanceof Error ? e.message : String(e),
      finishedAt: new Date().toISOString(),
    });
  }
}
