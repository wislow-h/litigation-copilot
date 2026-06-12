import { promises as fs } from "fs";
import path from "path";
import OpenAI, { toFile } from "openai";
import { PDFDocument } from "pdf-lib";
import { caseFilesDir } from "../store";
import type { CaseAnalysis, CaseFile } from "../types";
import { extractionSchema, analysisSchema } from "../analysis-schema";
import {
  EXTRACT_SYSTEM,
  EXTRACT_FROM_FILE_PROMPT,
  ANALYZE_SYSTEM,
  analyzeUserPrompt,
} from "../prompts";
import { parseJSON } from "./llm";
import type { ExtractionChunk, PipelineProvider, PipelineResult } from "./types";
import { finalizeAnalysis } from "./types";

const MODEL = process.env.OPENAI_MODEL || "gpt-5.5";
// Responses API의 PDF 입력은 요청당 약 100페이지 제한 → 여유를 두고 분할
const MAX_PAGES_PER_REQUEST = 95;

const IMAGE_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

// 추출 단위: 업로드된 PDF 청크(file_id) 또는 이미지(base64)
type ExtractUnit =
  | { kind: "file"; label: string; fileId: string }
  | { kind: "image"; label: string; dataUrl: string };

export const openaiProvider: PipelineProvider = {
  name: "openai",
  label: `OpenAI (Files + Responses, ${MODEL})`,
  available: () => !!process.env.OPENAI_API_KEY,

  async run(caseId, files, onProgress): Promise<PipelineResult> {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
    const notes: string[] = [];
    const t0 = Date.now();

    // ① 전처리: PDF 분할 + Files API 업로드 (OpenAI에는 전용 파싱 API가 없음)
    const units: ExtractUnit[] = [];
    for (const [i, file] of files.entries()) {
      await onProgress("parsing", `파일 준비 중 (${i + 1}/${files.length}): ${file.name}`);
      const filePath = path.join(caseFilesDir(caseId), file.storedName);
      const ext = path.extname(file.name).toLowerCase();

      if (ext === ".pdf") {
        units.push(...(await uploadPdfChunks(client, filePath, file.name)));
      } else if (IMAGE_MIME[ext]) {
        const buf = await fs.readFile(filePath);
        units.push({
          kind: "image",
          label: file.name,
          dataUrl: `data:${IMAGE_MIME[ext]};base64,${buf.toString("base64")}`,
        });
      } else {
        notes.push(`'${file.name}' 은 OpenAI 파이프라인이 지원하지 않는 형식(${ext})이라 제외했습니다. (PDF/JPG/PNG/WebP만 지원 — Upstage와의 차이점)`);
      }
    }
    if (units.length === 0) {
      throw new Error("OpenAI 파이프라인이 처리할 수 있는 파일(PDF/이미지)이 없습니다.");
    }
    const parseMs = Date.now() - t0;

    // ② 단위별 이벤트 추출 (gpt-5.5가 원본 문서를 직접 판독)
    const t1 = Date.now();
    const extracted: ExtractionChunk[] = [];
    for (const [i, unit] of units.entries()) {
      await onProgress("analyzing", `문서 판독·이벤트 추출 중 (${i + 1}/${units.length}): ${unit.label}`);
      extracted.push(await extractFromUnit(client, unit));
    }

    // ③ 종합 분석
    await onProgress("analyzing", "타임라인·옵션 종합 분석 중");
    const analysis = await responsesJSON<CaseAnalysis>(client, {
      system: ANALYZE_SYSTEM,
      content: [{ type: "input_text", text: analyzeUserPrompt(JSON.stringify(extracted, null, 1)) }],
      schemaName: "case_analysis",
      schema: analysisSchema as unknown as Record<string, unknown>,
    });
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

async function uploadPdfChunks(client: OpenAI, filePath: string, name: string): Promise<ExtractUnit[]> {
  const buf = await fs.readFile(filePath);
  const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
  const total = doc.getPageCount();

  const parts: { label: string; bytes: Uint8Array }[] = [];
  if (total <= MAX_PAGES_PER_REQUEST) {
    parts.push({ label: name, bytes: new Uint8Array(buf) });
  } else {
    for (let start = 0; start < total; start += MAX_PAGES_PER_REQUEST) {
      const end = Math.min(start + MAX_PAGES_PER_REQUEST, total);
      const sub = await PDFDocument.create();
      const pages = await sub.copyPages(doc, Array.from({ length: end - start }, (_, k) => start + k));
      pages.forEach((p) => sub.addPage(p));
      parts.push({ label: `${name} (p.${start + 1}-${end})`, bytes: await sub.save() });
    }
  }

  const units: ExtractUnit[] = [];
  for (const part of parts) {
    const uploaded = await client.files.create({
      file: await toFile(Buffer.from(part.bytes), part.label.replace(/[^\w.-]+/g, "_") + ".pdf"),
      purpose: "user_data",
    });
    units.push({ kind: "file", label: part.label, fileId: uploaded.id });
  }
  return units;
}

async function extractFromUnit(client: OpenAI, unit: ExtractUnit): Promise<ExtractionChunk> {
  const filePart =
    unit.kind === "file"
      ? { type: "input_file" as const, file_id: unit.fileId }
      : { type: "input_image" as const, image_url: unit.dataUrl, detail: "high" as const };

  return responsesJSON<ExtractionChunk>(client, {
    system: EXTRACT_SYSTEM,
    content: [
      filePart,
      { type: "input_text", text: `${EXTRACT_FROM_FILE_PROMPT}\n(출처 문서명: ${unit.label})` },
    ],
    schemaName: "extraction",
    schema: extractionSchema as unknown as Record<string, unknown>,
  });
}

async function responsesJSON<T>(
  client: OpenAI,
  opts: {
    system: string;
    content: unknown[];
    schemaName: string;
    schema: Record<string, unknown>;
  }
): Promise<T> {
  const res = await client.responses.create({
    model: MODEL,
    instructions: opts.system,
    input: [
      {
        role: "user",
        content: opts.content,
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: opts.schemaName,
        schema: opts.schema,
        strict: true,
      },
    },
  } as Parameters<typeof client.responses.create>[0]) as { output_text?: string };

  return parseJSON<T>(res.output_text ?? "");
}
