import { describe, expect, it } from "vitest";
import {
  buildHintsByDescripcion,
  hintParaDescripcion,
  normalizarDescripcion,
} from "@/lib/category-hints";

describe("category-hints", () => {
  it("normaliza espacios y mayúsculas", () => {
    expect(normalizarDescripcion("  Transferencia enviada  Foo  ")).toBe(
      "transferencia enviada foo"
    );
  });

  it("la más reciente gana y recuerda categoría", () => {
    const map = buildHintsByDescripcion([
      {
        descripcion: "Transferencia enviada Binance",
        categoriaId: 3,
        tipo: "gasto_real",
        cuentaDestinoId: null,
      },
      {
        descripcion: "Transferencia enviada Binance",
        categoriaId: 1,
        tipo: "gasto_real",
        cuentaDestinoId: null,
      },
    ]);
    expect(hintParaDescripcion(map, "transferencia enviada binance")).toEqual({
      categoriaId: 3,
      tipo: "gasto_real",
      cuentaDestinoId: null,
    });
  });

  it("recuerda transferencias internas con destino aunque no tengan categoría", () => {
    const map = buildHintsByDescripcion([
      {
        descripcion: "Pago automático Tarjeta de crédito",
        categoriaId: null,
        tipo: "transferencia_interna",
        cuentaDestinoId: 4,
      },
    ]);
    expect(hintParaDescripcion(map, "Pago automático Tarjeta de crédito")?.cuentaDestinoId).toBe(
      4
    );
  });
});
