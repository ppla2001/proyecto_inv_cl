import { NextResponse } from "next/server";
import { and, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { accounts, categories, transactions } from "@/db/schema";
import { ApiError, route } from "@/lib/http";
import { resumirFlujo, type Monto, type MovimientoFlujo } from "@/lib/flujo";
import { getExchangeRateForDate } from "@/lib/exchange-rates";
import {
  LABEL_DOLAR,
  LABEL_PRECIO,
  parsePrecioDolar,
  parseTipoDolar,
  tasaDeCotizacion,
  type PrecioDolar,
  type TipoDolar,
} from "@/lib/dolar";
import { parsePeriodoQuery } from "@/lib/periodo";

// Resumen de flujo para un período con conversión ARS↔USD según tipo de dólar
// y precio (compra / venta / promedio). Cada movimiento usa la tasa de su fecha.

export const GET = route<unknown>("GET /dashboard", async (request) => {
  const params = new URL(request.url).searchParams;
  let desde: string;
  let hasta: string;
  let modo: string;
  try {
    ({ desde, hasta, modo } = parsePeriodoQuery(params));
  } catch (e) {
    throw new ApiError(400, e instanceof Error ? e.message : "Período inválido.");
  }

  const dolar: TipoDolar = parseTipoDolar(params.get("dolar"));
  const precio: PrecioDolar = parsePrecioDolar(params.get("precio"));

  const [movs, cuentas, cats] = await Promise.all([
    db
      .select()
      .from(transactions)
      .where(and(gte(transactions.fecha, desde), lte(transactions.fecha, hasta))),
    db.select().from(accounts),
    db.select().from(categories),
  ]);

  const grupoDeCuenta = new Map(cuentas.map((c) => [c.id, c.grupo]));

  const rateCache = new Map<string, Awaited<ReturnType<typeof getExchangeRateForDate>>>();
  async function rateEnFecha(fecha: string) {
    const key = `${dolar}:${fecha}`;
    if (!rateCache.has(key)) {
      rateCache.set(key, await getExchangeRateForDate(fecha, dolar));
    }
    return rateCache.get(key)!;
  }

  const fechasSinCotizacion = new Set<string>();
  async function aMonto(monto: number, moneda: string, fecha: string): Promise<Monto> {
    const rate = await rateEnFecha(fecha);
    if (!rate) {
      fechasSinCotizacion.add(fecha);
      return moneda === "USD" ? { usd: monto, ars: 0 } : { ars: monto, usd: 0 };
    }
    const tasa = tasaDeCotizacion(rate.compra, rate.venta, precio);
    if (moneda === "USD") {
      return { usd: monto, ars: monto * tasa };
    }
    return { ars: monto, usd: monto / tasa };
  }

  const movimientos: Array<Record<string, unknown>> = [];
  const paraFlujo: MovimientoFlujo[] = [];
  for (const m of movs) {
    const monto = await aMonto(m.monto, m.moneda, m.fecha);
    movimientos.push({ ...m, montoConvertido: monto });
    paraFlujo.push({
      tipo: m.tipo,
      categoriaId: m.categoriaId,
      cuentaId: m.cuentaId,
      cuentaDestinoId: m.cuentaDestinoId,
      montoConvertido: monto,
    });
  }

  const { gastos, ingresos, ahorros, porCategoria } = resumirFlujo(
    paraFlujo,
    grupoDeCuenta
  );

  const categoriasResumen = porCategoria.map(({ categoriaId, monto }) => ({
    categoriaId,
    nombre:
      categoriaId == null
        ? "Sin categoría"
        : (cats.find((c) => c.id === categoriaId)?.nombre ?? `#${categoriaId}`),
    monto,
  }));

  const rateRef = await getExchangeRateForDate(hasta, dolar);
  const tasaRef =
    rateRef != null ? tasaDeCotizacion(rateRef.compra, rateRef.venta, precio) : null;

  const avisos: string[] = [];
  if (fechasSinCotizacion.size > 0) {
    const fechas = [...fechasSinCotizacion].sort();
    avisos.push(
      `Sin cotización ${LABEL_DOLAR[dolar]} para ${fechas.length} fecha(s) (${fechas
        .slice(0, 5)
        .join(", ")}${fechas.length > 5 ? "…" : ""}); esos montos no se convirtieron.`
    );
  }

  return NextResponse.json({
    desde,
    hasta,
    modo,
    mes: desde.slice(0, 7),
    resumen: { gastos, ingresos, ahorros },
    porCategoria: categoriasResumen,
    movimientos,
    cuentas,
    categorias: cats,
    avisos,
    cotizacion: {
      tipo: dolar,
      label: LABEL_DOLAR[dolar],
      precio,
      precioLabel: LABEL_PRECIO[precio],
      venta: rateRef?.venta ?? null,
      compra: rateRef?.compra ?? null,
      tasaUsada: tasaRef,
      fecha: rateRef?.fecha ?? null,
      nota: `Cada movimiento se convierte con la ${LABEL_PRECIO[precio].toLowerCase()} de su propia fecha.`,
    },
  });
});
