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
  precioUnitario: number; // en `moneda`, sin gastos
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
  costo: Montos; // costo base de lo que queda en cartera (con gastos)
  realizado: Montos; // ganancia/pérdida ya realizada por ventas (con gastos)
  // Lo mismo sin comisiones/derechos (precio × cantidad), como suele mostrar
  // el broker su "precio promedio de compra".
  costoSinGastos: Montos;
  realizadoSinGastos: Montos;
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

// Same, but gross of fees (cantidad × precio), converted with the same rates.
export function montosBrutosDe(m: MovimientoBroker): Montos {
  const conGastos = montosDe(m);
  const total = m.moneda === "USD" ? m.valorUsd : m.valorArs ?? 0;
  const bruto = m.cantidad * m.precioUnitario;
  const k = total > 0 ? bruto / total : 1;
  return { ars: conGastos.ars * k, usdMep: conGastos.usdMep * k, usdCcl: conGastos.usdCcl * k };
}

const cero = (): Montos => ({ ars: 0, usdMep: 0, usdCcl: 0 });
const escalar = (a: Montos, k: number): Montos => ({ ars: a.ars * k, usdMep: a.usdMep * k, usdCcl: a.usdCcl * k });
const sumar = (a: Montos, b: Montos): Montos => ({ ars: a.ars + b.ars, usdMep: a.usdMep + b.usdMep, usdCcl: a.usdCcl + b.usdCcl });
const restar = (a: Montos, b: Montos): Montos => sumar(a, escalar(b, -1));

// Tolerance to treat a position as closed (float noise after sells).
const EPS = 1e-9;

type Acumulado = { cantidad: number; costo: Montos; realizado: Montos };

// Weighted-average cost for one ticker's movements (already sorted), with the
// given way of valuing each movement (with or without fees).
function acumular(movs: MovimientoBroker[], montos: (m: MovimientoBroker) => Montos): Acumulado {
  const a: Acumulado = { cantidad: 0, costo: cero(), realizado: cero() };
  for (const m of movs) {
    const total = montos(m);
    if (m.tipo === "compra") {
      a.cantidad += m.cantidad;
      a.costo = sumar(a.costo, total);
    } else if (m.tipo === "venta") {
      if (m.cantidad > a.cantidad + EPS) {
        throw new Error(
          `Venta de ${m.cantidad} ${m.activo} el ${m.fecha} supera la tenencia (${a.cantidad}). ¿Falta importar alguna compra?`
        );
      }
      const costoVendido = a.cantidad > 0 ? escalar(a.costo, m.cantidad / a.cantidad) : cero();
      a.realizado = sumar(a.realizado, restar(total, costoVendido));
      a.costo = restar(a.costo, costoVendido);
      a.cantidad -= m.cantidad;
      if (Math.abs(a.cantidad) < EPS) { a.cantidad = 0; a.costo = cero(); }
    }
  }
  return a;
}

export function calcularPosiciones(movs: MovimientoBroker[]): Posicion[] {
  const porActivo = new Map<string, MovimientoBroker[]>();
  for (const m of [...movs].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    const arr = porActivo.get(m.activo) ?? [];
    arr.push(m);
    porActivo.set(m.activo, arr);
  }
  return [...porActivo.entries()].map(([activo, ms]) => {
    const con = acumular(ms, montosDe);
    const sin = acumular(ms, montosBrutosDe);
    return {
      activo,
      cantidad: con.cantidad,
      costo: con.costo,
      realizado: con.realizado,
      costoSinGastos: sin.costo,
      realizadoSinGastos: sin.realizado,
    };
  });
}

export type PosicionValuada = Posicion & {
  precioArs: number | null; // último precio en ARS (null = sin cotización)
  valor: Montos | null; // valor actual en las tres unidades
  pnl: Montos | null; // no realizado: valor - costo
  pnlSinGastos: Montos | null;
};

// Values each position with an ARS price and today's MEP/CCL.
export function valuarPosiciones(
  posiciones: Posicion[],
  precios: Map<string, number>,
  dolar: { mep: number | null; ccl: number | null }
): PosicionValuada[] {
  return posiciones.map((p) => {
    const precioArs = precios.get(p.activo) ?? null;
    if (precioArs == null || p.cantidad === 0) {
      return { ...p, precioArs, valor: null, pnl: null, pnlSinGastos: null };
    }
    const ars = p.cantidad * precioArs;
    const valor: Montos = {
      ars,
      usdMep: dolar.mep ? ars / dolar.mep : 0,
      usdCcl: dolar.ccl ? ars / dolar.ccl : 0,
    };
    return { ...p, precioArs, valor, pnl: restar(valor, p.costo), pnlSinGastos: restar(valor, p.costoSinGastos) };
  });
}
