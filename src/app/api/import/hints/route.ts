import { NextResponse } from "next/server";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { transactions } from "@/db/schema";
import { ApiError, route } from "@/lib/http";
import { buildHintsByDescripcion } from "@/lib/category-hints";

// Memoria de clasificación para el importador: por cuenta, la última
// clasificación conocida de cada descripción (categoría / tipo / destino).

export const GET = route<unknown>("GET /import/hints", async (request) => {
  const cuentaId = new URL(request.url).searchParams.get("cuentaId");
  if (!cuentaId || Number.isNaN(Number(cuentaId))) {
    throw new ApiError(400, "Falta cuentaId.");
  }

  const rows = await db
    .select({
      descripcion: transactions.descripcion,
      categoriaId: transactions.categoriaId,
      tipo: transactions.tipo,
      cuentaDestinoId: transactions.cuentaDestinoId,
    })
    .from(transactions)
    .where(
      and(eq(transactions.cuentaId, Number(cuentaId)), isNotNull(transactions.descripcion))
    )
    .orderBy(desc(transactions.fecha), desc(transactions.id));

  const map = buildHintsByDescripcion(rows);
  const hints: Record<
    string,
    { categoriaId: number | null; tipo: string; cuentaDestinoId: number | null }
  > = {};
  for (const [k, v] of map) hints[k] = v;

  return NextResponse.json({ hints });
});
