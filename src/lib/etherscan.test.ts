import { describe, expect, it } from "vitest";
import { formatUnits } from "@/lib/etherscan";

describe("formatUnits", () => {
  it("convierte wei (18 decimales) a ETH", () => {
    expect(formatUnits("1473468298007996", 18)).toBeCloseTo(0.001473468, 9);
    expect(formatUnits("1000000000000000000", 18)).toBe(1);
  });

  it("convierte USDC (6 decimales)", () => {
    expect(formatUnits("483825216", 6)).toBeCloseTo(483.825216, 6);
  });

  it("balance cero", () => {
    expect(formatUnits("0", 18)).toBe(0);
  });

  it("entrada inválida -> 0", () => {
    expect(formatUnits("no-numero", 18)).toBe(0);
  });
});
