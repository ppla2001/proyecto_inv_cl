import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { holdingsMovements } from "@/db/schema";
import { ApiError, readJson, route } from "@/lib/http";
import { parseBalanzResultados } from "@/lib/balanz-parser";
import { cuentaBalanz } from "@/lib/balanz-server";

const input = z.object({ cuentaId: z.number().int(), csv: z.string().min(1) });

// Parsea el CSV "Resultados del período" y devuelve las operaciones candidatas,
// marcando las que ya están importadas (mismo nº de boleto). NO escribe.
export const POST = route<unknown>("POST /import/balanz", async (request) => {
  const parsed = input.safeParse(await readJson(request));
  if (!parsed.success) throw new ApiError(400, "Payload inválido.", parsed.error.flatten());
  const { cuentaId, csv } = parsed.data;
  await cuentaBalanz(cuentaId);

  let candidates;
  try {
    candidates = parseBalanzResultados(csv);
  } catch (e) {
    throw new ApiError(422, e instanceof Error ? e.message : "Error parseando el CSV.");
  }

  const boletos = candidates.map((c) => c.boleto);
  const existentes = boletos.length
    ? await db
        .select({ externalId: holdingsMovements.externalId })
        .from(holdingsMovements)
        .where(and(eq(holdingsMovements.cuentaId, cuentaId), inArray(holdingsMovements.externalId, boletos)))
    : [];
  const ya = new Set(existentes.map((e) => e.externalId));

  return NextResponse.json({
    candidates: candidates.map((c) => ({ ...c, duplicado: ya.has(c.boleto) })),
  });
});
