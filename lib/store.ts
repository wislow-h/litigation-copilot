import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import type { CaseMeta, PipelineState, ProviderName } from "./types";

const DATA_DIR = path.join(process.cwd(), "data", "cases");

export function caseDir(id: string) {
  return path.join(DATA_DIR, id);
}

export function caseFilesDir(id: string) {
  return path.join(caseDir(id), "files");
}

function metaPath(id: string) {
  return path.join(caseDir(id), "meta.json");
}

export async function createCase(title: string, providers: ProviderName[]): Promise<CaseMeta> {
  const id = crypto.randomBytes(8).toString("hex");
  await fs.mkdir(caseFilesDir(id), { recursive: true });
  const meta: CaseMeta = {
    id,
    title: title || `사건 ${new Date().toLocaleDateString("ko-KR")}`,
    createdAt: new Date().toISOString(),
    files: [],
    providers,
    pipelines: Object.fromEntries(
      providers.map((p) => [p, { status: "queued", notes: [] } satisfies PipelineState])
    ),
  };
  await fs.writeFile(metaPath(id), JSON.stringify(meta, null, 2));
  return meta;
}

export async function getCase(id: string): Promise<CaseMeta | null> {
  // 경로 조작 방지
  if (!/^[a-f0-9]{16}$/.test(id)) return null;
  try {
    return JSON.parse(await fs.readFile(metaPath(id), "utf-8"));
  } catch {
    return null;
  }
}

export async function listCases(): Promise<CaseMeta[]> {
  try {
    const ids = await fs.readdir(DATA_DIR);
    const metas = await Promise.all(ids.map((id) => getCase(id)));
    return metas
      .filter((m): m is CaseMeta => m !== null)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

export async function deleteCase(id: string) {
  if (!/^[a-f0-9]{16}$/.test(id)) return;
  await fs.rm(caseDir(id), { recursive: true, force: true });
}

// 두 파이프라인이 백그라운드에서 동시에 meta.json을 갱신하므로
// 사건별 직렬화 큐로 쓰기 경합을 막는다 (단일 프로세스 전제 — MVP).
const writeQueues = new Map<string, Promise<unknown>>();

export async function updateCase(
  id: string,
  fn: (meta: CaseMeta) => CaseMeta | void
): Promise<CaseMeta> {
  const prev = writeQueues.get(id) ?? Promise.resolve();
  const next = prev
    .catch(() => {})
    .then(async () => {
      const meta = await getCase(id);
      if (!meta) throw new Error(`case not found: ${id}`);
      const updated = fn(meta) ?? meta;
      await fs.writeFile(metaPath(id), JSON.stringify(updated, null, 2));
      return updated;
    });
  writeQueues.set(id, next);
  return next;
}

export async function updatePipeline(
  id: string,
  provider: ProviderName,
  patch: Partial<PipelineState>
) {
  return updateCase(id, (meta) => {
    const cur = meta.pipelines[provider] ?? { status: "idle", notes: [] };
    meta.pipelines[provider] = { ...cur, ...patch };
  });
}
