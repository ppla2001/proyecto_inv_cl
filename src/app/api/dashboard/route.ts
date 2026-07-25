import { NextResponse } from "next/server";
import { and, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { accounts, categories, transactions } from "@/db/schema";
import { getMepRateForDate } from "@/lib/mep";
import { ApiError, route } from "@/lib/http";
import { resumirFlujo, type Monto, type MovimientoFlujo } from "@/lib/flujo";

// Resumen mensual del flujo de plata (gastos / ingresos / ahorros) con cada
// monto convertido a USD (server-side, porque la conversión necesita la tabla
// de cotizaciones). La agregación en sí vive en src/lib/flujo.ts (pura, testeada).
// También devuelve el listado de movimientos del mes para la recategorización
// inline.

export const GET = route<unknown>("GET /dashboard", async (request) => {
  const mes = new URL(request.url).searchParams.get("mes"); // yyyy-mm
  if (!mes || !/^\d{4}-\d{2}$/.test(mes)) {
    throw new ApiError(400, "Falta el parámetro 'mes' (yyyy-mm).");
  }

  const [anio, m] = mes.split("-").map(Number);
  const ultimoDia = new Date(Date.UTC(anio, m, 0)).getUTCDate(); // día 0 del mes siguiente = último del actual
  const desde = `${mes}-01`;
  const hasta = `${mes}-${String(ultimoDia).padStart(2, "0")}`;

  const [movs, cuentas, cats] = await Promise.all([
    db
      .select()
      .from(transactions)
      .where(and(gte(transactions.fecha, desde), lte(transactions.fecha, hasta))),
    db.select().from(accounts),
    db.select().from(categories),
  ]);

  const grupoDeCuenta = new Map(cuentas.map((c) => [c.id, c.grupo]));

  // Cache de tasas por fecha para no re-consultar.
  const rateCache = new Map<string, number | null>();
  async function ventaEnFecha(fecha: string): Promise<number | null> {
    if (!rateCache.has(fecha)) {
      const r = await getMepRateForDate(fecha);
      rateCache.set(fecha, r ? r.venta : null);
    }
    return rateCache.get(fecha)!;
  }

  const fechasSinCotizacion = new Set<string>();
  async function aMonto(monto: number, moneda: string, fecha: string): Promise<Monto> {
    const venta = await ventaEnFecha(fecha);
    if (venta == null) fechasSinCotizacion.add(fecha); // conversión incompleta
    if (moneda === "USD") {
      return { usd: monto, ars: venta ? monto * venta : 0 };
    }
    // ARS
    return { ars: monto, usd: venta ? monto / venta : 0 };
  }

  // Convertir cada movimiento a {ars, usd} y armar el listado para la UI.
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
    nombre: cats.find((c) => c.id === categoriaId)?.nombre ?? `#${categoriaId}`,
    monto,
  }));

  const avisos: string[] = [];
  if (fechasSinCotizacion.size > 0) {
    const fechas = [...fechasSinCotizacion].sort();
    avisos.push(
      `Sin cotización para ${fechas.length} fecha(s) (${fechas.slice(0, 5).join(", ")}${
        fechas.length > 5 ? "…" : ""
      }); esos montos no se convirtieron a USD.`
    );
  }

  return NextResponse.json({
    mes,
    resumen: { gastos, ingresos, ahorros },
    porCategoria: categoriasResumen,
    movimientos,
    cuentas,
    categorias: cats,
    avisos,
  });
});
