import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { holdingsMovements } from "@/db/schema";

const TIPOS = ["compra", "venta"] as const;

const movementInput = z.object({
  cuentaId: z.number().int(),
  fecha: z.string().min(1),
  activo: z.string().min(1),
  tipo: z.enum(TIPOS),
  cantidad: z.number().positive(),
  precioUnitario: z.number().positive(),
  moneda: z.string().min(1),
  valorUsd: z.number(),
  fuente: z.string().min(1),
});

export async function GET(request: NextRequest) {
  const cuentaId = request.nextUrl.searchParams.get("cuentaId");

  const rows = await db
    .select()
    .from(holdingsMovements)
    .where(cuentaId ? eq(holdingsMovements.cuentaId, Number(cuentaId)) : undefined)
    .orderBy(desc(holdingsMovements.fecha));

  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = movementInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const [row] = await db
    .insert(holdingsMovements)
    .values(parsed.data)
    .returning();
  return NextResponse.json(row, { status: 201 });
}
