import { describe, it, expect } from "vitest";
import {
  parseBalanzResultados,
  parseNumero,
  parseOperacion,
  splitCsvLine,
} from "@/lib/balanz-parser";

const HEADER =
  "Tipo,Ticker,Descripcion,Fecha,FechaLote,Cantidad,PrecioCompra,Gastos,Moneda,Operacion,DolarMEP,DolarCCL,DolarOficial";

// Same shape as the real export, with made-up boleto numbers.
const CSV = [
  HEADER,
  "Cedears,GOOGL,CEDEAR GOOGLE INC.,2026-09-03,2026-10-10,56.0,9410.0,2869.3,Pesos,Boleto / 111 / COMPRA / 1 / GOOGL / $,1526.2,1587.53,1511.0",
  "Cedears,SPY,CEDEAR SPDR S&P 500,2026-07-08,2026-10-10,71.0,19600.0,7577.26,Pesos,Boleto / 222 / COMPRA / 1 / SPY / $,1523.53,1564.48,1492.0",
  "",
].join("\n");

describe("parseBalanzResultados", () => {
  it("parsea compras con costo total (con gastos) y USD a MEP y CCL", () => {
    const [g, s] = parseBalanzResultados(CSV);
    expect(g).toMatchObject({
      fecha: "2026-09-03",
      ticker: "GOOGL",
      tipoActivo: "Cedears",
      operacion: "compra",
      cantidad: 56,
      precio: 9410,
      gastos: 2869.3,
      moneda: "ARS",
      boleto: "111",
      dolarMep: 1526.2,
      dolarCcl: 1587.53,
    });
    expect(g.total).toBeCloseTo(56 * 9410 + 2869.3, 6);
    expect(g.totalUsdMep).toBeCloseTo(g.total / 1526.2, 6);
    expect(g.totalUsdCcl).toBeCloseTo(g.total / 1587.53, 6);
    expect(s.ticker).toBe("SPY");
    expect(s.boleto).toBe("222");
  });

  it("en ventas el total descuenta los gastos", () => {
    const csv = [
      HEADER,
      "Cedears,SPY,CEDEAR SPDR S&P 500,2026-10-01,2026-10-10,10,21000,500,Pesos,Boleto / 333 / VENTA / 1 / SPY / $,1530,1600,1500",
    ].join("\n");
    const [v] = parseBalanzResultados(csv);
    expect(v.operacion).toBe("venta");
    expect(v.total).toBe(10 * 21000 - 500);
  });

  it("en dólares el total en USD es el mismo con ambos dólares", () => {
    const csv = [
      HEADER,
      "Cedears,SPY,CEDEAR SPDR S&P 500,2026-10-01,2026-10-10,1,15,0.5,Dólares,Boleto / 444 / COMPRA / 1 / SPYD / US$,1530,1600,1500",
    ].join("\n");
    const [d] = parseBalanzResultados(csv);
    expect(d.moneda).toBe("USD");
    expect(d.totalUsdMep).toBe(15.5);
    expect(d.totalUsdCcl).toBe(15.5);
  });

  it("rechaza un CSV que no es el reporte de resultados", () => {
    expect(() => parseBalanzResultados("Fecha,Monto\n2026-01-01,100")).toThrow(/Resultados del período/);
  });

  it("indica la fila cuando un dato es inválido", () => {
    const csv = [HEADER, "Cedears,X,X,2026-10-01,2026-10-10,0,10,0,Pesos,Boleto / 1 / COMPRA,1,1,1"].join("\n");
    expect(() => parseBalanzResultados(csv)).toThrow(/Fila 2/);
  });
});

describe("helpers", () => {
  it("parseNumero acepta punto decimal y formato AR", () => {
    expect(parseNumero("9410.0")).toBe(9410);
    expect(parseNumero("9.410,50")).toBe(9410.5);
    expect(parseNumero("")).toBeNull();
  });
  it("parseOperacion extrae boleto y lado", () => {
    expect(parseOperacion("Boleto / 9948916 / COMPRA / 1 / GOOGL / $")).toEqual({
      boleto: "9948916",
      operacion: "compra",
    });
    expect(() => parseOperacion("Boleto / x / COMPRA")).toThrow();
  });
  it("splitCsvLine respeta comillas", () => {
    expect(splitCsvLine('a,"b, c",d')).toEqual(["a", "b, c", "d"]);
  });
});
