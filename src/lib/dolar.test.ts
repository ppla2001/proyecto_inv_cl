import { describe, expect, it } from "vitest";
import { parsePrecioDolar, tasaDeCotizacion } from "@/lib/dolar";

describe("tasaDeCotizacion", () => {
  it("elige compra, venta o promedio", () => {
    expect(tasaDeCotizacion(1000, 1100, "compra")).toBe(1000);
    expect(tasaDeCotizacion(1000, 1100, "venta")).toBe(1100);
    expect(tasaDeCotizacion(1000, 1100, "promedio")).toBe(1050);
  });

  it("parsePrecioDolar default venta", () => {
    expect(parsePrecioDolar(null)).toBe("venta");
    expect(parsePrecioDolar("promedio")).toBe("promedio");
  });
});
