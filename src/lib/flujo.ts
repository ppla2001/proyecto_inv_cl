// Agregación pura del flujo (gastos / ingresos / ahorros + por categoría).
// Separado del endpoint para testearlo sin DB ni conversión de moneda:
// recibe cada movimiento con su monto YA convertido.

export type Monto = { ars: number; usd: number };

export type MovimientoFlujo = {
  tipo: string;
  categoriaId: number | null;
  cuentaId: number;
  cuentaDestinoId: number | null;
  montoConvertido: Monto;
};

export type ResumenFlujo = {
  gastos: Monto;
  ingresos: Monto;
  ahorros: Monto; // neto: entra a cuentas grupo=ahorro (+), sale (−)
  // categoriaId null = "Sin categoría"
  porCategoria: { categoriaId: number | null; monto: Monto }[];
};

function cero(): Monto {
  return { ars: 0, usd: 0 };
}

function sumar(a: Monto, b: Monto): Monto {
  return { ars: a.ars + b.ars, usd: a.usd + b.usd };
}

function negar(m: Monto): Monto {
  return { ars: -m.ars, usd: -m.usd };
}

function keyCat(id: number | null): string {
  return id == null ? "" : String(id);
}

/**
 * Resume el flujo del período. `grupoDeCuenta` mapea id de cuenta → grupo
 * (uso/ahorro/inversion). Los ahorros son el neto de las transferencias
 * internas contra cuentas grupo=ahorro. Los gastos sin categoría entran al
 * desglose como categoriaId null.
 */
export function resumirFlujo(
  movs: MovimientoFlujo[],
  grupoDeCuenta: Map<number, string>
): ResumenFlujo {
  let gastos = cero();
  let ingresos = cero();
  let ahorros = cero();
  const porCategoria = new Map<string, { categoriaId: number | null; monto: Monto }>();

  for (const m of movs) {
    const monto = m.montoConvertido;
    if (m.tipo === "gasto_real") {
      gastos = sumar(gastos, monto);
      const k = keyCat(m.categoriaId);
      const prev = porCategoria.get(k);
      porCategoria.set(k, {
        categoriaId: m.categoriaId,
        monto: sumar(prev?.monto ?? cero(), monto),
      });
    } else if (m.tipo === "ingreso_real") {
      ingresos = sumar(ingresos, monto);
    } else if (m.tipo === "transferencia_interna") {
      const destinoEsAhorro =
        m.cuentaDestinoId != null && grupoDeCuenta.get(m.cuentaDestinoId) === "ahorro";
      const origenEsAhorro = grupoDeCuenta.get(m.cuentaId) === "ahorro";
      if (destinoEsAhorro) ahorros = sumar(ahorros, monto);
      if (origenEsAhorro) ahorros = sumar(ahorros, negar(monto));
    }
  }

  return {
    gastos,
    ingresos,
    ahorros,
    porCategoria: [...porCategoria.values()],
  };
}
