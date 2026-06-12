import { NextRequest, NextResponse } from "next/server";
import { getCase, deleteCase } from "@/lib/store";
import { reconcileOrphans } from "@/lib/pipeline";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const meta = await getCase(id);
  if (!meta) return NextResponse.json({ error: "사건을 찾을 수 없습니다" }, { status: 404 });
  // 서버 재시작으로 끊긴 작업을 '오류'로 정리해 재시도할 수 있게 한다
  return NextResponse.json(await reconcileOrphans(meta));
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await deleteCase(id);
  return NextResponse.json({ ok: true });
}
