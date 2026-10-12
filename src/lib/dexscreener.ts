// Fallback de precio para tokens que CoinGecko no cubre (típicamente de redes
// nuevas como Abstract). DexScreener toma precios de pools de DEX, gratis y sin
// key. Cuidados de calidad aprendidos probando:
// - Solo pares donde NUESTRO token es el `baseToken` (si es el quote, el
//   priceUsd es del otro token → daría valores absurdos, ej. USDC.e a $65k).
// - Liquidez mínima, para no tomar precios de pools basura/manipulados.

const LIQUIDEZ_MINIMA_USD = 500;

type Par = {
  chainId: string;
  baseToken?: { address?: string };
  priceUsd?: string;
  liquidity?: { usd?: number };
};

// Precio USD de tokens por contrato en una red (chainId de DexScreener == `red`
// para ethereum/arbitrum/polygon/abstract). Devuelve contrato(lowercase) -> usd.
export async function preciosDexScreener(
  red: string,
  contratos: string[]
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const unicos = [...new Set(contratos.map((c) => c.toLowerCase()))];
  if (unicos.length === 0) return out;

  // Endpoint batch: hasta 30 direcciones por llamada.
  for (let i = 0; i < unicos.length; i += 30) {
    const lote = unicos.slice(i, i + 30);
    const res = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${lote.join(",")}`
    );
    if (!res.ok) continue;
    const data = (await res.json()) as { pairs?: Par[] };
    const pares = data.pairs ?? [];

    for (const contrato of lote) {
      const propios = pares
        .filter(
          (p) =>
            p.chainId === red &&
            p.baseToken?.address?.toLowerCase() === contrato &&
            (p.liquidity?.usd ?? 0) >= LIQUIDEZ_MINIMA_USD &&
            p.priceUsd
        )
        .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
      const best = propios[0];
      if (best?.priceUsd) out.set(contrato, Number(best.priceUsd));
    }
  }
  return out;
}

// Stablecoins conocidas → $1 (nunca son el baseToken de un par, así que
// DexScreener no les da precio directo).
const STABLES = new Set([
  "USDC", "USDT", "USDC.E", "USDT0", "DAI", "USDBC", "USDS", "USDE", "FDUSD", "TUSD",
]);

export function esStablecoin(simbolo: string): boolean {
  return STABLES.has(simbolo.trim().toUpperCase());
}
