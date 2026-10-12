// Server side of the Balanz module: loads the account's movements, prices them
// with data912 and converts with the latest MEP/CCL. Keeps the routes thin.

import { and, desc, eq, lte } from "drizzle-orm";
import { db } from "@/db";
import { accounts, exchangeRates, holdingsMovements } from "@/db/schema";
import { ApiError } from "@/lib/http";
import { hoyIso } from "@/lib/periodo";
import { type TipoDolar } from "@/lib/dolar";
import { calcularPosiciones, valuarPosiciones, type Montos, type PosicionValuada } from "@/lib/balanz";
import { dolarImplicitoBonos, preciosData912 } from "@/lib/data912";

export const FUENTE_BALANZ = "import_balanz";
export const FUENTE_SNAPSHOT_BALANZ = "balanz_data912";

export async function cuentaBalanz(cuentaId: number) {
  const cuenta = await db.select().from(accounts).where(eq(accounts.id, cuentaId)).get();
  if (!cuenta) throw new ApiError(404, "Cuenta no encontrada.");
  if (cuenta.plataforma !== "balanz") throw new ApiError(400, "La cuenta no es de Balanz.");
  return cuenta;
}

// Latest rate on or before `fecha` (no window: the UI shows its date, so a
// stale rate is visible instead of silently missing).
export async function ultimaCotizacion(tipo: TipoDolar, fecha = hoyIso()) {
  return db
    .select()
    .from(exchangeRates)
    .where(and(eq(exchangeRates.tipo, tipo), lte(exchangeRates.fecha, fecha)))
    .orderBy(desc(exchangeRates.fecha))
    .limit(1)
    .get();
}

type Cotizacion = { compra: number; venta: number; fecha: string } | null;

export type PosicionBalanz = {
  posiciones: PosicionValuada[];
  // Dólar usado por defecto (venta de ArgentinaDatos).
  dolar: { mep: number | null; ccl: number | null; fechaMep: string | null; fechaCcl: string | null };
  // Todas las alternativas, para el desglose y para valuar con otra.
  cotizaciones: { mep: Cotizacion; ccl: Cotizacion; bonos: { mep: number | null; ccl: number | null } };
  totales: {
    costo: Montos;
    costoSinGastos: Montos;
    valor: Montos;
    pnl: Montos;
    pnlSinGastos: Montos;
    realizado: Montos;
    realizadoSinGastos: Montos;
  };
  sinPrecio: string[];
  movimientos: number;
};

const sumaMontos = (xs: (Montos | null)[]): Montos =>
  xs.reduce<Montos>(
    (a, m) => (m ? { ars: a.ars + m.ars, usdMep: a.usdMep + m.usdMep, usdCcl: a.usdCcl + m.usdCcl } : a),
    { ars: 0, usdMep: 0, usdCcl: 0 }
  );

export async function posicionBalanz(cuentaId: number): Promise<PosicionBalanz> {
  const movs = await db
    .select()
    .from(holdingsMovements)
    .where(eq(holdingsMovements.cuentaId, cuentaId));

  let base;
  try {
    base = calcularPosiciones(movs);
  } catch (e) {
    throw new ApiError(422, e instanceof Error ? e.message : String(e));
  }
  const abiertas = base.filter((p) => p.cantidad > 0);

  const [precios, mep, ccl, bonos] = await Promise.all([
    preciosData912(abiertas.map((p) => p.activo)),
    ultimaCotizacion("mep"),
    ultimaCotizacion("ccl"),
    dolarImplicitoBonos().catch(() => ({ mep: null, ccl: null })),
  ]);
  const cot = (r: typeof mep): Cotizacion => (r ? { compra: r.compra, venta: r.venta, fecha: r.fecha } : null);
  // Venta: lo que cuesta comprar dólares hoy, consistente con el resto de la app.
  const dolar = {
    mep: mep?.venta ?? null,
    ccl: ccl?.venta ?? null,
    fechaMep: mep?.fecha ?? null,
    fechaCcl: ccl?.fecha ?? null,
  };
  const posiciones = valuarPosiciones(base, precios, dolar).sort(
    (a, b) => (b.valor?.ars ?? 0) - (a.valor?.ars ?? 0)
  );
  const valuadas = posiciones.filter((p) => p.cantidad > 0);

  return {
    posiciones,
    dolar,
    cotizaciones: { mep: cot(mep), ccl: cot(ccl), bonos },
    totales: {
      // Costo y PnL solo de lo valuado, para que el % no mezcle tickers sin precio.
      costo: sumaMontos(valuadas.filter((p) => p.valor).map((p) => p.costo)),
      costoSinGastos: sumaMontos(valuadas.filter((p) => p.valor).map((p) => p.costoSinGastos)),
      valor: sumaMontos(valuadas.map((p) => p.valor)),
      pnl: sumaMontos(valuadas.map((p) => p.pnl)),
      pnlSinGastos: sumaMontos(valuadas.map((p) => p.pnlSinGastos)),
      realizado: sumaMontos(posiciones.map((p) => p.realizado)),
      realizadoSinGastos: sumaMontos(posiciones.map((p) => p.realizadoSinGastos)),
    },
    sinPrecio: valuadas.filter((p) => !p.valor).map((p) => p.activo),
    movimientos: movs.length,
  };
}
