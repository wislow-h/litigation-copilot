import type { CaseAnalysis, CaseFile, PipelineMetrics, ProviderName } from "../types";

export interface PipelineProgress {
  (status: "parsing" | "analyzing", detail?: string): Promise<unknown>;
}

export interface PipelineResult {
  analysis: CaseAnalysis;
  metrics: PipelineMetrics;
  notes: string[];
}

export interface PipelineProvider {
  name: ProviderName;
  label: string;
  available(): boolean;
  run(caseId: string, files: CaseFile[], onProgress: PipelineProgress): Promise<PipelineResult>;
}

// 추출 단계(1단계)의 청크별 출력
export interface ExtractionChunk {
  events: CaseAnalysis["timeline"];
  caseInfoNotes: string;
}

export function finalizeAnalysis(analysis: CaseAnalysis): CaseAnalysis {
  const today = new Date().toISOString().slice(0, 10);
  const timeline = [...analysis.timeline]
    .map((e) => ({ ...e, isDeadline: e.isDeadline && e.date >= today }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return { ...analysis, timeline };
}
