// Position math for a broker account (Balanz): from buy/sell movements to the
// current position per ticker with cost basis, and valuation with a price.
// Pure functions (no I/O) so they can be tested.
//
// Cost method: weighted average. A sale reduces the cost basis proportionally
// to the quantity sold; the difference vs. the net proceeds is realized PnL.
// Costs are tracked in three units at once (ARS, USD@MEP, USD@CCL), each using
// the rates of the movement's own date, so the UI can toggle MEP/CCL.

export type MovimientoBroker = {
  fecha: string;
  activo: string;
  tipo: string; // "compra" | "venta"
  cantidad: number;
  moneda: string; // "ARS" | "USD"
  valorArs: number | null; // total en ARS (si moneda ARS)
  valorUsd: number; // total en USD a MEP (si moneda USD: el total tal cual)
  dolarMep: number | null;
  dolarCcl: number | null;
};

export type Montos = { ars: number; usdMep: number; usdCcl: number };

export type Posicion = {
  activo: string;
  cantidad: number;
  costo: Montos; // costo base de lo que queda en cartera
  realizado: Montos; // ganancia/pérdida ya realizada por ventas
};

// Total of one movement in the three units.
export function montosDe(m: MovimientoBroker): Montos {
  if (m.moneda === "USD") {
    return { usdMep: m.valorUsd, usdCcl: m.valorUsd, ars: m.valorUsd * (m.dolarMep ?? 0) };
  }
  const ars = m.valorArs ?? m.valorUsd * (m.dolarMep ?? 0);
  return {
    ars,
    usdMep: m.dolarMep ? ars / m.dolarMep : m.valorUsd,
    usdCcl: m.dolarCcl ? ars / m.dolarCcl : m.valorUsd,
  };
}

const cero = (): Montos => ({ ars: 0, usdMep: 0, usdCcl: 0 });
const escalar = (a: Montos, k: number): Montos => ({ ars: a.ars * k, usdMep: a.usdMep * k, usdCcl: a.usdCcl * k });
const sumar = (a: Montos, b: Montos): Montos => ({ ars: a.ars + b.ars, usdMep: a.usdMep + b.usdMep, usdCcl: a.usdCcl + b.usdCcl });
const restar = (a: Montos, b: Montos): Montos => sumar(a, escalar(b, -1));

// Tolerance to treat a position as closed (float noise after sells).
const EPS = 1e-9;

export function calcularPosiciones(movs: MovimientoBroker[]): Posicion[] {
  const ordenados = [...movs].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const pos = new Map<string, Posicion>();

  for (const m of ordenados) {
    const p = pos.get(m.activo) ?? { activo: m.activo, cantidad: 0, costo: cero(), realizado: cero() };
    const total = montosDe(m);
    if (m.tipo === "compra") {
      p.cantidad += m.cantidad;
      p.costo = sumar(p.costo, total);
    } else if (m.tipo === "venta") {
      if (m.cantidad > p.cantidad + EPS) {
        throw new Error(
          `Venta de ${m.cantidad} ${m.activo} el ${m.fecha} supera la tenencia (${p.cantidad}). ¿Falta importar alguna compra?`
        );
      }
      const costoVendido = p.cantidad > 0 ? escalar(p.costo, m.cantidad / p.cantidad) : cero();
      p.realizado = sumar(p.realizado, restar(total, costoVendido));
      p.costo = restar(p.costo, costoVendido);
      p.cantidad -= m.cantidad;
      if (Math.abs(p.cantidad) < EPS) { p.cantidad = 0; p.costo = cero(); }
    }
    pos.set(m.activo, p);
  }
  return [...pos.values()];
}

export type PosicionValuada = Posicion & {
  precioArs: number | null; // último precio en ARS (null = sin cotización)
  valor: Montos | null; // valor actual en las tres unidades
  pnl: Montos | null; // no realizado: valor - costo
};

// Values each position with an ARS price and today's MEP/CCL.
export function valuarPosiciones(
  posiciones: Posicion[],
  precios: Map<string, number>,
  dolar: { mep: number | null; ccl: number | null }
): PosicionValuada[] {
  return posiciones.map((p) => {
    const precioArs = precios.get(p.activo) ?? null;
    if (precioArs == null || p.cantidad === 0) return { ...p, precioArs, valor: null, pnl: null };
    const ars = p.cantidad * precioArs;
    const valor: Montos = {
      ars,
      usdMep: dolar.mep ? ars / dolar.mep : 0,
      usdCcl: dolar.ccl ? ars / dolar.ccl : 0,
    };
    return { ...p, precioArs, valor, pnl: restar(valor, p.costo) };
  });
}
