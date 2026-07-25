import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/http";
import { assertReglasTransaccion } from "@/lib/transactions";

describe("assertReglasTransaccion", () => {
  it("acepta un gasto sin destino", () => {
    expect(() => assertReglasTransaccion({ tipo: "gasto_real" })).not.toThrow();
  });

  it("acepta una transferencia con destino", () => {
    expect(() =>
      assertReglasTransaccion({ tipo: "transferencia_interna", cuentaDestinoId: 4 })
    ).not.toThrow();
  });

  it("rechaza una transferencia sin destino", () => {
    expect(() =>
      assertReglasTransaccion({ tipo: "transferencia_interna", cuentaDestinoId: null })
    ).toThrow(ApiError);
  });

  it("rechaza un gasto con destino", () => {
    expect(() =>
      assertReglasTransaccion({ tipo: "gasto_real", cuentaDestinoId: 4 })
    ).toThrow(ApiError);
  });
});
