import { NextRequest, NextResponse } from "next/server";
import { and, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { accounts, categories, transactions } from "@/db/schema";
import { getMepRateForDate } from "@/lib/mep";

// Resumen mensual del flujo de plata (gastos / ingresos / ahorros) con cada
// monto convertido a USD (server-side, porque la conversión necesita la tabla
// de cotizaciones). También devuelve el listado de movimientos del mes para la
// recategorización inline, y un patrimonio simple agrupado por grupo de cuenta.

type Monto = { ars: number; usd: number };

function cero(): Monto {
  return { ars: 0, usd: 0 };
}

function sumar(a: Monto, b: Monto): Monto {
  return { ars: a.ars + b.ars, usd: a.usd + b.usd };
}

export async function GET(request: NextRequest) {
  const mes = request.nextUrl.searchParams.get("mes"); // yyyy-mm
  if (!mes || !/^\d{4}-\d{2}$/.test(mes)) {
    return NextResponse.json(
      { error: "Falta el parámetro 'mes' (yyyy-mm)." },
      { status: 400 }
    );
  }

  const desde = `${mes}-01`;
  const hasta = `${mes}-31`;

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

  async function aMonto(monto: number, moneda: string, fecha: string): Promise<Monto> {
    const venta = await ventaEnFecha(fecha);
    if (moneda === "USD") {
      return { usd: monto, ars: venta ? monto * venta : 0 };
    }
    // ARS
    return { ars: monto, usd: venta ? monto / venta : 0 };
  }

  let gastos = cero();
  let ingresos = cero();
  let ahorros = cero(); // neto hacia cuentas grupo=ahorro
  const porCategoria = new Map<number, Monto>();
  const movimientos: Array<Record<string, unknown>> = [];

  for (const m of movs) {
    const monto = await aMonto(m.monto, m.moneda, m.fecha);
    movimientos.push({ ...m, montoConvertido: monto });

    if (m.tipo === "gasto_real") {
      gastos = sumar(gastos, monto);
      if (m.categoriaId != null) {
        porCategoria.set(
          m.categoriaId,
          sumar(porCategoria.get(m.categoriaId) ?? cero(), monto)
        );
      }
    } else if (m.tipo === "ingreso_real") {
      ingresos = sumar(ingresos, monto);
    } else if (m.tipo === "transferencia_interna") {
      const destinoEsAhorro =
        m.cuentaDestinoId != null && grupoDeCuenta.get(m.cuentaDestinoId) === "ahorro";
      const origenEsAhorro = grupoDeCuenta.get(m.cuentaId) === "ahorro";
      if (destinoEsAhorro) ahorros = sumar(ahorros, monto); // entra a ahorro
      if (origenEsAhorro)
        ahorros = sumar(ahorros, { ars: -monto.ars, usd: -monto.usd }); // sale de ahorro
    }
  }

  const categoriasResumen = [...porCategoria.entries()].map(([id, monto]) => ({
    categoriaId: id,
    nombre: cats.find((c) => c.id === id)?.nombre ?? `#${id}`,
    monto,
  }));

  return NextResponse.json({
    mes,
    resumen: { gastos, ingresos, ahorros },
    porCategoria: categoriasResumen,
    movimientos,
    cuentas,
    categorias: cats,
  });
}
