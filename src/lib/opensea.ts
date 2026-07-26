// Valuación de NFTs vía OpenSea API v2 (requiere OPENSEA_API_KEY en .env.local).
// Da dos números por colección: floor price (piso de venta) y mejor oferta de
// colección (collection offer). El floor es el más importante; la oferta es un
// piso de liquidez "vendible ya". Flujo por colección:
//   contrato -> slug        GET /chain/{red}/contract/{address}
//   floor                   GET /collections/{slug}/stats     (total.floor_price)
//   mejor oferta            GET /offers/collection/{slug}      (órdenes Seaport)
// Las redes que usamos (ethereum/arbitrum/polygon/abstract) tienen el mismo
// identificador en OpenSea que nuestro `red`, así que no hace falta mapear.

import { preciosNativos } from "@/lib/prices";

const BASE = "https://api.opensea.io/api/v2";

function apiKey(): string {
  const k = process.env.OPENSEA_API_KEY;
  if (!k) throw new Error("Falta OPENSEA_API_KEY en .env.local");
  return k;
}

async function osGet<T>(path: string): Promise<T | null> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "x-api-key": apiKey(), accept: "application/json" },
  });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

// Espaciado suave entre llamadas para no pegarle al rate limit de OpenSea.
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Tokens de pago conocidos por red, para convertir montos de ofertas a USD.
// Las ofertas de colección casi siempre son en WETH (18 dec) o alguna stable
// (6 dec). Solo valuamos ofertas en tokens que reconocemos; el resto se saltea
// (la oferta queda en null, el floor no se ve afectado).
type PagoToken = { decimals: number; tipo: "nativo" | "stable" };
const PAGO_TOKENS: Record<string, Record<string, PagoToken>> = {
  ethereum: {
    "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": { decimals: 18, tipo: "nativo" }, // WETH
    "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": { decimals: 6, tipo: "stable" }, // USDC
    "0xdac17f958d2ee523a2206206994597c13d831ec7": { decimals: 6, tipo: "stable" }, // USDT
  },
  arbitrum: {
    "0x82af49447d8a07e3bd95bd0d56f35241523fbab1": { decimals: 18, tipo: "nativo" }, // WETH
    "0xaf88d065e77c8cc2239327c5edb3a432268e5831": { decimals: 6, tipo: "stable" }, // USDC
  },
  polygon: {
    "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619": { decimals: 18, tipo: "nativo" }, // WETH (nativo del NFT sigue siendo ETH)
    "0x2791bca1f2de4661ed88a30c99a7a9449aa84174": { decimals: 6, tipo: "stable" }, // USDC.e
  },
};

// Símbolo del token nativo por red (para el floor, que viene con su símbolo).
const NATIVO_RED: Record<string, string> = {
  ethereum: "ETH", arbitrum: "ETH", polygon: "ETH", abstract: "ETH",
};

export type ValorColeccion = {
  slug: string | null;
  floorUsd: number | null;
  ofertaUsd: number | null;
};

type StatsResp = {
  total?: { floor_price?: number; floor_price_symbol?: string };
};
export type OffersResp = {
  offers?: Array<{
    protocol_data?: {
      parameters?: {
        offer?: Array<{ token?: string; startAmount?: string }>;
        consideration?: Array<{ itemType?: number; token?: string; startAmount?: string }>;
      };
    };
  }>;
};

// Convierte un monto de floor (en su símbolo) a USD. ETH → precio ETH; símbolos
// stable → 1; otros → null (no lo valuamos).
export function floorAUsd(valor: number, simbolo: string, ethUsd: number): number | null {
  const s = simbolo.trim().toUpperCase();
  if (s === "ETH" || s === "WETH") return valor * ethUsd;
  if (["USDC", "USDT", "DAI", "USDC.E"].includes(s)) return valor;
  return null;
}

// Mejor oferta de colección en USD (por NFT). Recorre las órdenes Seaport,
// calcula precio por item = (monto ofertado / cantidad pedida) y toma el máximo.
export function mejorOfertaUsd(red: string, data: OffersResp, ethUsd: number): number | null {
  const conocidos = PAGO_TOKENS[red] ?? {};
  let mejor: number | null = null;
  for (const o of data.offers ?? []) {
    const p = o.protocol_data?.parameters;
    const items = p?.offer ?? [];
    if (items.length === 0) continue;
    const tokenAddr = items[0].token?.toLowerCase() ?? "";
    const pago = conocidos[tokenAddr];
    if (!pago) continue; // token de pago que no sabemos valuar
    // Monto total ofertado (suma de los offer items del mismo token).
    let montoRaw = 0n;
    for (const it of items) {
      if (it.token?.toLowerCase() === tokenAddr && it.startAmount) montoRaw += BigInt(it.startAmount);
    }
    // Cantidad de NFTs que pide a cambio (consideration itemType 4 = criteria/colección).
    const cons = (p?.consideration ?? []).find((c) => c.itemType === 4);
    const cantidad = cons?.startAmount ? Number(cons.startAmount) : 1;
    if (cantidad <= 0) continue;
    const monto = Number(montoRaw) / 10 ** pago.decimals;
    const porItem = monto / cantidad;
    const usd = pago.tipo === "stable" ? porItem : porItem * ethUsd;
    if (mejor == null || usd > mejor) mejor = usd;
  }
  return mejor;
}

// Valúa un conjunto de colecciones (una entrada por red+contrato). Devuelve un
// mapa `${red}|${contrato.toLowerCase()}` -> { floorUsd, ofertaUsd, slug }.
export async function valuarColecciones(
  items: Array<{ red: string; contractAddress: string }>
): Promise<Map<string, ValorColeccion>> {
  const out = new Map<string, ValorColeccion>();
  const unicos = new Map<string, { red: string; contractAddress: string }>();
  for (const it of items) {
    unicos.set(`${it.red}|${it.contractAddress.toLowerCase()}`, it);
  }
  if (unicos.size === 0) return out;

  const ethUsd = (await preciosNativos(["ethereum"])).get("ethereum") ?? 0;

  for (const [key, { red, contractAddress }] of unicos) {
    const meta = await osGet<{ collection?: string }>(
      `/chain/${red}/contract/${contractAddress}`
    );
    const slug = meta?.collection ?? null;
    if (!slug) {
      out.set(key, { slug: null, floorUsd: null, ofertaUsd: null });
      continue;
    }
    await sleep(250);
    const stats = await osGet<StatsResp>(`/collections/${slug}/stats`);
    const floorNum = stats?.total?.floor_price ?? null;
    const floorSym = stats?.total?.floor_price_symbol ?? NATIVO_RED[red] ?? "ETH";
    const floorUsd = floorNum != null ? floorAUsd(floorNum, floorSym, ethUsd) : null;

    await sleep(250);
    const offers = await osGet<OffersResp>(`/offers/collection/${slug}`);
    const ofertaUsd = offers ? mejorOfertaUsd(red, offers, ethUsd) : null;

    out.set(key, { slug, floorUsd, ofertaUsd });
    await sleep(250);
  }
  return out;
}
