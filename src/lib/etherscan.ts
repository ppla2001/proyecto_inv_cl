// Cliente de lectura on-chain vía Etherscan V2 (multichain por chainId, un solo
// API key). Solo lectura: balances nativos y de tokens ERC-20. Los precios se
// resuelven aparte (CoinGecko); acá solo cantidades.

const BASE = "https://api.etherscan.io/v2/api";

function apiKey(): string {
  const k = process.env.ETHERSCAN_API_KEY;
  if (!k) throw new Error("Falta ETHERSCAN_API_KEY en .env.local");
  return k;
}

// Divide un entero crudo (string) por 10^decimals y devuelve number. Mantiene
// precisión razonable para display sin depender de BigInt->Number directo.
export function formatUnits(raw: string, decimals: number): number {
  if (!/^\d+$/.test(raw)) return 0;
  const neg = raw.startsWith("-");
  const s = neg ? raw.slice(1) : raw;
  const padded = s.padStart(decimals + 1, "0");
  const entero = padded.slice(0, padded.length - decimals);
  const frac = padded.slice(padded.length - decimals);
  return Number(`${entero}.${frac}`) * (neg ? -1 : 1);
}

type EtherscanResp<T> = { status: string; message: string; result: T };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function esRateLimit(data: EtherscanResp<unknown>): boolean {
  const txt = `${data.message} ${typeof data.result === "string" ? data.result : ""}`;
  return /rate limit/i.test(txt);
}

// Llama a la API con reintento ante rate limit (el free tier es ~2-3 req/s).
async function call<T>(
  chainId: number,
  params: Record<string, string>,
  intentos = 4
): Promise<T> {
  const qs = new URLSearchParams({
    chainid: String(chainId),
    apikey: apiKey(),
    ...params,
  });

  for (let i = 0; i < intentos; i++) {
    const res = await fetch(`${BASE}?${qs}`);
    if (!res.ok) throw new Error(`Etherscan HTTP ${res.status}`);
    const data = (await res.json()) as EtherscanResp<T>;

    if (esRateLimit(data)) {
      await sleep(1500 * (i + 1)); // backoff creciente
      continue;
    }
    // status "0" con "No transactions found" es un vacío legítimo, no error.
    if (data.status === "0" && /no (transactions|records) found/i.test(data.message)) {
      return [] as unknown as T;
    }
    if (data.status === "0" && typeof data.result === "string") {
      throw new Error(`Etherscan: ${data.message} — ${data.result}`);
    }
    return data.result;
  }
  throw new Error("Etherscan: rate limit persistente tras varios reintentos.");
}

export type TokenDescubierto = {
  contractAddress: string;
  tokenSymbol: string;
  tokenName: string;
  tokenDecimal: number;
};

export type HoldingOnChain = {
  activo: string; // símbolo
  nombre: string;
  contractAddress: string | null; // null = token nativo
  cantidad: number;
  decimals: number;
};

export async function balanceNativo(chainId: number, address: string): Promise<string> {
  return call<string>(chainId, {
    module: "account",
    action: "balance",
    address,
    tag: "latest",
  });
}

// Descubre los contratos ERC-20 con los que la dirección interactuó (de su
// historial de transferencias). Puede incluir tokens spam; el balance real se
// consulta después y los de balance 0 se descartan.
async function tokensDescubiertos(
  chainId: number,
  address: string
): Promise<TokenDescubierto[]> {
  const txs = await call<Array<Record<string, string>>>(chainId, {
    module: "account",
    action: "tokentx",
    address,
    page: "1",
    offset: "1000",
    sort: "desc",
  });
  const porContrato = new Map<string, TokenDescubierto>();
  for (const t of txs) {
    const c = t.contractAddress?.toLowerCase();
    if (!c || porContrato.has(c)) continue;
    porContrato.set(c, {
      contractAddress: c,
      tokenSymbol: t.tokenSymbol ?? "?",
      tokenName: t.tokenName ?? "",
      tokenDecimal: Number(t.tokenDecimal ?? "18"),
    });
  }
  return [...porContrato.values()];
}

