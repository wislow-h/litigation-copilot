import { NextRequest, NextResponse } from "next/server";
import { createWriteStream } from "fs";
import { promises as fs } from "fs";
import path from "path";
import { Readable } from "stream";
import Busboy from "busboy";
import { createCase, caseFilesDir, updateCase, listCases, deleteCase } from "@/lib/store";
import { startAnalysis } from "@/lib/pipeline";
import type { CaseFile, ProviderName } from "@/lib/types";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB
const ALLOWED_EXTS = new Set([
  ".pdf", ".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".heic", ".webp",
  ".docx", ".pptx", ".xlsx", ".hwp", ".hwpx",
]);

export async function GET() {
  return NextResponse.json(await listCases());
}

// 대용량 업로드: 요청 본문을 busboy로 스트리밍하여 디스크에 직접 기록 (메모리 적재 없음)
export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data") || !req.body) {
    return NextResponse.json({ error: "multipart/form-data 요청이 필요합니다" }, { status: 400 });
  }

  // 파일 스트림보다 필드가 먼저 도착하도록 클라이언트에서 필드를 앞에 배치한다.
  let title = "";
  let providers: ProviderName[] = [];
  const files: CaseFile[] = [];
  let caseId: string | null = null;
  // 여러 파일이 동시에 스트리밍될 때 사건이 중복 생성되지 않도록 단일 프로미스로 보장
  let casePromise: Promise<string> | null = null;
  let fileIndex = 0;
  const ensureCase = () =>
    (casePromise ??= createCase(title, providers.length ? providers : ["upstage", "openai"]).then(
      (m) => (caseId = m.id)
    ));

  try {
    await new Promise<void>((resolve, reject) => {
      const bb = Busboy({
        headers: { "content-type": contentType },
        limits: { fileSize: MAX_FILE_SIZE, files: 20 },
      });
      const writes: Promise<void>[] = [];

      bb.on("field", (name, value) => {
        if (name === "title") title = value;
        if (name === "providers") {
          providers = value
            .split(",")
            .filter((p): p is ProviderName => p === "upstage" || p === "openai");
        }
      });

      bb.on("file", (_name, stream, info) => {
        const original = Buffer.from(info.filename, "latin1").toString("utf8");
        const ext = path.extname(original).toLowerCase();
        if (!ALLOWED_EXTS.has(ext)) {
          stream.resume(); // 미지원 형식은 버린다
          return;
        }
        const idx = fileIndex++;
        writes.push(
          (async () => {
            const id = await ensureCase();
            const storedName = `${idx}_${original.replace(/[/\\]/g, "_")}`;
            const dest = path.join(caseFilesDir(id), storedName);
            await new Promise<void>((res, rej) => {
              const ws = createWriteStream(dest);
              stream.on("limit", () => rej(new Error(`파일이 200MB를 초과합니다: ${original}`)));
              stream.on("error", rej);
              ws.on("error", rej);
              ws.on("finish", res);
              stream.pipe(ws);
            });
            const stat = await fs.stat(dest);
            files.push({ name: original, size: stat.size, mimeType: info.mimeType, storedName });
          })()
        );
      });

      bb.on("error", reject);
      bb.on("finish", () => {
        Promise.all(writes).then(() => resolve(), reject);
      });

      Readable.fromWeb(req.body as never).pipe(bb);
    });
  } catch (e) {
    if (caseId) await deleteCase(caseId);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "업로드 실패" },
      { status: 400 }
    );
  }

  if (!caseId || files.length === 0) {
    if (caseId) await deleteCase(caseId);
    return NextResponse.json({ error: "업로드 가능한 파일이 없습니다 (PDF/이미지/DOCX/HWP)" }, { status: 400 });
  }

  const meta = await updateCase(caseId, (m) => {
    m.files = files;
    if (!m.title) m.title = files[0].name;
  });

  startAnalysis(meta.id, meta.providers);
  return NextResponse.json(meta, { status: 201 });
}
