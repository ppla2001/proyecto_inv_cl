import { sqliteTable, text, real, primaryKey, integer } from "drizzle-orm/sqlite-core";

// Cotizaciones diarias (mep/blue/oficial/cripto), almacenadas desde 2025-01-01
// en adelante para mep (ver PLAN.md); las demás desde que se agregaron.
export const exchangeRates = sqliteTable(
  "exchange_rates",
  {
    fecha: text("fecha").notNull(), // yyyy-mm-dd
    tipo: text("tipo").notNull(), // "mep" | "blue" | "oficial" | "cripto"
    compra: real("compra").notNull(),
    venta: real("venta").notNull(),
    fuente: text("fuente").notNull(), // "argentinadatos"
  },
  (table) => [primaryKey({ columns: [table.fecha, table.tipo] })]
);

// Inflación mensual (variación %), histórico completo desde 1943-03.
export const inflationIndex = sqliteTable("inflation_index", {
  mes: text("mes").primaryKey(), // yyyy-mm
  valor: real("valor").notNull(),
  fuente: text("fuente").notNull(), // "argentinadatos"
});

// Cuentas propias (plataformas + wallets). No hay flag "es mía": todo lo que
// entra acá es de Pedro por definición.
export const accounts = sqliteTable("accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nombre: text("nombre").notNull(),
  plataforma: text("plataforma").notNull(), // "mercado_pago" | "binance" | "metamask" | "balanz"
  monedaDefault: text("moneda_default").notNull(), // "ARS" | "USD" | "ETH" | etc.
  origen: text("origen").notNull(), // "manual" | "api_binance" | "api_mercadopago" | "onchain_metamask"
  identificadorExterno: text("identificador_externo"), // no sensible, ej. address de wallet
  activa: integer("activa", { mode: "boolean" }).notNull().default(true),
});
