// Orquestación de holdings de MetaMask: por cada red configurada, lee balances
// on-chain (Etherscan) y les pone precio USD (CoinGecko). La parte de valuación
// es pura y testeable; la de fetch coordina las fuentes.

import { CHAINS, chainPorRed } from "@/lib/chains";
import {
  balanceNativo,
  balanceToken,
  formatUnits,
  holdingsOnChain,
  nftsPoseidos,
  throttle,
  type HoldingOnChain,
  type NftPoseido,
} from "@/lib/etherscan";
import { preciosNativos, preciosTokens } from "@/lib/prices";

export type HoldingValuado = {
  red: string;
  activo: string;
  nombre: string;
  contractAddress: string | null;
  decimals: number;
  cantidad: number;
  precioUsd: number | null; // null = no se pudo valuar
  valorUsd: number; // 0 si sin precio
  sinPrecio: boolean;
};

// PURA: combina balances de una red con los precios ya resueltos.
// `precioNativo` es el precio del token nativo; `preciosPorContrato` mapea
// contrato(lowercase) -> precio USD.
export function valuarHoldings(
  red: string,
  holdings: HoldingOnChain[],
  precioNativo: number | null,
  preciosPorContrato: Map<string, number>
): HoldingValuado[] {
  return holdings.map((h) => {
    const precio =
      h.contractAddress == null
        ? precioNativo
        : preciosPorContrato.get(h.contractAddress.toLowerCase()) ?? null;
    const sinPrecio = precio == null;
    return {
      red,
      activo: h.activo,
      nombre: h.nombre,
      contractAddress: h.contractAddress,
      decimals: h.decimals,
      cantidad: h.cantidad,
      precioUsd: precio,
      valorUsd: sinPrecio ? 0 : h.cantidad * (precio as number),
      sinPrecio,
    };
  });
}

// ORQUESTACIÓN: para cada red con dirección provista, trae holdings y los valúa.
// `direccionesPorRed` mapea red -> address (ej. { ethereum: "0x..", abstract: "0x.." }).
export async function holdingsValuados(
  direccionesPorRed: Record<string, string>
): Promise<HoldingValuado[]> {
  const resultado: HoldingValuado[] = [];

  // Precio de los nativos (todas las redes de una) en una sola llamada.
  const idsNativos = CHAINS.map((c) => c.coingeckoNativeId);
  const preciosNat = await preciosNativos(idsNativos);

  for (const chain of CHAINS) {
    const address = direccionesPorRed[chain.red]?.trim();
    if (!address) continue;

    const holdings = await holdingsOnChain(chain.chainId, address, chain.nativo);
    if (holdings.length === 0) continue;

    // Precios de tokens de esta red (si CoinGecko soporta la plataforma).
    let preciosTok = new Map<string, number>();
    const contratos = holdings
      .map((h) => h.contractAddress)
      .filter((c): c is string => c != null);
    if (chain.coingeckoPlatform && contratos.length > 0) {
      preciosTok = await preciosTokens(chain.coingeckoPlatform, contratos);
    }

    const precioNativo = preciosNat.get(chain.coingeckoNativeId) ?? null;
    resultado.push(...valuarHoldings(chain.red, holdings, precioNativo, preciosTok));
  }

  return resultado;
}

export type NftDescubierto = NftPoseido & { red: string };

// DESCUBRIMIENTO para el setup de una cuenta: trae TODOS los tokens (valuados,
// para poder pre-marcar los que cotizan) y TODOS los NFTs poseídos de todas las
// redes con dirección. El usuario después cura (elige cuáles seguir).
export async function descubrir(
  direccionesPorRed: Record<string, string>
): Promise<{ tokens: HoldingValuado[]; nfts: NftDescubierto[] }> {
  const tokens = await holdingsValuados(direccionesPorRed);

  const nfts: NftDescubierto[] = [];
  for (const chain of CHAINS) {
    const address = direccionesPorRed[chain.red]?.trim();
    if (!address) continue;
    const poseidos = await nftsPoseidos(chain.chainId, address);
    nfts.push(...poseidos.map((n) => ({ ...n, red: chain.red })));
  }

  return { tokens, nfts };
}

export type TrackedToken = {
  red: string;
  activo: string;
  nombre: string | null;
  contractAddress: string | null; // null = token nativo
  decimals: number | null;
};

// REVALUACIÓN rápida: solo los tokens de la watchlist (sin re-descubrir con
// tokentx). Consulta el balance puntual de cada uno y le pone precio. Mucho más
// rápido que `descubrir`: es lo que corre el botón "Actualizar".
export async function revaluarTokens(
  direccionesPorRed: Record<string, string>,
  tokens: TrackedToken[]
): Promise<HoldingValuado[]> {
  const preciosNat = await preciosNativos(CHAINS.map((c) => c.coingeckoNativeId));

  const porRed = new Map<string, TrackedToken[]>();
  for (const t of tokens) {
    const arr = porRed.get(t.red) ?? [];
    arr.push(t);
    porRed.set(t.red, arr);
  }

  const resultado: HoldingValuado[] = [];
  for (const [red, toks] of porRed) {
    const chain = chainPorRed(red);
    const address = direccionesPorRed[red]?.trim();
    if (!chain || !address) continue;

    const holdings: HoldingOnChain[] = [];
    const contratos: string[] = [];
    for (const t of toks) {
      await throttle();
      if (t.contractAddress == null) {
        const raw = await balanceNativo(chain.chainId, address);
        holdings.push({
          activo: t.activo,
          nombre: t.nombre ?? t.activo,
          contractAddress: null,
          cantidad: formatUnits(raw, 18),
          decimals: 18,
        });
      } else {
        const dec = t.decimals ?? 18;
        const raw = await balanceToken(chain.chainId, t.contractAddress, address);
        holdings.push({
          activo: t.activo,
          nombre: t.nombre ?? t.activo,
          contractAddress: t.contractAddress,
          cantidad: formatUnits(raw, dec),
          decimals: dec,
        });
        contratos.push(t.contractAddress);
      }
    }

    let preciosTok = new Map<string, number>();
    if (chain.coingeckoPlatform && contratos.length > 0) {
      preciosTok = await preciosTokens(chain.coingeckoPlatform, contratos);
    }
    const precioNativo = preciosNat.get(chain.coingeckoNativeId) ?? null;
    resultado.push(...valuarHoldings(red, holdings, precioNativo, preciosTok));
  }

  return resultado;
}
