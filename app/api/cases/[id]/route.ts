import { NextRequest, NextResponse } from "next/server";
import { getCase, deleteCase } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const meta = await getCase(id);
  if (!meta) return NextResponse.json({ error: "사건을 찾을 수 없습니다" }, { status: 404 });
  return NextResponse.json(meta);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await deleteCase(id);
  return NextResponse.json({ ok: true });
}
