import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { holdingsMovements } from "@/db/schema";
import { ApiError, readJson, route } from "@/lib/http";
import { cuentaBalanz, FUENTE_BALANZ } from "@/lib/balanz-server";

const fila = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ticker: z.string().min(1),
  operacion: z.enum(["compra", "venta"]),
  cantidad: z.number().positive(),
  precio: z.number().positive(),
  gastos: z.number().min(0),
  moneda: z.enum(["ARS", "USD"]),
  boleto: z.string().min(1),
  dolarMep: z.number().positive().nullable(),
  dolarCcl: z.number().positive().nullable(),
  total: z.number(),
  totalUsdMep: z.number().nullable(),
});
const input = z.object({ cuentaId: z.number().int(), rows: z.array(fila).min(1) });

// Inserta las operaciones confirmadas como holdings_movements, atómico, saltando
// las ya importadas (unique por cuenta + nº de boleto).
export const POST = route<unknown>("POST /import/balanz/confirm", async (request) => {
  const parsed = input.safeParse(await readJson(request));
  if (!parsed.success) throw new ApiError(400, "Payload inválido.", parsed.error.flatten());
  const { cuentaId, rows } = parsed.data;
  await cuentaBalanz(cuentaId);

  const insertadas = db.transaction((tx) => {
    let n = 0;
    for (const r of rows) {
      const res = tx
        .insert(holdingsMovements)
        .values({
          cuentaId,
          fecha: r.fecha,
          activo: r.ticker,
          tipo: r.operacion,
          cantidad: r.cantidad,
          precioUnitario: r.precio,
          moneda: r.moneda,
          // Canónico de la app: USD a MEP. El toggle usa valorArs + dolarCcl.
          valorUsd: r.totalUsdMep ?? (r.moneda === "USD" ? r.total : 0),
          valorArs: r.moneda === "ARS" ? r.total : null,
          gastos: r.gastos,
          dolarMep: r.dolarMep,
          dolarCcl: r.dolarCcl,
          externalId: r.boleto,
          fuente: FUENTE_BALANZ,
        })
        .onConflictDoNothing()
        .run();
      if (res.changes > 0) n++;
    }
    return n;
  });

  return NextResponse.json(
    { total: rows.length, insertadas, duplicadas: rows.length - insertadas },
    { status: 201 }
  );
});
