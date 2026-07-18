import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { holdingsSnapshots } from "@/db/schema";

const snapshotInput = z.object({
  cuentaId: z.number().int(),
  fecha: z.string().min(1),
  activo: z.string().min(1),
  cantidad: z.number(),
  valorUsd: z.number(),
  fuente: z.string().min(1),
});

export async function GET(request: NextRequest) {
  const cuentaId = request.nextUrl.searchParams.get("cuentaId");

  const rows = await db
    .select()
    .from(holdingsSnapshots)
    .where(cuentaId ? eq(holdingsSnapshots.cuentaId, Number(cuentaId)) : undefined)
    .orderBy(desc(holdingsSnapshots.fecha));

  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = snapshotInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const [row] = await db
    .insert(holdingsSnapshots)
    .values(parsed.data)
    .returning();
  return NextResponse.json(row, { status: 201 });
}
