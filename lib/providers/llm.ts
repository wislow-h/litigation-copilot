import OpenAI from "openai";

// 구조화 출력 헬퍼: json_schema response_format을 시도하고,
// 제공사가 거부하면(400 등) JSON-only 지시 프롬프트로 폴백한다.
export async function chatJSON<T>(
  client: OpenAI,
  model: string,
  system: string,
  user: string,
  schemaName: string,
  schema: Record<string, unknown>
): Promise<T> {
  const messages = [
    { role: "system" as const, content: system },
    { role: "user" as const, content: user },
  ];
  // temperature 0: 동일 입력에 대한 추출/분석 결과의 실행 간 편차를 줄인다
  // (편차가 크면 같은 기록인데 판결문 누락 등으로 결과가 흔들림)
  try {
    const res = await client.chat.completions.create({
      model,
      messages,
      temperature: 0,
      response_format: {
        type: "json_schema",
        json_schema: { name: schemaName, schema, strict: true },
      },
    });
    return parseJSON<T>(res.choices[0]?.message?.content ?? "");
  } catch (e) {
    if (!isSchemaUnsupported(e)) throw e;
    const res = await client.chat.completions.create({
      model,
      temperature: 0,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: `${user}\n\n반드시 다음 JSON 스키마를 만족하는 JSON만 출력하세요(설명·코드펜스 금지):\n${JSON.stringify(schema)}`,
        },
      ],
    });
    return parseJSON<T>(res.choices[0]?.message?.content ?? "");
  }
}

function isSchemaUnsupported(e: unknown): boolean {
  const status = (e as { status?: number })?.status;
  const msg = e instanceof Error ? e.message : String(e);
  return status === 400 && /response_format|json_schema|schema/i.test(msg);
}

export function parseJSON<T>(text: string): T {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "");
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // 본문에 섞인 JSON 오브젝트를 마지막 수단으로 추출
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]) as T;
    throw new Error(`모델 응답을 JSON으로 해석할 수 없습니다: ${text.slice(0, 200)}`);
  }
}
