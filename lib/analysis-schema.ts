// Structured Outputs(strict json_schema)용 JSON 스키마.
// strict 모드 제약: 모든 object는 additionalProperties:false + 전 필드 required.

const timelineEventSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    date: { type: "string", description: "YYYY-MM-DD. 일자가 불명확하면 추정치를 쓰고 description에 명시" },
    title: { type: "string" },
    description: { type: "string", description: "일반인이 이해할 수 있는 쉬운 설명" },
    type: {
      type: "string",
      enum: ["filing", "submission", "hearing", "evidence", "judgment", "service", "deadline", "other"],
    },
    sourceDoc: { type: ["string", "null"], description: "이 이벤트의 근거가 된 문서명" },
    isDeadline: { type: "boolean", description: "아직 도래하지 않은 기한이면 true" },
  },
  required: ["date", "title", "description", "type", "sourceDoc", "isDeadline"],
} as const;

// 1단계(청크별 추출) 스키마
export const extractionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    events: { type: "array", items: timelineEventSchema },
    caseInfoNotes: {
      type: "string",
      description: "이 부분에서 파악된 사건번호/법원/당사자/사건유형/진행단계 등 메모",
    },
  },
  required: ["events", "caseInfoNotes"],
} as const;

// 2단계(종합 분석) 스키마 = CaseAnalysis
export const analysisSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    caseInfo: {
      type: "object",
      additionalProperties: false,
      properties: {
        caseNumber: { type: ["string", "null"] },
        court: { type: ["string", "null"] },
        caseType: { type: "string", description: "예: 민사-대여금, 형사-사기 등" },
        parties: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              role: { type: "string" },
              name: { type: "string" },
            },
            required: ["role", "name"],
          },
        },
        userPosition: { type: ["string", "null"], description: "기록 업로더가 어느 당사자로 추정되는지와 근거" },
        currentStage: { type: "string", description: "예: 1심 변론 진행 중, 1심 패소 후 항소기간 중" },
        plainSummary: { type: "string", description: "법률 지식이 없는 사람을 위한 현재 상황 요약 (3~5문장)" },
      },
      required: ["caseNumber", "court", "caseType", "parties", "userPosition", "currentStage", "plainSummary"],
    },
    timeline: { type: "array", items: timelineEventSchema },
    options: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          description: { type: "string", description: "쉬운 말로 된 설명. 왜 이 선택지가 가능한지 포함" },
          pros: { type: "array", items: { type: "string" } },
          cons: { type: "array", items: { type: "string" } },
          requiredEvidence: { type: "array", items: { type: "string" } },
          deadline: { type: ["string", "null"], description: "관련 기한 YYYY-MM-DD" },
          urgency: { type: "string", enum: ["high", "medium", "low"] },
        },
        required: ["title", "description", "pros", "cons", "requiredEvidence", "deadline", "urgency"],
      },
    },
  },
  required: ["caseInfo", "timeline", "options"],
} as const;
