import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { transactions } from "@/db/schema";

const TIPOS = ["gasto_real", "ingreso_real", "transferencia_interna"] as const;

const transactionPatch = z.object({
  fecha: z.string().min(1).optional(),
  monto: z.number().positive().optional(),
  moneda: z.string().min(1).optional(),
  cuentaId: z.number().int().optional(),
  categoriaId: z.number().int().nullable().optional(),
  tipo: z.enum(TIPOS).optional(),
  descripcion: z.string().nullable().optional(),
  cuentaDestinoId: z.number().int().nullable().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const parsed = transactionPatch.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const [row] = await db
    .update(transactions)
    .set(parsed.data)
    .where(eq(transactions.id, Number(id)))
    .returning();

  if (!row) {
    return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  }
  return NextResponse.json(row);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const [row] = await db
    .delete(transactions)
    .where(eq(transactions.id, Number(id)))
    .returning();

  if (!row) {
    return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
