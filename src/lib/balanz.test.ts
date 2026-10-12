import { describe, it, expect } from "vitest";
import { calcularPosiciones, valuarPosiciones, type MovimientoBroker } from "@/lib/balanz";

const compra = (fecha: string, activo: string, cantidad: number, ars: number, mep: number, ccl: number): MovimientoBroker => ({
  fecha, activo, tipo: "compra", cantidad, moneda: "ARS", valorArs: ars, valorUsd: ars / mep, dolarMep: mep, dolarCcl: ccl,
});
const venta = (fecha: string, activo: string, cantidad: number, ars: number, mep: number, ccl: number): MovimientoBroker => ({
  ...compra(fecha, activo, cantidad, ars, mep, ccl), tipo: "venta",
});

describe("calcularPosiciones", () => {
  it("suma lotes del mismo ticker con su costo en ARS y USD a cada dólar del día", () => {
    const [spy] = calcularPosiciones([
      compra("2026-07-08", "SPY", 10, 200_000, 1000, 1100),
      compra("2026-09-03", "SPY", 10, 300_000, 1500, 1500),
    ]);
    expect(spy.cantidad).toBe(20);
    expect(spy.costo.ars).toBe(500_000);
    expect(spy.costo.usdMep).toBeCloseTo(200 + 200, 6);
    expect(spy.costo.usdCcl).toBeCloseTo(200_000 / 1100 + 200, 6);
  });

  it("una venta baja el costo a costo promedio y registra el realizado", () => {
    const [p] = calcularPosiciones([
      compra("2026-07-01", "MSFT", 10, 100_000, 1000, 1000), // 10.000 c/u
      venta("2026-08-01", "MSFT", 4, 60_000, 1000, 1000), // vende a 15.000 c/u
    ]);
    expect(p.cantidad).toBe(6);
    expect(p.costo.ars).toBeCloseTo(60_000, 6);
    expect(p.realizado.ars).toBeCloseTo(60_000 - 40_000, 6);
    expect(p.realizado.usdMep).toBeCloseTo(20, 6);
  });

  it("ordena por fecha aunque lleguen desordenados", () => {
    const [p] = calcularPosiciones([
      venta("2026-08-01", "MU", 1, 30_000, 1000, 1000),
      compra("2026-07-01", "MU", 2, 40_000, 1000, 1000),
    ]);
    expect(p.cantidad).toBe(1);
  });

  it("falla si una venta supera la tenencia (falta una compra)", () => {
    expect(() => calcularPosiciones([venta("2026-08-01", "VST", 5, 1, 1, 1)])).toThrow(/supera la tenencia/);
  });
});

describe("valuarPosiciones", () => {
  it("valúa a precio ARS y convierte al MEP/CCL de hoy; PnL = valor - costo", () => {
    const pos = calcularPosiciones([compra("2026-07-01", "SPY", 10, 100_000, 1000, 1250)]);
    const [v] = valuarPosiciones(pos, new Map([["SPY", 15_000]]), { mep: 1500, ccl: 1500 });
    expect(v.valor?.ars).toBe(150_000);
    expect(v.valor?.usdMep).toBe(100);
    expect(v.pnl?.usdMep).toBeCloseTo(100 - 100, 6);
    expect(v.pnl?.usdCcl).toBeCloseTo(100 - 80, 6);
    expect(v.pnl?.ars).toBe(50_000);
  });

  it("sin precio queda sin valuar (no inventa 0)", () => {
    const pos = calcularPosiciones([compra("2026-07-01", "XYZ", 1, 1000, 1000, 1000)]);
    const [v] = valuarPosiciones(pos, new Map(), { mep: 1500, ccl: 1500 });
    expect(v.valor).toBeNull();
    expect(v.pnl).toBeNull();
  });
});
