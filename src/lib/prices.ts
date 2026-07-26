// Precios en USD vía CoinGecko (gratis, sin API key). Dos vías:
// - tokens nativos por id de CoinGecko (/simple/price)
// - tokens ERC-20 por dirección de contrato y plataforma (/simple/token_price)

const BASE = "https://api.coingecko.com/api/v3";

// Precio USD de tokens nativos por id de CoinGecko. Devuelve id -> usd.
export async function preciosNativos(ids: string[]): Promise<Map<string, number>> {
  const unicos = [...new Set(ids)].filter(Boolean);
  const out = new Map<string, number>();
  if (unicos.length === 0) return out;

  const url = `${BASE}/simple/price?ids=${unicos.join(",")}&vs_currencies=usd`;
  const res = await fetch(url);
  if (!res.ok) return out; // sin precio > romper todo
  const data = (await res.json()) as Record<string, { usd?: number }>;
  for (const id of unicos) {
    const p = data[id]?.usd;
    if (typeof p === "number") out.set(id, p);
  }
  return out;
}

// Precio USD de tokens ERC-20 por contrato, para una plataforma de CoinGecko
// (ej. "ethereum", "arbitrum-one", "polygon-pos"). Devuelve contrato(lowercase) -> usd.
// Las plataformas que CoinGecko no soporta (ej. Abstract) devuelven vacío → esos
// tokens quedan "sin precio".
export async function preciosTokens(
  platform: string,
  contratos: string[]
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const unicos = [...new Set(contratos.map((c) => c.toLowerCase()))];
  if (unicos.length === 0) return out;

  // CoinGecko acepta múltiples contratos por llamada (batch).
  const url = `${BASE}/simple/token_price/${platform}?contract_addresses=${unicos.join(
    ","
  )}&vs_currencies=usd`;
  const res = await fetch(url);
  if (!res.ok) return out;
  const data = (await res.json()) as Record<string, { usd?: number }>;
  for (const [contrato, val] of Object.entries(data)) {
    if (typeof val.usd === "number") out.set(contrato.toLowerCase(), val.usd);
  }
  return out;
}
