import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    etapa: "E1",
    timestamp: new Date().toISOString(),
  });
}
