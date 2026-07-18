import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { inflationIndex } from "@/db/schema";
import { getMepRateForDate } from "@/lib/mep";

/** Convierte un monto en ARS a USD usando el dólar MEP (venta) de la fecha dada. */
export async function ars_to_usd(
  monto: number,
  fecha: string
): Promise<number | null> {
  const rate = await getMepRateForDate(fecha);
  if (!rate) return null;
  return monto / rate.venta;
}

function nextMonth(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  d.setUTCMonth(d.getUTCMonth() + 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Meses estrictamente posteriores a mesInicio, hasta mesFin inclusive. */
function mesesEnRango(mesInicio: string, mesFin: string): string[] {
  const meses: string[] = [];
  let cur = nextMonth(mesInicio);
  while (cur <= mesFin) {
    meses.push(cur);
    cur = nextMonth(cur);
  }
  return meses;
}

/**
 * Ajusta un monto en ARS por inflación entre dos fechas, componiendo la
 * variación mensual de inflation_index. Si hasta > desde, multiplica (lleva
 * el monto a pesos de "hasta"); si hasta < desde, divide (deflaciona).
 * Devuelve null si falta algún mes del rango en la tabla.
 */
export async function ajustar_inflacion(
  monto: number,
  desde: string,
  hasta: string
): Promise<number | null> {
  const mesDesde = desde.slice(0, 7);
  const mesHasta = hasta.slice(0, 7);
  if (mesDesde === mesHasta) return monto;

  const forward = mesHasta > mesDesde;
  const mesMenor = forward ? mesDesde : mesHasta;
  const mesMayor = forward ? mesHasta : mesDesde;
  const meses = mesesEnRango(mesMenor, mesMayor);

  const rows = await db
    .select()
    .from(inflationIndex)
    .where(inArray(inflationIndex.mes, meses));
  if (rows.length !== meses.length) return null;

  const factor = rows.reduce((acc, r) => acc * (1 + r.valor / 100), 1);
  return forward ? monto * factor : monto / factor;
}
