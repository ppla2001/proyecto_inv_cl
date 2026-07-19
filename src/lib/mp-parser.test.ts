import { describe, expect, it } from "vitest";
import { parseFechaAr, parseMontoAr, parseMpStatement } from "@/lib/mp-parser";

// Fixture anonimizado con el mismo formato que el CSV real de MP, cubriendo
// cada tipo de movimiento. Nombres y montos inventados.
const CSV = `INITIAL_BALANCE;CREDITS;DEBITS;FINAL_BALANCE
1.000,00;5.000,00;-3.000,00;3.000,00

RELEASE_DATE;TRANSACTION_TYPE;REFERENCE_ID;TRANSACTION_NET_AMOUNT;PARTIAL_BALANCE
01-06-2026;Rendimientos ;1000000000001;937,71;1.937,71
01-06-2026;Dinero reservado Ahorro;1000000000002;-1.937,71;0,00
02-06-2026;Transferencia recibida JUAN PEREZ;1000000000003;2.000,00;2.000,00
03-06-2026;Transferencia enviada Carlos Gomez;1000000000004;-500,00;1.500,00
04-06-2026;Transferencia enviada PEDRO TESTER;1000000000005;-300,00;1.200,00
05-06-2026;Pago con QR CAFETERIA;1000000000006;-200,00;1.000,00
06-06-2026;Pago automático Tarjeta de crédito;1000000000007;-150,00;850,00
07-06-2026;Dinero retirado Ahorro;1000000000008;500,00;1.350,00
`;

describe("parseMontoAr", () => {
  it("parsea formato argentino con miles y decimales", () => {
    expect(parseMontoAr("2.540.000,00")).toBe(2540000);
    expect(parseMontoAr("-240.000,00")).toBe(-240000);
    expect(parseMontoAr("937,71")).toBe(937.71);
  });
});

describe("parseFechaAr", () => {
  it("convierte dd-mm-yyyy a yyyy-mm-dd", () => {
    expect(parseFechaAr("01-06-2026")).toBe("2026-06-01");
  });
});

describe("parseMpStatement", () => {
  const candidatas = parseMpStatement(CSV, { selfNames: ["PEDRO TESTER"] });

  it("ignora el bloque de resumen y parsea solo los movimientos", () => {
    expect(candidatas).toHaveLength(8);
  });

  it("monto siempre positivo, fecha normalizada", () => {
    const enviada = candidatas.find((c) => c.descripcion.includes("Carlos Gomez"))!;
    expect(enviada.monto).toBe(500);
    expect(enviada.fecha).toBe("2026-06-03");
  });

  it("rendimientos -> ingreso_real con categoría propia", () => {
    const r = candidatas.find((c) => c.descripcion === "Rendimientos")!;
    expect(r.tipoSugerido).toBe("ingreso_real");
    expect(r.categoriaSugerida).toBe("Rendimientos MP");
  });

  it("transferencia recibida de un tercero -> ingreso_real", () => {
    const t = candidatas.find((c) => c.descripcion.includes("JUAN PEREZ"))!;
    expect(t.tipoSugerido).toBe("ingreso_real");
  });

  it("transferencia enviada a un tercero -> gasto_real", () => {
    const t = candidatas.find((c) => c.descripcion.includes("Carlos Gomez"))!;
    expect(t.tipoSugerido).toBe("gasto_real");
  });

  it("transferencia a nombre propio -> transferencia_interna", () => {
    const t = candidatas.find((c) => c.descripcion.includes("PEDRO TESTER"))!;
    expect(t.tipoSugerido).toBe("transferencia_interna");
  });

  it("pago con QR -> gasto_real", () => {
    const p = candidatas.find((c) => c.descripcion.includes("CAFETERIA"))!;
    expect(p.tipoSugerido).toBe("gasto_real");
  });

  it("pago automático de tarjeta -> transferencia_interna marcada como pago tarjeta", () => {
    const p = candidatas.find((c) => c.descripcion.includes("Tarjeta"))!;
    expect(p.tipoSugerido).toBe("transferencia_interna");
    expect(p.esPagoTarjeta).toBe(true);
  });

  it("movimientos de ahorro -> transferencia_interna marcada como ahorro (no ignorar)", () => {
    const reservado = candidatas.find((c) => c.descripcion.includes("reservado"))!;
    const retirado = candidatas.find((c) => c.descripcion.includes("retirado"))!;
    expect(reservado.tipoSugerido).toBe("transferencia_interna");
    expect(reservado.esAhorro).toBe(true);
    expect(reservado.ignorarPorDefecto).toBe(false);
    expect(retirado.esAhorro).toBe(true);
  });
});