export async function balanceToken(
  chainId: number,
  contract: string,
  address: string
): Promise<string> {
  return call<string>(chainId, {
    module: "account",
    action: "tokenbalance",
    contractaddress: contract,
    address,
    tag: "latest",
  });
}

// Delay entre llamadas, reutilizable para throttle desde otros módulos.
export const throttle = (ms = 400) => sleep(ms);

export type NftPoseido = {
  contractAddress: string;
  tokenId: string;
  coleccion: string; // tokenName
  simbolo: string; // tokenSymbol
  estandar: "erc721" | "erc1155";
  cantidad: number; // 1 para ERC-721; puede ser >1 en ERC-1155
};

// Reconstruye los NFTs actualmente poseídos desde el historial de transfers
// (entradas − salidas por contrato+tokenId). El endpoint de inventario directo
// es PRO (pago), así que se reconstruye del historial (free). Cubre los últimos
// ~1000 transfers por estándar; wallets con historial NFT enorme podrían perder
// alguno muy viejo.
export async function nftsPoseidos(
  chainId: number,
  address: string
): Promise<NftPoseido[]> {
  const addr = address.toLowerCase();
  const neto = new Map<string, NftPoseido & { key: string }>();

  async function acumular(action: "tokennfttx" | "token1155tx", estandar: "erc721" | "erc1155") {
    const txs = await call<Array<Record<string, string>>>(chainId, {
      module: "account",
      action,
      address,
      page: "1",
      offset: "1000",
      sort: "desc",
    });
    for (const t of txs) {
      const contract = t.contractAddress?.toLowerCase();
      const tokenId = t.tokenID ?? "";
      if (!contract) continue;
      const key = `${contract}#${tokenId}`;
      const cant = estandar === "erc1155" ? Number(t.tokenValue ?? "1") : 1;
      const entra = t.to?.toLowerCase() === addr;
      const sale = t.from?.toLowerCase() === addr;
      const delta = (entra ? cant : 0) - (sale ? cant : 0);
      if (delta === 0) continue;
      const prev = neto.get(key);
      if (prev) {
        prev.cantidad += delta;
      } else {
        neto.set(key, {
          key,
          contractAddress: contract,
          tokenId,
          coleccion: t.tokenName ?? "",
          simbolo: t.tokenSymbol ?? "",
          estandar,
          cantidad: delta,
        });
      }
    }
  }

  await acumular("tokennfttx", "erc721");
  await sleep(400);
  await acumular("token1155tx", "erc1155");

  return [...neto.values()].filter((n) => n.cantidad > 0);
}

/**
 * Holdings de una dirección en una red: token nativo + ERC-20 con balance > 0.
 * `nativoSimbolo` es el símbolo del gas token (ETH/POL). Throttle simple para
 * respetar el rate limit del free tier (5/s).
 */
export async function holdingsOnChain(
  chainId: number,
  address: string,
  nativoSimbolo: string
): Promise<HoldingOnChain[]> {
  const holdings: HoldingOnChain[] = [];

  const nativoRaw = await balanceNativo(chainId, address);
  const nativoCant = formatUnits(nativoRaw, 18);
  if (nativoCant > 0) {
    holdings.push({
      activo: nativoSimbolo,
      nombre: nativoSimbolo,
      contractAddress: null,
      cantidad: nativoCant,
      decimals: 18,
    });
  }

  await sleep(400);
  const tokens = await tokensDescubiertos(chainId, address);

  for (const t of tokens) {
    await sleep(400);
    let raw: string;
    try {
      raw = await balanceToken(chainId, t.contractAddress, address);
    } catch {
      continue; // un token roto no debe frenar todo
    }
    const cant = formatUnits(raw, t.tokenDecimal);
    if (cant > 0) {
      holdings.push({
        activo: t.tokenSymbol,
        nombre: t.tokenName,
        contractAddress: t.contractAddress,
        cantidad: cant,
        decimals: t.tokenDecimal,
      });
    }
  }

  return holdings;
}
