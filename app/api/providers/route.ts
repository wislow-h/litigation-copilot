import { NextResponse } from "next/server";
import { availableProviders } from "@/lib/pipeline";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(availableProviders());
}
