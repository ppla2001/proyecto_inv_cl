import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { holdingsSnapshots } from "@/db/schema";
import { ApiError, readJson, route } from "@/lib/http";
import { hoyIso } from "@/lib/periodo";
import { refrescarCotizaciones } from "@/lib/cotizaciones-sync";
import { cuentaBalanz, FUENTE_SNAPSHOT_BALANZ, posicionBalanz } from "@/lib/balanz-server";

const input = z.object({ cuentaId: z.number().int() });

// "Actualizar": refresca MEP/CCL, revalúa la posición y guarda el snapshot de
// hoy (uno por día por cuenta: se reemplaza si ya había).
export const POST = route<unknown>("POST /balanz/sync", async (request) => {
  const parsed = input.safeParse(await readJson(request));
  if (!parsed.success) throw new ApiError(400, "Payload inválido.", parsed.error.flatten());
  const { cuentaId } = parsed.data;
  await cuentaBalanz(cuentaId);

  try {
    await refrescarCotizaciones(["mep", "ccl"]);
  } catch (e) {
    // Sin red hacia ArgentinaDatos se sigue con la última cotización guardada.
    console.warn("[balanz/sync] no se pudieron refrescar cotizaciones:", e);
  }

  const pos = await posicionBalanz(cuentaId);
  const fecha = hoyIso();

  db.transaction((tx) => {
    tx.delete(holdingsSnapshots)
      .where(
        and(
          eq(holdingsSnapshots.cuentaId, cuentaId),
          eq(holdingsSnapshots.fecha, fecha),
          eq(holdingsSnapshots.fuente, FUENTE_SNAPSHOT_BALANZ)
        )
      )
      .run();
    for (const p of pos.posiciones) {
      if (!p.valor || p.cantidad === 0) continue;
      tx.insert(holdingsSnapshots)
        .values({
          cuentaId,
          fecha,
          activo: p.activo,
          red: null,
          cantidad: p.cantidad,
          valorUsd: p.valor.usdMep,
          valorArs: p.valor.ars,
          fuente: FUENTE_SNAPSHOT_BALANZ,
        })
        .run();
    }
  });

  return NextResponse.json({ ...pos, fecha }, { status: 201 });
});
