import { CHAINS } from "@/lib/chains";

// Direcciones de una cuenta MetaMask. La EOA sirve para las EVM estándar;
// Abstract suele tener dirección propia (native account abstraction).
export type WalletAddresses = { eoa: string; abstract?: string };

// Se persisten en accounts.identificador_externo como JSON. Compatibilidad
// hacia atrás: si es un string plano (formato viejo), es la EOA.
export function parseAddresses(identificadorExterno: string | null): WalletAddresses {
  const s = identificadorExterno?.trim() ?? "";
  if (!s) return { eoa: "" };
  if (s.startsWith("{")) {
    try {
      const o = JSON.parse(s) as { eoa?: string; abstract?: string };
      return { eoa: o.eoa ?? "", abstract: o.abstract || undefined };
    } catch {
      return { eoa: s };
    }
  }
  return { eoa: s };
}

export function serializeAddresses(a: WalletAddresses): string {
  return JSON.stringify({
    eoa: a.eoa.trim(),
    abstract: a.abstract?.trim() || undefined,
  });
}

// Mapea cada red configurada a la dirección que le corresponde: Abstract usa la
// dirección de Abstract; el resto, la EOA. Se extiende solo al sumar chains.
export function direccionesPorRed(a: WalletAddresses): Record<string, string> {
  const m: Record<string, string> = {};
  for (const c of CHAINS) {
    const addr = c.red === "abstract" ? a.abstract : a.eoa;
    if (addr?.trim()) m[c.red] = addr.trim();
  }
  return m;
}
