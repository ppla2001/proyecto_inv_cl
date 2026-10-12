import { describe, it, expect } from "vitest";
import { parseMpPdfText } from "@/lib/mp-pdf";
import { clasificarMovimientos } from "@/lib/mp-parser";

// Same shape as the text extracted from the real PDF (made-up names/ids).
const PDF = `1/2
RESUMEN DE CUENTA EN PESOS
Juan Test
CVU: 0000000000000000000000 20000000000CUIT/ CUIL:
Del 1 al 30 de septiembre de 2026Periodo:
Saldo inicial: $ 1.000,00 Entradas: $ 60.500,00
Salidas: $ -51.000,00 Saldo final: $ 10.500,00
DETALLE DE MOVIMIENTOS
Fecha Descripción ID de la
operación Valor Saldo
01-09-2026 Rendimientos 1749235010691 $ 500,00 $ 1.500,00
02-09-2026 Transferencia recibida
Ana Ejemplo 176842793044 $ 50.000,00 $ 51.500,00
02-09-2026 Pago con QR CAFE 50 MAS
S.A. 177334047213 $ -1.000,00 $ 50.500,00
2/2
Fecha Descripción ID de la
operación Valor Saldo
03-09-2026 Devolución de transferencia
enviada Ana Ejemplo 176842793044 $ -50.000,00 $ 500,00
04-09-2026 Transferencia recibida PLA
JUAN 175929031459 $ 10.000,00 $ 10.500,00
Fecha de generación: 12-10-2026
Mercado Libre S.R.L. CUIT 30-70308853-4 Av. Caseros 3039, Piso 2, CABA.
1/1
RESUMEN DE TENENCIAS EN DÓLARES
Saldo inicial: US$ 0,00 Entradas: US$ 0,00
Salidas: US$ 0,00 Saldo final: US$ 0,00
DETALLE DE MOVIMIENTOS DEL PERIODO
Fecha Descripción ID de la operación Valor Pesos usados/ recibidos Cotización del dólar Saldo`;

describe("parseMpPdfText", () => {
  it("lee período, saldos y movimientos (descripciones en varias líneas)", () => {
    const r = parseMpPdfText(PDF);
    expect(r.periodo).toBe("Del 1 al 30 de septiembre de 2026");
    expect(r.saldoInicial).toBe(1000);
    expect(r.saldoFinal).toBe(10500);
    expect(r.movimientos).toHaveLength(5);
    expect(r.movimientos[1]).toEqual({
      fecha: "2026-09-02",
      descripcion: "Transferencia recibida Ana Ejemplo",
      referenceId: "176842793044",
      montoConSigno: 50000,
    });
    // Un número corto en la descripción no se confunde con el ID.
    expect(r.movimientos[2].descripcion).toBe("Pago con QR CAFE 50 MAS S.A.");
    expect(r.movimientos[2].montoConSigno).toBe(-1000);
    expect(r.avisos).toEqual([]);
  });

  it("falla si la cadena de saldos no cierra (texto mal leído)", () => {
    const roto = PDF.replace("$ 51.500,00", "$ 51.400,00");
    expect(() => parseMpPdfText(roto)).toThrow(/saldo no cierra en la fila 2/);
  });

  it("falla si faltan movimientos para llegar al saldo final", () => {
    const sinUltima = PDF.replace(/04-09-2026 Transferencia recibida PLA\nJUAN 175929031459 \$ 10\.000,00 \$ 10\.500,00\n/, "");
    expect(() => parseMpPdfText(sinUltima)).toThrow(/no llegan al saldo final/);
  });

  it("rechaza un PDF que no es el resumen de cuenta", () => {
    expect(() => parseMpPdfText("Factura B Nro 0001")).toThrow(/Resumen de cuenta/);
  });

  it("avisa si la sección en dólares tiene saldo", () => {
    const conUsd = PDF.replace("Saldo final: US$ 0,00", "Saldo final: US$ 25,00");
    expect(parseMpPdfText(conUsd).avisos).toHaveLength(1);
  });
});

describe("clasificarMovimientos — devoluciones e IDs repetidos", () => {
  it("la devolución lleva ID propio y ambas operaciones se saltean por defecto", () => {
    const c = clasificarMovimientos(parseMpPdfText(PDF).movimientos, { selfNames: ["PLA JUAN"] });
    const original = c.find((x) => x.referenceId === "176842793044");
    const dev = c.find((x) => x.referenceId === "176842793044-dev");
    expect(original?.ignorarPorDefecto).toBe(true);
    expect(dev?.ignorarPorDefecto).toBe(true);
    expect(dev?.nota).toMatch(/Anula/);
    // El resto no se ve afectado.
    expect(c.find((x) => x.referenceId === "175929031459")?.tipoSugerido).toBe("transferencia_interna");
    expect(new Set(c.map((x) => x.referenceId)).size).toBe(c.length);
  });

  it("una repetición que no es devolución recibe sufijo y no se pierde en el dedup", () => {
    const c = clasificarMovimientos([
      { fecha: "2026-09-01", descripcion: "Pago con QR X", referenceId: "123456", montoConSigno: -10 },
      { fecha: "2026-09-01", descripcion: "Pago con QR X", referenceId: "123456", montoConSigno: -10 },
    ]);
    expect(c.map((x) => x.referenceId)).toEqual(["123456", "123456-2"]);
  });

  it("devolución sin su original en el resumen: se importa con aviso", () => {
    const [d] = clasificarMovimientos([
      { fecha: "2026-09-01", descripcion: "Devolución de transferencia enviada X", referenceId: "999999", montoConSigno: -5 },
    ]);
    expect(d.referenceId).toBe("999999-dev");
    expect(d.ignorarPorDefecto).toBe(false);
    expect(d.nota).toMatch(/no está en este resumen/);
  });
});
