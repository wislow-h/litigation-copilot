import { NextRequest, NextResponse } from "next/server";
import { getCase } from "@/lib/store";
import { runProvider } from "@/lib/pipeline";
import type { ProviderName } from "@/lib/types";

export const runtime = "nodejs";

// 특정 파이프라인 재실행 (실패 시 재시도 버튼)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const meta = await getCase(id);
  if (!meta) return NextResponse.json({ error: "사건을 찾을 수 없습니다" }, { status: 404 });

  const { provider } = (await req.json()) as { provider: ProviderName };
  if (provider !== "upstage" && provider !== "openai") {
    return NextResponse.json({ error: "잘못된 provider" }, { status: 400 });
  }

  void runProvider(id, provider).catch((e) => console.error(`[reanalyze:${provider}]`, e));
  return NextResponse.json({ ok: true });
}
