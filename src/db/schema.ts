import { sqliteTable, text, real } from "drizzle-orm/sqlite-core";

// Dólar MEP diario, almacenado desde 2025-01-01 en adelante (ver PLAN.md).
export const exchangeRates = sqliteTable("exchange_rates", {
  fecha: text("fecha").primaryKey(), // yyyy-mm-dd
  tipo: text("tipo").notNull(), // "mep"
  compra: real("compra").notNull(),
  venta: real("venta").notNull(),
  fuente: text("fuente").notNull(), // "argentinadatos"
});

// Inflación mensual (variación %), histórico completo desde 1943-03.
export const inflationIndex = sqliteTable("inflation_index", {
  mes: text("mes").primaryKey(), // yyyy-mm
  valor: real("valor").notNull(),
  fuente: text("fuente").notNull(), // "argentinadatos"
});
