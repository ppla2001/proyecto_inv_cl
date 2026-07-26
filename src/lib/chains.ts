// Config de redes EVM que leemos on-chain vía Etherscan V2 (un solo API key,
// multichain por `chainId`). Sumar una red = agregar una entrada acá.

export type ChainConfig = {
  red: string; // id interno (se guarda en holdings_snapshots.red)
  nombre: string; // label para la UI
  chainId: number; // Etherscan V2 chainid
  nativo: string; // símbolo del token nativo (gas)
  // Ids de CoinGecko para precios en USD:
  coingeckoNativeId: string; // para /simple/price?ids=
  coingeckoPlatform: string | null; // para /simple/token_price/{platform}; null = tokens sin precio
};

export const CHAINS: ChainConfig[] = [
  {
    red: "ethereum",
    nombre: "Ethereum",
    chainId: 1,
    nativo: "ETH",
    coingeckoNativeId: "ethereum",
    coingeckoPlatform: "ethereum",
  },
  {
    red: "arbitrum",
    nombre: "Arbitrum",
    chainId: 42161,
    nativo: "ETH",
    coingeckoNativeId: "ethereum",
    coingeckoPlatform: "arbitrum-one",
  },
  // NOTA: Base (chainId 8453) NO está en el free tier de Etherscan V2 (requiere
  // plan pago), así que queda fuera por la restricción de costo cero. Si más
  // adelante se usa otra fuente para Base, se re-agrega acá.
  {
    red: "polygon",
    nombre: "Polygon",
    chainId: 137,
    nativo: "POL",
    coingeckoNativeId: "polygon-ecosystem-token",
    coingeckoPlatform: "polygon-pos",
  },
  {
    // Abstract es una L2 nueva (native account abstraction): la dirección suele
    // diferir del EOA estándar. CoinGecko no la tiene como plataforma todavía,
    // así que sus tokens quedan "sin precio" (el nativo ETH sí se valúa).
    red: "abstract",
    nombre: "Abstract",
    chainId: 2741,
    nativo: "ETH",
    coingeckoNativeId: "ethereum",
    coingeckoPlatform: null,
  },
];

export function chainPorRed(red: string): ChainConfig | undefined {
  return CHAINS.find((c) => c.red === red);
}
