import { promises as fs } from "fs";
import path from "path";
import OpenAI from "openai";
import { caseFilesDir } from "../store";
import type { CaseAnalysis, CaseFile } from "../types";
import { extractionSchema, analysisSchema } from "../analysis-schema";
import { EXTRACT_SYSTEM, extractUserPrompt, ANALYZE_SYSTEM, analyzeUserPrompt } from "../prompts";
import { chatJSON } from "./llm";
import type { ExtractionChunk, PipelineProvider, PipelineResult } from "./types";
import { finalizeAnalysis } from "./types";

const BASE_URL = "https://api.upstage.ai/v1";
const LLM_MODEL = process.env.UPSTAGE_LLM_MODEL || "solar-pro3";
// Solar Pro 3 컨텍스트 128K 토큰. 한국어는 글자당 토큰 소모가 크므로 보수적으로 잡는다.
const CHUNK_CHARS = 60_000;
const PARSE_POLL_INTERVAL_MS = 3_000;
const PARSE_TIMEOUT_MS = 10 * 60 * 1000;

// 이미지류는 동기 파싱(빠름), PDF/문서류는 비동기(최대 1,000페이지)로 보낸다.
const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".heic"]);

export const upstageProvider: PipelineProvider = {
  name: "upstage",
  label: "Upstage (Document Parse + Solar Pro 3)",
  available: () => !!process.env.UPSTAGE_API_KEY,

  async run(caseId, files, onProgress): Promise<PipelineResult> {
    const apiKey = process.env.UPSTAGE_API_KEY!;
    const notes: string[] = [];
    const t0 = Date.now();

    // ① 문서 파싱 (Document Parse)
    const parsedDocs: { label: string; markdown: string }[] = [];
    for (const [i, file] of files.entries()) {
      await onProgress("parsing", `문서 파싱 중 (${i + 1}/${files.length}): ${file.name}`);
      const filePath = path.join(caseFilesDir(caseId), file.storedName);
      const markdown = await parseDocument(apiKey, filePath, file.name);
      parsedDocs.push({ label: file.name, markdown });
    }
    const parseMs = Date.now() - t0;

    // ② 청크별 이벤트 추출 (Solar Pro 3, map)
    const t1 = Date.now();
    // 대용량 기록은 Solar 호출이 여러 번·장시간 일어나므로 재시도·타임아웃을 넉넉히.
    // (연결 끊김 한 번에 전체 파이프라인이 죽지 않도록)
    const llm = new OpenAI({ apiKey, baseURL: BASE_URL, maxRetries: 5, timeout: 15 * 60 * 1000 });
    const chunks = parsedDocs.flatMap((doc) =>
      splitText(doc.markdown, CHUNK_CHARS).map((text, idx, arr) => ({
        label: arr.length > 1 ? `${doc.label} (${idx + 1}/${arr.length})` : doc.label,
        text,
      }))
    );

    const extracted: ExtractionChunk[] = [];
    let failedChunks = 0;
    for (const [i, chunk] of chunks.entries()) {
      await onProgress("analyzing", `이벤트 추출 중 (${i + 1}/${chunks.length} 청크)`);
      try {
        extracted.push(
          await chatJSON<ExtractionChunk>(
            llm, LLM_MODEL,
            EXTRACT_SYSTEM,
            extractUserPrompt(chunk.label, chunk.text),
            "extraction",
            extractionSchema as unknown as Record<string, unknown>
          )
        );
      } catch (e) {
        // 한 청크가 끝내 실패해도 나머지로 분석을 이어간다 (대용량 견고성)
        failedChunks++;
        console.error(`[upstage] 청크 ${i + 1}/${chunks.length} 추출 실패`, e);
      }
    }
    if (failedChunks > 0) {
      notes.push(`${chunks.length}개 구간 중 ${failedChunks}개는 추출에 실패해 결과에서 제외했습니다. (대용량 처리 중 일부 요청 실패)`);
    }
    if (extracted.length === 0) {
      throw new Error("모든 구간의 이벤트 추출에 실패했습니다. 잠시 후 '다시 분석'을 눌러 재시도해 주세요.");
    }

    // ③ 종합 분석 (reduce)
    await onProgress("analyzing", "타임라인·옵션 종합 분석 중");
    const analysis = await chatJSON<CaseAnalysis>(
      llm, LLM_MODEL,
      ANALYZE_SYSTEM,
      analyzeUserPrompt(JSON.stringify(extracted, null, 1)),
      "case_analysis",
      analysisSchema as unknown as Record<string, unknown>
    );
    const final = finalizeAnalysis(analysis);
    const analyzeMs = Date.now() - t1;

    return {
      analysis: final,
      notes,
      metrics: {
        parseMs,
        analyzeMs,
        totalMs: Date.now() - t0,
        eventCount: final.timeline.length,
        optionCount: final.options.length,
      },
    };
  },
};

async function parseDocument(apiKey: string, filePath: string, fileName: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  const blob = new Blob([new Uint8Array(buffer)]);
  const useSync = IMAGE_EXTS.has(path.extname(fileName).toLowerCase());

  const form = new FormData();
  form.append("document", blob, fileName);
  form.append("model", "document-parse");
  form.append("ocr", "auto");
  form.append("output_formats", JSON.stringify(["markdown"]));

  const endpoint = useSync
    ? `${BASE_URL}/document-digitization`
    : `${BASE_URL}/document-digitization/async`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    throw new Error(`Document Parse 실패 (${fileName}): ${res.status} ${(await res.text()).slice(0, 300)}`);
  }
  const json = await res.json();

  if (useSync) return json.content?.markdown ?? json.content?.text ?? "";
  return pollAsyncParse(apiKey, json.request_id, fileName);
}

async function pollAsyncParse(apiKey: string, requestId: string, fileName: string): Promise<string> {
  const headers = { Authorization: `Bearer ${apiKey}` };
  const deadline = Date.now() + PARSE_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, PARSE_POLL_INTERVAL_MS));
    const res = await fetch(`${BASE_URL}/document-digitization/requests/${requestId}`, { headers });
    if (!res.ok) throw new Error(`파싱 상태 조회 실패: ${res.status}`);
    const status = await res.json();

    if (status.status === "failed") {
      throw new Error(`Document Parse 실패 (${fileName}): ${status.failure_message ?? "원인 불명"}`);
    }
    if (status.status === "completed") {
      const parts: string[] = [];
      for (const batch of status.batches ?? []) {
        const dl = await fetch(batch.download_url, { headers });
        if (!dl.ok) throw new Error(`파싱 결과 다운로드 실패: ${dl.status}`);
        const data = await dl.json();
        parts.push(data.content?.markdown ?? data.content?.text ?? "");
      }
      return parts.join("\n\n");
    }
  }
  throw new Error(`Document Parse 시간 초과 (${fileName})`);
}

function splitText(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + maxChars, text.length);
    if (end < text.length) {
      // 문단 경계에서 자르기 시도
      const nl = text.lastIndexOf("\n\n", end);
      if (nl > start + maxChars * 0.5) end = nl;
    }
    chunks.push(text.slice(start, end));
    start = end;
  }
  return chunks;
}
