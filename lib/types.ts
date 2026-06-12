// 두 파이프라인이 공유하는 도메인 타입. 공통 스키마로 출력해야 공정한 비교가 가능하다.

export type ProviderName = "upstage" | "openai";

export type EventType =
  | "filing" // 소 제기/신청
  | "submission" // 서면 제출
  | "hearing" // 변론/심문 기일
  | "evidence" // 증거 제출/조사
  | "judgment" // 판결/결정/명령
  | "service" // 송달
  | "deadline" // 기한 (예정)
  | "other";

export interface TimelineEvent {
  date: string; // YYYY-MM-DD (일자 불명확 시 YYYY-MM-01 등 추정치 + description에 명시)
  title: string;
  description: string;
  type: EventType;
  sourceDoc: string | null; // 출처 문서명
  isDeadline: boolean; // 미래 기한 여부
}

export interface PartyInfo {
  role: string; // 원고/피고/항소인/검사 등
  name: string;
}

export interface CaseOption {
  title: string;
  description: string;
  pros: string[];
  cons: string[];
  requiredEvidence: string[];
  deadline: string | null;
  urgency: "high" | "medium" | "low";
}

export interface CaseAnalysis {
  caseInfo: {
    caseNumber: string | null;
    court: string | null;
    caseType: string;
    parties: PartyInfo[];
    userPosition: string | null; // 업로더가 어느 당사자로 추정되는지
    currentStage: string;
    plainSummary: string; // 쉬운 말 요약
  };
  timeline: TimelineEvent[];
  options: CaseOption[];
}

export interface PipelineMetrics {
  parseMs: number;
  analyzeMs: number;
  totalMs: number;
  eventCount: number;
  optionCount: number;
}

export type PipelineStatus =
  | "idle"
  | "queued"
  | "parsing"
  | "analyzing"
  | "done"
  | "error";

export interface PipelineState {
  status: PipelineStatus;
  detail?: string; // 현재 단계 상세 (예: "3/5 청크 분석 중")
  error?: string;
  notes: string[]; // 미지원 파일 스킵 등 안내
  metrics?: PipelineMetrics;
  result?: CaseAnalysis;
  startedAt?: string;
  finishedAt?: string;
}

export interface CaseFile {
  name: string;
  size: number;
  mimeType: string;
  storedName: string; // data/cases/{id}/files/ 내 파일명
}

export interface CaseMeta {
  id: string;
  title: string;
  createdAt: string;
  files: CaseFile[];
  providers: ProviderName[];
  pipelines: Partial<Record<ProviderName, PipelineState>>;
}
