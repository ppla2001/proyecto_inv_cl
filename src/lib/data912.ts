// Last prices for Argentine-listed instruments via data912 (community API,
// free, no key). Prices are in ARS for the peso panels. We query the panels in
// order and stop as soon as every requested ticker has a price.
// Note: bonds quote per 100 nominal; only CEDEARs/stocks are valued 1:1 today.

const BASE = "https://data912.com/live";
const PANELES = ["arg_cedears", "arg_stocks", "arg_bonds", "arg_notes", "arg_corp"] as const;

type Fila = { symbol: string; c?: number | null; px_bid?: number | null; px_ask?: number | null };

export async function preciosData912(tickers: string[]): Promise<Map<string, number>> {
  const pendientes = new Set(tickers.map((t) => t.toUpperCase()));
  const out = new Map<string, number>();

  for (const panel of PANELES) {
    if (pendientes.size === 0) break;
    const res = await fetch(`${BASE}/${panel}`, { cache: "no-store" });
    if (!res.ok) continue; // un panel caído no rompe el resto
    const filas = (await res.json()) as Fila[];
    for (const f of filas) {
      const sym = f.symbol?.toUpperCase();
      if (!sym || !pendientes.has(sym)) continue;
      // Último operado; si no hubo operaciones, punta compradora como referencia.
      const precio = f.c && f.c > 0 ? f.c : f.px_bid && f.px_bid > 0 ? f.px_bid : null;
      if (precio != null) {
        out.set(sym, precio);
        pendientes.delete(sym);
      }
    }
  }
  return out;
}

// Bond-implied dollars (how brokers usually derive MEP/CCL): price of AL30 in
// pesos over AL30D (USD MEP) and AL30C (USD cable). null if a leg is missing.
export async function dolarImplicitoBonos(bono = "AL30"): Promise<{ mep: number | null; ccl: number | null }> {
  const res = await fetch(`${BASE}/arg_bonds`, { cache: "no-store" });
  if (!res.ok) return { mep: null, ccl: null };
  const filas = (await res.json()) as Fila[];
  const precio = (sym: string) => {
    const f = filas.find((x) => x.symbol?.toUpperCase() === sym);
    return f?.c && f.c > 0 ? f.c : null;
  };
  const ars = precio(bono);
  const mep = precio(`${bono}D`);
  const ccl = precio(`${bono}C`);
  return {
    mep: ars && mep ? ars / mep : null,
    ccl: ars && ccl ? ars / ccl : null,
  };
}
