import { NextRequest, NextResponse } from "next/server";
import { getCase, deleteCase, updateCase } from "@/lib/store";
import { reconcileOrphans } from "@/lib/pipeline";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const meta = await getCase(id);
  if (!meta) return NextResponse.json({ error: "사건을 찾을 수 없습니다" }, { status: 404 });
  // 서버 재시작으로 끊긴 작업을 '오류'로 정리해 재시도할 수 있게 한다
  return NextResponse.json(await reconcileOrphans(meta));
}

// 사건 제목 수정
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const meta = await getCase(id);
  if (!meta) return NextResponse.json({ error: "사건을 찾을 수 없습니다" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { title?: string };
  const title = (body.title ?? "").trim();
  if (!title) return NextResponse.json({ error: "제목을 입력해주세요" }, { status: 400 });
  if (title.length > 200) return NextResponse.json({ error: "제목이 너무 깁니다" }, { status: 400 });

  const updated = await updateCase(id, (m) => {
    m.title = title;
  });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await deleteCase(id);
  return NextResponse.json({ ok: true });
}
