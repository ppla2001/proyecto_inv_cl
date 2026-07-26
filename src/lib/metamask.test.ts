import { describe, expect, it } from "vitest";
import { valuarHoldings } from "@/lib/metamask";
import type { HoldingOnChain } from "@/lib/etherscan";

function h(over: Partial<HoldingOnChain>): HoldingOnChain {
  return {
    activo: "X",
    nombre: "X",
    contractAddress: null,
    cantidad: 1,
    decimals: 18,
    ...over,
  };
}

describe("valuarHoldings", () => {
  it("valúa el token nativo con el precio nativo", () => {
    const [r] = valuarHoldings(
      "ethereum",
      [h({ activo: "ETH", contractAddress: null, cantidad: 2 })],
      3000,
      new Map()
    );
    expect(r.valorUsd).toBe(6000);
    expect(r.sinPrecio).toBe(false);
    expect(r.red).toBe("ethereum");
  });

  it("valúa un token ERC-20 por contrato (case-insensitive)", () => {
    const [r] = valuarHoldings(
      "arbitrum",
      [h({ activo: "USDC", contractAddress: "0xAbC", cantidad: 483.83 })],
      null,
      new Map([["0xabc", 1]])
    );
    expect(r.valorUsd).toBeCloseTo(483.83, 2);
    expect(r.sinPrecio).toBe(false);
  });

  it("marca sin precio (valor 0) cuando el token no cotiza — filtra spam", () => {
    const [r] = valuarHoldings(
      "polygon",
      [h({ activo: "SCAM t.ly/claim", contractAddress: "0xdead", cantidad: 99999 })],
      null,
      new Map() // sin precio para el contrato
    );
    expect(r.sinPrecio).toBe(true);
    expect(r.valorUsd).toBe(0);
  });

  it("token nativo sin precio nativo -> sin precio", () => {
    const [r] = valuarHoldings("abstract", [h({ activo: "ETH", contractAddress: null })], null, new Map());
    expect(r.sinPrecio).toBe(true);
    expect(r.valorUsd).toBe(0);
  });
});
