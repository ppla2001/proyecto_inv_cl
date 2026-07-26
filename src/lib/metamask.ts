// Orquestación de holdings de MetaMask: por cada red configurada, lee balances
// on-chain (Etherscan) y les pone precio USD (CoinGecko). La parte de valuación
// es pura y testeable; la de fetch coordina las fuentes.

import { CHAINS } from "@/lib/chains";
import { holdingsOnChain, type HoldingOnChain } from "@/lib/etherscan";
import { preciosNativos, preciosTokens } from "@/lib/prices";

export type HoldingValuado = {
  red: string;
  activo: string;
  nombre: string;
  contractAddress: string | null;
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
