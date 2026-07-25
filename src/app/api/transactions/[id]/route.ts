import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { transactions } from "@/db/schema";
import { ApiError, readJson, route } from "@/lib/http";
import { assertReglasTransaccion, transactionPatch } from "@/lib/transactions";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route<Ctx>("PATCH /transactions/:id", async (request, { params }) => {
  const { id } = await params;
  const parsed = transactionPatch.safeParse(await readJson(request));
  if (!parsed.success) {
    throw new ApiError(400, "Payload inválido.", parsed.error.flatten());
  }

  const actual = await db
    .select()
    .from(transactions)
    .where(eq(transactions.id, Number(id)))
    .get();
  if (!actual) {
    throw new ApiError(404, "Transacción no encontrada.");
  }

  // Validar las reglas de negocio sobre el ESTADO RESULTANTE (actual + patch),
  // no solo sobre el patch: así no se puede dejar la transacción en un estado
  // inválido (ej. cambiar tipo a transferencia_interna sin destino desde el
  // dashboard).
  const resultante = { ...actual, ...parsed.data };
  assertReglasTransaccion(resultante);

  const [row] = await db
    .update(transactions)
    .set(parsed.data)
    .where(eq(transactions.id, Number(id)))
    .returning();

  return NextResponse.json(row);
});

export const DELETE = route<Ctx>("DELETE /transactions/:id", async (_request, { params }) => {
  const { id } = await params;
  const [row] = await db
    .delete(transactions)
    .where(eq(transactions.id, Number(id)))
    .returning();

  if (!row) {
    throw new ApiError(404, "Transacción no encontrada.");
  }
  return NextResponse.json({ ok: true });
});
