import { getCase, updatePipeline } from "./store";
import type { CaseMeta, PipelineStatus, ProviderName } from "./types";
import type { PipelineProvider } from "./providers/types";
import { upstageProvider } from "./providers/upstage";
import { openaiProvider } from "./providers/openai";

export const PROVIDERS: Record<ProviderName, PipelineProvider> = {
  upstage: upstageProvider,
  openai: openaiProvider,
};

// 현재 프로세스에서 실제로 돌고 있는 작업들. 키: `${caseId}:${provider}`.
// 서버가 재시작되면 이 Set은 비워지므로, meta에는 진행중이라 적혀 있지만
// 여기에 없는 파이프라인 = 재시작으로 끊긴 고아 작업으로 판단할 수 있다.
//
// globalThis에 보관: Next.js dev는 라우트별로 모듈 인스턴스를 분리할 수 있어
// 모듈 지역 변수로 두면 POST(실행)와 GET(조회)이 서로 다른 Set을 보게 된다.
const g = globalThis as unknown as { __litLiveRuns?: Set<string> };
const liveRuns = (g.__litLiveRuns ??= new Set<string>());
const runKey = (caseId: string, name: ProviderName) => `${caseId}:${name}`;

const IN_PROGRESS: PipelineStatus[] = ["queued", "parsing", "analyzing"];

/**
 * 서버 재시작 등으로 끊긴 '진행중' 파이프라인을 '오류'로 정리한다.
 * (실제 실행중인 작업은 liveRuns에 있으므로 건드리지 않는다.)
 * 조회 시점에 호출 → 멈춰 보이던 작업에 '다시 분석' 버튼이 뜨게 된다.
 */
export async function reconcileOrphans(meta: CaseMeta): Promise<CaseMeta> {
  const orphans = (Object.keys(meta.pipelines) as ProviderName[]).filter((name) => {
    const st = meta.pipelines[name]?.status;
    return st && IN_PROGRESS.includes(st) && !liveRuns.has(runKey(meta.id, name));
  });
  if (orphans.length === 0) return meta;

  let updated = meta;
  for (const name of orphans) {
    updated = await updatePipeline(meta.id, name, {
      status: "error",
      detail: undefined,
      error: "서버가 재시작되어 분석이 중단되었습니다. '다시 분석'을 눌러 재시도해 주세요.",
      finishedAt: new Date().toISOString(),
    });
  }
  return updated;
}

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
  // 첫 await 이전에 등록해야 조회 시점의 오인 정리(reconcile)와 경합하지 않는다
  liveRuns.add(runKey(caseId, name));
  try {
    await runProviderInner(caseId, name, provider);
  } finally {
    liveRuns.delete(runKey(caseId, name));
  }
}

async function runProviderInner(caseId: string, name: ProviderName, provider: PipelineProvider) {
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
