// Refresh of exchange rates from ArgentinaDatos into `exchange_rates`. Idempotent
// (upsert by fecha+tipo). Used by the seed script and by syncs that need today's
// rate (e.g. Balanz "Actualizar"), so the table doesn't go stale between seeds.

import { db } from "@/db";
import { exchangeRates } from "@/db/schema";
import { type TipoDolar } from "@/lib/dolar";

export const COTIZACIONES_DESDE = "2025-01-01";
const FUENTE = "argentinadatos";

// tipo (nuestra tabla) -> casa (ArgentinaDatos)
export const CASA_POR_TIPO: Record<TipoDolar, string> = {
  mep: "bolsa",
  ccl: "contadoconliqui",
  blue: "blue",
  oficial: "oficial",
  cripto: "cripto",
};

type CotizacionApi = { casa: string; compra: number; venta: number; fecha: string };

// Upserts every day since COTIZACIONES_DESDE for one tipo. Returns rows written.
export async function refrescarCotizacion(tipo: TipoDolar): Promise<number> {
  const res = await fetch(
    `https://api.argentinadatos.com/v1/cotizaciones/dolares/${CASA_POR_TIPO[tipo]}`
  );
  if (!res.ok) throw new Error(`Cotización ${tipo}: HTTP ${res.status}`);
  const data: CotizacionApi[] = await res.json();
  const desde = data.filter((d) => d.fecha >= COTIZACIONES_DESDE);

  db.transaction((tx) => {
    for (const { fecha, compra, venta } of desde) {
      tx.insert(exchangeRates)
        .values({ fecha, tipo, compra, venta, fuente: FUENTE })
        .onConflictDoUpdate({
          target: [exchangeRates.fecha, exchangeRates.tipo],
          set: { compra, venta, fuente: FUENTE },
        })
        .run();
    }
  });
  return desde.length;
}

export async function refrescarCotizaciones(tipos: TipoDolar[]): Promise<void> {
  for (const t of tipos) await refrescarCotizacion(t);
}
