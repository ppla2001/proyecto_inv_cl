import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { exchangeRates } from "@/db/schema";
import { type TipoDolar } from "@/lib/dolar";

const DESDE_LOCAL = "2025-01-01";
const MEP_INICIO_HISTORICO = "2018-10-29";
const FALLBACK_VENTANA_DIAS = 10;

export type ExchangeRate = { fecha: string; compra: number; venta: number; tipo: TipoDolar };

function restarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

/**
 * Cotización (venta/compra) para una fecha y tipo de dólar.
 * Desde 2025-01-01 lee la tabla local (con fallback al hábil anterior, ventana 10 días).
 * MEP pre-2025: consulta puntual ArgentinaDatos. Otros tipos pre-2025: null si no hay fila local.
 */
export async function getExchangeRateForDate(
  fecha: string,
  tipo: TipoDolar = "mep"
): Promise<ExchangeRate | null> {
  if (fecha >= DESDE_LOCAL) {
    const row = await db
      .select()
      .from(exchangeRates)
      .where(
        and(
          eq(exchangeRates.tipo, tipo),
          lte(exchangeRates.fecha, fecha),
          gte(exchangeRates.fecha, restarDias(fecha, FALLBACK_VENTANA_DIAS))
        )
      )
      .orderBy(desc(exchangeRates.fecha))
      .limit(1)
      .get();
    return row
      ? { fecha: row.fecha, compra: row.compra, venta: row.venta, tipo }
      : null;
  }

  if (tipo === "mep") {
    if (fecha < MEP_INICIO_HISTORICO) return null;
    const [yyyy, mm, dd] = fecha.split("-");
    const res = await fetch(
      `https://api.argentinadatos.com/v1/cotizaciones/dolares/bolsa/${yyyy}/${mm}/${dd}`
    );
    if (!res.ok) return null;
    const data: { fecha: string; compra: number; venta: number } = await res.json();
    return { fecha: data.fecha, compra: data.compra, venta: data.venta, tipo: "mep" };
  }

  return null;
}

/** Alias histórico: MEP. */
export async function getMepRateForDate(fecha: string) {
  const r = await getExchangeRateForDate(fecha, "mep");
  return r ? { fecha: r.fecha, compra: r.compra, venta: r.venta } : null;
}
