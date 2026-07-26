import { describe, expect, it } from "vitest";
import { parsePeriodoQuery, rangoDeMes } from "@/lib/periodo";

describe("periodo", () => {
  it("rangoDeMes usa el último día real", () => {
    expect(rangoDeMes("2026-02")).toEqual({ desde: "2026-02-01", hasta: "2026-02-28" });
    expect(rangoDeMes("2026-06")).toEqual({ desde: "2026-06-01", hasta: "2026-06-30" });
  });

  it("parsea mes=", () => {
    const p = parsePeriodoQuery(new URLSearchParams("mes=2026-06"));
    expect(p).toEqual({ desde: "2026-06-01", hasta: "2026-06-30", modo: "mes" });
  });

  it("parsea desde+hasta como rango", () => {
    const p = parsePeriodoQuery(
      new URLSearchParams("desde=2026-06-01&hasta=2026-06-15&modo=rango")
    );
    expect(p.modo).toBe("rango");
    expect(p.desde).toBe("2026-06-01");
    expect(p.hasta).toBe("2026-06-15");
  });
});
