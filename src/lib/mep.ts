import { eq } from "drizzle-orm";
import { db } from "@/db";
import { exchangeRates } from "@/db/schema";

const MEP_DESDE = "2025-01-01";
const MEP_INICIO_HISTORICO = "2018-10-29"; // no hay MEP antes de esta fecha

export type MepRate = { fecha: string; compra: number; venta: number };

/**
 * Cotización MEP para una fecha dada.
 * - Desde 2025-01-01: se lee de la tabla local (poblada por seed-reference-data).
 * - Antes de eso: se consulta puntualmente el endpoint por fecha de ArgentinaDatos
 *   (no se almacena, para no cargar toda la serie histórica).
 * - Antes de 2018-10-29 no hay MEP: devuelve null (el caller debe hacer fallback
 *   a blue/oficial o TC manual, ver PLAN.md).
 */
export async function getMepRateForDate(
  fecha: string
): Promise<MepRate | null> {
  if (fecha >= MEP_DESDE) {
    const row = await db
      .select()
      .from(exchangeRates)
      .where(eq(exchangeRates.fecha, fecha))
      .get();
    return row ? { fecha: row.fecha, compra: row.compra, venta: row.venta } : null;
  }

  if (fecha < MEP_INICIO_HISTORICO) {
    return null;
  }

  const [yyyy, mm, dd] = fecha.split("-");
  const res = await fetch(
    `https://api.argentinadatos.com/v1/cotizaciones/dolares/bolsa/${yyyy}/${mm}/${dd}`
  );
  if (!res.ok) return null;

  const data: { fecha: string; compra: number; venta: number } =
    await res.json();
  return { fecha: data.fecha, compra: data.compra, venta: data.venta };
}
