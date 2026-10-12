export const TIPOS_DOLAR = ["mep", "ccl", "blue", "oficial", "cripto"] as const;
export type TipoDolar = (typeof TIPOS_DOLAR)[number];

export const LABEL_DOLAR: Record<TipoDolar, string> = {
  mep: "Dólar MEP (bolsa)",
  ccl: "Dólar CCL (contado con liqui)",
  blue: "Dólar blue",
  oficial: "Dólar oficial",
  cripto: "Dólar cripto",
};

/** Qué lado de la cotización usar para convertir. */
export const PRECIOS_DOLAR = ["venta", "compra", "promedio"] as const;
export type PrecioDolar = (typeof PRECIOS_DOLAR)[number];

export const LABEL_PRECIO: Record<PrecioDolar, string> = {
  venta: "Venta",
  compra: "Compra",
  promedio: "Promedio",
};

function isTipoDolar(v: string): v is TipoDolar {
  return (TIPOS_DOLAR as readonly string[]).includes(v);
}

function isPrecioDolar(v: string): v is PrecioDolar {
  return (PRECIOS_DOLAR as readonly string[]).includes(v);
}

export function parseTipoDolar(raw: string | null): TipoDolar {
  if (raw && isTipoDolar(raw)) return raw;
  return "mep";
}

export function parsePrecioDolar(raw: string | null): PrecioDolar {
  if (raw && isPrecioDolar(raw)) return raw;
  return "venta";
}

export function tasaDeCotizacion(
  compra: number,
  venta: number,
  precio: PrecioDolar
): number {
  if (precio === "compra") return compra;
  if (precio === "promedio") return (compra + venta) / 2;
  return venta;
}
