import { describe, expect, it } from "vitest";
import { ajustar_inflacion, ars_to_usd } from "@/lib/currency";

describe("ars_to_usd", () => {
  it("convierte con la cotización local (2025-06-02, venta 1185.3)", async () => {
    const usd = await ars_to_usd(1185.3, "2025-06-02");
    expect(usd).toBeCloseTo(1, 5);
  });

  it("convierte con el lookup puntual pre-2025 (2024-03-15, venta 1031.3)", async () => {
    const usd = await ars_to_usd(1031.3, "2024-03-15");
    expect(usd).toBeCloseTo(1, 5);
  });

  it("devuelve null antes del inicio histórico del MEP (2015-01-01)", async () => {
    const usd = await ars_to_usd(100, "2015-01-01");
    expect(usd).toBeNull();
  });
});

describe("ajustar_inflacion", () => {
  it("compone la inflación hacia adelante (2025-01 -> 2025-04: 2.4%, 3.7%, 2.8%)", async () => {
    const resultado = await ajustar_inflacion(1000, "2025-01-15", "2025-04-15");
    const esperado = 1000 * 1.024 * 1.037 * 1.028;
    expect(resultado).toBeCloseTo(esperado, 5);
  });

  it("deflaciona hacia atrás (inverso del caso anterior)", async () => {
    const adelante = 1000 * 1.024 * 1.037 * 1.028;
    const resultado = await ajustar_inflacion(adelante, "2025-04-15", "2025-01-15");
    expect(resultado).toBeCloseTo(1000, 5);
  });

  it("no ajusta si desde y hasta caen en el mismo mes", async () => {
    const resultado = await ajustar_inflacion(500, "2025-03-01", "2025-03-28");
    expect(resultado).toBe(500);
  });
});
