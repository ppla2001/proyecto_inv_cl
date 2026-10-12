// Parser of Balanz's "Resultados del período" CSV (Report_Period_Results).
// Pure function: CSV text -> candidate holdings movements (one per lot/boleto).
// Nothing is written here; the review screen confirms (see PLAN.md).
//
// Format observed (2026-10):
//   Tipo,Ticker,Descripcion,Fecha,FechaLote,Cantidad,PrecioCompra,Gastos,Moneda,
//   Operacion,DolarMEP,DolarCCL,DolarOficial
//   Cedears,GOOGL,CEDEAR GOOGLE INC.,2026-09-03,2026-10-10,56.0,9410.0,2869.3,
//   Pesos,Boleto / 9948916 / COMPRA / 1 / GOOGL / $,1526.2,1587.53,1511.0
// `Fecha` is the trade date; `Operacion` carries the boleto number (our dedup
// key) and the side. The report brings the MEP/CCL of the trade date, which we
// keep so the cost can be shown in either dollar.

export type BalanzCandidate = {
  fecha: string; // yyyy-mm-dd (fecha de concertación)
  ticker: string;
  descripcion: string;
  tipoActivo: string; // "Cedears" | "Acciones" | "Bonos" | ...
  operacion: "compra" | "venta";
  cantidad: number;
  precio: number; // precio unitario en `moneda`
  gastos: number; // en `moneda`
  moneda: "ARS" | "USD";
  boleto: string; // nº de boleto → external_id
  dolarMep: number | null;
  dolarCcl: number | null;
  // Total con gastos: compra = pagado, venta = neto cobrado. En `moneda`.
  total: number;
  // Totales en USD a cada dólar del día (en USD = total tal cual).
  totalUsdMep: number | null;
  totalUsdCcl: number | null;
};

const COLUMNAS = [
  "Tipo", "Ticker", "Descripcion", "Fecha", "Cantidad", "PrecioCompra",
  "Gastos", "Moneda", "Operacion", "DolarMEP", "DolarCCL",
] as const;

// Quote-aware split of one CSV line (Balanz doesn't quote today, but a
// description with a comma would break a naive split).
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { cur += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === "," && !quoted) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

// "9410.0" / "9.410,50" / "1526,2" -> number. null for empty.
export function parseNumero(raw: string | undefined): number | null {
  if (raw == null || raw.trim() === "") return null;
  let s = raw.trim().replace(/\$|\s/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  if (Number.isNaN(n)) throw new Error(`Número inválido: "${raw}"`);
  return n;
}

function parseMoneda(raw: string): "ARS" | "USD" {
  const m = raw.trim().toLowerCase();
  if (m.startsWith("peso") || m === "ars" || m === "$") return "ARS";
  if (m.includes("dólar") || m.includes("dolar") || m.includes("usd") || m.includes("cable")) return "USD";
  throw new Error(`Moneda desconocida: "${raw}"`);
}

// "Boleto / 9948916 / COMPRA / 1 / GOOGL / $" -> { boleto, operacion }
export function parseOperacion(raw: string): { boleto: string; operacion: "compra" | "venta" } {
  const partes = raw.split("/").map((p) => p.trim());
  const boleto = partes[1];
  const lado = (partes[2] ?? "").toUpperCase();
  if (!boleto || !/^\d+$/.test(boleto)) throw new Error(`Operación sin nº de boleto: "${raw}"`);
  if (lado === "COMPRA") return { boleto, operacion: "compra" };
  if (lado === "VENTA") return { boleto, operacion: "venta" };
  throw new Error(`Operación desconocida (${lado || "vacía"}): "${raw}"`);
}

export function parseBalanzResultados(csv: string): BalanzCandidate[] {
  const lineas = csv.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lineas.length === 0) throw new Error("El CSV está vacío.");

  const header = splitCsvLine(lineas[0]);
  const idx = Object.fromEntries(COLUMNAS.map((c) => [c, header.indexOf(c)])) as Record<
    (typeof COLUMNAS)[number],
    number
  >;
  const faltantes = COLUMNAS.filter((c) => idx[c] < 0);
  if (faltantes.length > 0) {
    throw new Error(
      `No parece el reporte "Resultados del período" de Balanz (faltan columnas: ${faltantes.join(", ")}).`
    );
  }

  return lineas.slice(1).map((linea, i) => {
    const col = splitCsvLine(linea);
    const get = (c: (typeof COLUMNAS)[number]) => col[idx[c]] ?? "";
    try {
      const fecha = get("Fecha");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error(`Fecha inválida: "${fecha}"`);
      const cantidad = parseNumero(get("Cantidad"));
      const precio = parseNumero(get("PrecioCompra"));
      if (cantidad == null || cantidad <= 0) throw new Error("Cantidad vacía o no positiva.");
      if (precio == null || precio <= 0) throw new Error("Precio vacío o no positivo.");
      const gastos = parseNumero(get("Gastos")) ?? 0;
      const moneda = parseMoneda(get("Moneda"));
      const { boleto, operacion } = parseOperacion(get("Operacion"));
      const dolarMep = parseNumero(get("DolarMEP"));
      const dolarCcl = parseNumero(get("DolarCCL"));

      const bruto = cantidad * precio;
      const total = operacion === "compra" ? bruto + gastos : bruto - gastos;
      const aUsd = (dolar: number | null) =>
        moneda === "USD" ? total : dolar && dolar > 0 ? total / dolar : null;

      return {
        fecha,
        ticker: get("Ticker").toUpperCase(),
        descripcion: get("Descripcion"),
        tipoActivo: get("Tipo"),
        operacion,
        cantidad,
        precio,
        gastos,
        moneda,
        boleto,
        dolarMep,
        dolarCcl,
        total,
        totalUsdMep: aUsd(dolarMep),
        totalUsdCcl: aUsd(dolarCcl),
      };
    } catch (e) {
      throw new Error(`Fila ${i + 2}: ${e instanceof Error ? e.message : String(e)}`);
    }
  });
}
