import { NextResponse } from "next/server";

/** Health check — prova que a API sobe. GET /api/health -> { ok: true } */
export function GET() {
  return NextResponse.json({ ok: true });
}
