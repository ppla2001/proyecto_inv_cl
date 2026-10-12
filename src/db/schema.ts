import {
  sqliteTable,
  text,
  real,
  primaryKey,
  integer,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

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

// Cuentas propias (plataformas + wallets) y pasivos (ej. tarjetas de
// crédito). No hay flag "es mía": todo lo que entra acá es de Pedro por
// definición.
export const accounts = sqliteTable("accounts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nombre: text("nombre").notNull(),
  plataforma: text("plataforma").notNull(), // "mercado_pago" | "binance" | "metamask" | "balanz"
  tipoCuenta: text("tipo_cuenta").notNull().default("activo"), // "activo" | "pasivo" (ej. tarjeta de crédito)
  grupo: text("grupo").notNull().default("uso"), // "uso" | "ahorro" | "inversion" (bloque del dashboard)
  monedaDefault: text("moneda_default").notNull(), // "ARS" | "USD" | "ETH" | etc.
  origen: text("origen").notNull(), // "manual" | "api_binance" | "api_mercadopago" | "onchain_metamask"
  identificadorExterno: text("identificador_externo"), // no sensible, ej. address de wallet
  activa: integer("activa", { mode: "boolean" }).notNull().default(true),
});

// Categorías de transacciones, separadas por tipo para no mezclar
// categorías de gasto con las de ingreso.
export const categories = sqliteTable("categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nombre: text("nombre").notNull(),
  tipo: text("tipo").notNull(), // "gasto" | "ingreso"
});

// Movimiento de plata: responde "¿a dónde va la plata?". Una compra con
// tarjeta de crédito es gasto_real sobre la cuenta de la tarjeta (pasivo);
// pagar el resumen es transferencia_interna hacia esa misma cuenta. Una
// transferencia a un tercero (no una cuenta propia) es gasto_real.
export const transactions = sqliteTable(
  "transactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    fecha: text("fecha").notNull(),
    monto: real("monto").notNull(),
    moneda: text("moneda").notNull(),
    cuentaId: integer("cuenta_id").notNull().references(() => accounts.id),
    categoriaId: integer("categoria_id").references(() => categories.id), // null en transferencias
    tipo: text("tipo").notNull(), // "gasto_real" | "ingreso_real" | "transferencia_interna"
    descripcion: text("descripcion"),
    cuentaDestinoId: integer("cuenta_destino_id").references(() => accounts.id), // solo transferencia_interna
    // Id del movimiento en la fuente externa (ej. referenceId de MP). null en
    // altas manuales. Único por cuenta → reimportar el mismo CSV no duplica.
    // (SQLite trata los NULL como distintos, así que las altas manuales no chocan.)
    externalId: text("external_id"),
  },
  (t) => [
    uniqueIndex("ux_transactions_cuenta_external").on(t.cuentaId, t.externalId),
  ]
);

// Responde "¿cómo rinden las inversiones?": valor de una posición (activo)
// en una cuenta, en un momento dado. Ya normalizado a USD para no depender
// de re-consultar precios históricos después. Una cuenta con varios activos
// (ej. Binance) tiene varias filas por fecha, una por activo.
export const holdingsSnapshots = sqliteTable("holdings_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  cuentaId: integer("cuenta_id").notNull().references(() => accounts.id),
  fecha: text("fecha").notNull(),
  activo: text("activo").notNull(), // "ARS" | "USD" | "BTC" | "ETH" | ticker...
  // Red / chain donde vive el activo (ej. "ethereum" | "arbitrum" | "base" |
  // "polygon" | "abstract"). null para holdings sin red (ej. saldos MP/manuales).
  // Permite distinguir USDC-en-Base de USDC-en-Arbitrum.
  red: text("red"),
  cantidad: real("cantidad").notNull(),
  valorUsd: real("valor_usd").notNull(),
  // Valor en ARS (para holdings que cotizan en pesos, ej. CEDEARs): permite
  // convertir a USD con el dólar que se elija (MEP/CCL) en vez de uno fijo.
  valorArs: real("valor_ars"),
  fuente: text("fuente").notNull(), // "manual" | "api_binance" | "onchain_metamask" | ...
});

// Eventos de compra/venta de un activo. Junto con holdings_snapshots permite
// calcular costo base y por lo tanto rendimiento real (no solo variación de
// snapshot a snapshot, que se confundiría con "agregaste más plata").
export const holdingsMovements = sqliteTable(
  "holdings_movements",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    cuentaId: integer("cuenta_id").notNull().references(() => accounts.id),
    fecha: text("fecha").notNull(),
    activo: text("activo").notNull(),
    tipo: text("tipo").notNull(), // "compra" | "venta"
    cantidad: real("cantidad").notNull(),
    precioUnitario: real("precio_unitario").notNull(),
    moneda: text("moneda").notNull(), // moneda en la que se pagó/cobró
    valorUsd: real("valor_usd").notNull(), // normalizado al momento del movimiento
    fuente: text("fuente").notNull(), // "manual" | "api_binance" | ...
    // Total del movimiento en ARS con gastos (compra: pagado; venta: neto
    // cobrado). null si el movimiento no fue en pesos.
    valorArs: real("valor_ars"),
    gastos: real("gastos"), // comisiones + derechos (en `moneda`)
    // Cotizaciones del día del movimiento, para mostrar el costo en USD con
    // el dólar que se elija (toggle MEP/CCL) sin depender de otra tabla.
    dolarMep: real("dolar_mep"),
    dolarCcl: real("dolar_ccl"),
    // Id en la fuente (ej. nº de boleto de Balanz). Único por cuenta →
    // reimportar el mismo reporte no duplica. null en altas manuales.
    externalId: text("external_id"),
  },
  (t) => [
    uniqueIndex("ux_holdings_movements_cuenta_external").on(t.cuentaId, t.externalId),
  ]
);

// Watchlist de activos por cuenta MetaMask: qué tokens/NFTs seguir (curados una
// sola vez al configurar la cuenta, filtrando el spam). Los syncs solo valúan
// estos. Guardar la watchlist = reemplazar las filas de la cuenta.
export const trackedAssets = sqliteTable("tracked_assets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  cuentaId: integer("cuenta_id").notNull().references(() => accounts.id),
  red: text("red").notNull(), // "ethereum" | "arbitrum" | ...
  tipo: text("tipo").notNull(), // "token" | "nft"
  activo: text("activo").notNull(), // símbolo del token o nombre de colección
  nombre: text("nombre"),
  contractAddress: text("contract_address"), // null = token nativo
  tokenId: text("token_id"), // solo NFT (bignum como string)
  decimals: integer("decimals"), // solo token
  // Última valuación conocida de la colección (solo NFT), estampada al sincronizar
  // vía OpenSea. floor = piso de venta; oferta = mejor collection offer. Ambos por
  // NFT. null = todavía sin valuar o sin dato en OpenSea.
  floorUsd: real("floor_usd"),
  ofertaUsd: real("oferta_usd"),
});
