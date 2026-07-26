import { describe, expect, it } from "vitest";
import { resumirFlujo, type MovimientoFlujo } from "@/lib/flujo";

// Cuentas: 1 = MP corriente (uso), 2 = Ahorro MP (ahorro).
const grupos = new Map<number, string>([
  [1, "uso"],
  [2, "ahorro"],
]);

function mov(over: Partial<MovimientoFlujo>): MovimientoFlujo {
  return {
    tipo: "gasto_real",
    categoriaId: null,
    cuentaId: 1,
    cuentaDestinoId: null,
    montoConvertido: { ars: 0, usd: 0 },
    ...over,
  };
}

describe("resumirFlujo", () => {
  it("suma gastos e ingresos por separado", () => {
    const r = resumirFlujo(
      [
        mov({ tipo: "gasto_real", montoConvertido: { ars: 100, usd: 1 } }),
        mov({ tipo: "gasto_real", montoConvertido: { ars: 50, usd: 0.5 } }),
        mov({ tipo: "ingreso_real", montoConvertido: { ars: 200, usd: 2 } }),
      ],
      grupos
    );
    expect(r.gastos.ars).toBe(150);
    expect(r.ingresos.ars).toBe(200);
  });

  it("agrupa gastos por categoría", () => {
    const r = resumirFlujo(
      [
        mov({ tipo: "gasto_real", categoriaId: 5, montoConvertido: { ars: 100, usd: 1 } }),
        mov({ tipo: "gasto_real", categoriaId: 5, montoConvertido: { ars: 30, usd: 0.3 } }),
      ],
      grupos
    );
    expect(r.porCategoria).toEqual([{ categoriaId: 5, monto: { ars: 130, usd: 1.3 } }]);
  });

  it("incluye gastos sin categoría en el desglose", () => {
    const r = resumirFlujo(
      [
        mov({ tipo: "gasto_real", categoriaId: null, montoConvertido: { ars: 80, usd: 0.8 } }),
        mov({ tipo: "gasto_real", categoriaId: 5, montoConvertido: { ars: 20, usd: 0.2 } }),
      ],
      grupos
    );
    expect(r.gastos.ars).toBe(100);
    expect(r.porCategoria).toEqual(
      expect.arrayContaining([
        { categoriaId: null, monto: { ars: 80, usd: 0.8 } },
        { categoriaId: 5, monto: { ars: 20, usd: 0.2 } },
      ])
    );
  });

  it("reservar (corriente → ahorro) SUMA a ahorros", () => {
    const r = resumirFlujo(
      [
        mov({
          tipo: "transferencia_interna",
          cuentaId: 1,
          cuentaDestinoId: 2,
          montoConvertido: { ars: 500, usd: 5 },
        }),
      ],
      grupos
    );
    expect(r.ahorros.ars).toBe(500);
  });

  it("retirar (ahorro → corriente) RESTA de ahorros", () => {
    const r = resumirFlujo(
      [
        mov({
          tipo: "transferencia_interna",
          cuentaId: 2,
          cuentaDestinoId: 1,
          montoConvertido: { ars: 500, usd: 5 },
        }),
      ],
      grupos
    );
    expect(r.ahorros.ars).toBe(-500);
  });

  it("reservar y retirar lo mismo se netean a cero", () => {
    const r = resumirFlujo(
      [
        mov({ tipo: "transferencia_interna", cuentaId: 1, cuentaDestinoId: 2, montoConvertido: { ars: 500, usd: 5 } }),
        mov({ tipo: "transferencia_interna", cuentaId: 2, cuentaDestinoId: 1, montoConvertido: { ars: 500, usd: 5 } }),
      ],
      grupos
    );
    expect(r.ahorros.ars).toBe(0);
  });

  it("una transferencia entre cuentas no-ahorro no afecta ahorros", () => {
    const r = resumirFlujo(
      [
        mov({ tipo: "transferencia_interna", cuentaId: 1, cuentaDestinoId: 1, montoConvertido: { ars: 500, usd: 5 } }),
      ],
      grupos
    );
    expect(r.ahorros.ars).toBe(0);
  });
});
