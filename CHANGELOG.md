# Changelog

Registro cronológico de las etapas del proyecto, para seguir los cambios y avances. Una entrada por etapa (E*) o cambio transversal relevante. La planificación hacia adelante vive en `PLAN.md`; esto es el historial de lo hecho.

## E5.1 — Mercado Pago: import del PDF (app del celular)

La app de MP en el celular exporta el "Resumen de cuenta" solo en PDF; como el uso principal va a ser desde el celular, el importador ahora acepta **PDF o CSV** (mismo flujo de revisión).

- **Extracción de texto** del PDF con `unpdf` (MIT, gratis, server-side; sin OCR: el PDF trae capa de texto). `src/lib/pdf-text.ts`, reutilizable para otros PDFs (ej. Balanz).
- **Parser del texto** (`src/lib/mp-pdf.ts`, puro + tests): fecha · descripción (puede ocupar varias líneas) · ID · valor · saldo. Solo la sección en pesos; si la de dólares tiene saldo/movimientos, avisa.
- **Control de integridad:** cada fila debe cumplir saldo anterior + valor = saldo, desde el saldo inicial hasta el final del resumen. Si no cierra, no se importa nada (mensaje con la fila).
- **Misma clasificación que el CSV** (`clasificarMovimientos` compartido). Verificado: junio por PDF = junio por CSV, 52/52 filas idénticas (mismos IDs → dedup y memoria de categorías funcionan entre formatos).
- **Bug corregido (también en CSV):** MP repite el ID de la operación en su **devolución**; como el ID es la clave de dedup, la devolución se habría descartado. Ahora lleva `-dev` (y otras repeticiones `-2`, `-3`…), y la operación + su devolución se sugieren salteadas (netean cero), con nota en la revisión.
- La ruta acepta `multipart/form-data` (archivo tal cual) y mantiene el JSON anterior por compatibilidad.

Verificado con 4 resúmenes reales (jun–sep 2026, 252 movimientos, cadena de saldos OK en todos) y en ancho de celular.

## E8 — Balanz: import CSV + posición valuada (MEP/CCL)

Cambio de plan (12-10-2026): Binance pasa a bonus al final; Balanz entra por CSV y **se elimina la etapa de OCR** (los exports de Balanz son CSV o PDF con texto).

- **Importador "Resultados del período"** (`src/lib/balanz-parser.ts`, puro + tests): cada compra/venta → `holdings_movements` con costo total en ARS (precio × cantidad + gastos), y el **MEP y CCL del día de la operación** que trae el propio reporte. Dedup por **nº de boleto** (`external_id`, unique por cuenta). Pantalla de revisión en `/balanz` con duplicados marcados como "ya importado". Soporta BOM y `\r\n` del archivo real.
- **Posición** (`src/lib/balanz.ts`, puro + tests): costo promedio ponderado; una venta baja el costo proporcional y registra la ganancia realizada; error claro si una venta supera la tenencia (falta importar una compra).
- **Precios por API gratis:** data912 (`src/lib/data912.ts`, sin key) — verificado: precios idénticos a los del PDF de Balanz.
- **Toggle USD MEP / USD CCL / ARS:** el costo usa el dólar del día de cada compra; el valor, el de hoy. **CCL** agregado como tipo de dólar en toda la app (también en el selector del dashboard).
- **"Actualizar":** refresca MEP/CCL desde ArgentinaDatos (`src/lib/cotizaciones-sync.ts`, compartido con el seed — las cotizaciones estaban cortadas en julio) y guarda el snapshot del día (uno por día). `holdings_snapshots.valor_ars` nuevo para poder reconvertir.
- Migración 0008: `holdings_movements` (+ `valor_ars`, `gastos`, `dolar_mep`, `dolar_ccl`, `external_id` + índice único) y `holdings_snapshots.valor_ars`.

- **Desglose** (pedido tras comparar con la app de Balanz): tabla del total en USD según cada cotización de hoy (ArgentinaDatos venta/compra/promedio, implícita en bonos AL30 vía data912, y **manual** para cargar la de Balanz), y costo/resultado **con y sin gastos** en ARS, USD MEP y USD CCL. Selectores "Dólar de hoy" y "Costo" que aplican a toda la vista. Hallazgo: Balanz usa cotización propia (MEP 1.533,45 / cable 1.601,67), que no coincide con ninguna fuente pública; con la manual el total cierra con el de Balanz salvo el efectivo de la cuenta (~US$ 1,9).

Verificado con el reporte real: 9 compras importadas → 125 SPY, 110 GOOGL, 34 MSFT, 53 NVDA, 2 MU, 62 VST; valor en ARS idéntico al PDF de posición; costo US$ 4.064,56 → valor US$ 4.395,99 (+8,2%) a MEP; reimport = 9 duplicados. **Pendiente:** depósitos/retiros (cuenta corriente), efectivo de la cuenta, FCI.

## E7.3 — MetaMask: precios de tokens (DexScreener) + valuación de NFTs (OpenSea)

Cierra los dos huecos de valuación que quedaban: tokens que CoinGecko no cubre y NFTs sin precio.

- **Fallback de precio de tokens (`src/lib/dexscreener.ts`):** los tokens sin precio en CoinGecko (típicamente de Abstract) se completan con DexScreener (gratis, sin key), que toma el precio de pools de DEX. Cuidados de calidad: solo pares donde nuestro token es el `baseToken` (si es el quote, el `priceUsd` es del otro token → valores absurdos), liquidez mínima, y stablecoins forzadas a $1. Se corre como segunda pasada en `holdingsValuados` y `revaluarTokens`. Verificado en la wallet real: gugo, GOONER, KONA, grind, ABSTER, USDC.e, etc. quedan valuados; el spam sin liquidez sigue en “sin precio”.
- **Valuación de NFTs (`src/lib/opensea.ts`):** por colección, **floor price** (`/collections/{slug}/stats`) y **mejor oferta** de colección (`/offers/collection/{slug}`, parseando órdenes Seaport → precio por item). Ambos a USD (floor en ETH × precio ETH; ofertas en WETH/stables conocidas por red). Los identificadores de red de OpenSea coinciden con los nuestros (ethereum/arbitrum/polygon/abstract), sin mapeo. La oferta puede quedar en “—” en redes cuyo token de pago no reconocemos (el floor no se ve afectado).
- **Selección de base:** el usuario elige valuar los NFTs a **floor** (default, el más relevante) o a **mejor oferta** desde la vista; el patrimonio total se recalcula. Floor y oferta se estampan en `tracked_assets` (`floor_usd`, `oferta_usd`) al sincronizar, así la vista no re-consulta OpenSea al abrir.
- **Wiring:** `POST /metamask/sync` y `POST /metamask/tracked` revalúan también los NFTs (`revaluarNfts`); `GET /metamask/current` agrupa NFTs por colección y devuelve totales por base. La vista suma **tokens + NFTs (base elegida)** como patrimonio MetaMask.
- Tests nuevos de la lógica pura de OpenSea (conversión de floor, parseo de ofertas Seaport, mejor oferta, tokens de pago desconocidos).

Verificado end-to-end con wallets reales. **Pendiente:** historial de movimientos on-chain con costo base manual → PnL (próxima slice); NFT value en el patrimonio del dashboard principal (E12).

## E7.2 — MetaMask: sync rápido + vista de holdings

Uso diario del MetaMask ya configurado (pedido por Pedro, opción #3A: snapshot al sincronizar; el diario automático real llega en el deploy).

- **Vista de holdings** (`/metamask` modo "ver"): al abrir muestra lo guardado — tokens valuados (último snapshot) + NFTs — sin re-escanear. Botón **"Reconfigurar watchlist"** para volver al escaneo/curación.
- **Botón "Actualizar" (sync):** revalúa **solo la watchlist** (balance puntual de cada token + precio), sin re-descubrir con `tokentx`. ~4s vs ~47s del escaneo completo. `POST /api/metamask/sync`.
- **Dedup de snapshots por día:** al sincronizar (y al guardar la watchlist) se borran los snapshots on-chain del día antes de reinsertar → una foto por día por cuenta. Arregla los duplicados previos.
- **Persistencia de direcciones:** EOA + Abstract se guardan en la cuenta (`identificador_externo` como JSON, compat. hacia atrás) para poder re-sincronizar sin re-tipear. `decimals` de los tokens se guardan en la watchlist (necesario para formatear balances como USDC=6).
- `GET /api/metamask/current` (último snapshot + NFTs de la watchlist).

Verificado end-to-end: sync en 3.8s, dedup (de US$975 duplicado a US$487.70 real), vista con tokens + NFTs. **Pendiente:** floor price NFTs (OpenSea), movimientos on-chain, cron diario (deploy).

## E7.1 — MetaMask: watchlist con descubrimiento + curación

Rediseño del flujo pedido por Pedro: al configurar una cuenta MetaMask, escanea TODAS las redes trayendo **todos los tokens y NFTs**, se curan una sola vez (se filtra el spam), y los elegidos quedan como "watchlist" de la cuenta.

- **NFTs vía Etherscan (gratis):** se reconstruye la tenencia actual desde el historial de transfers (`tokennfttx` ERC-721 + `token1155tx` ERC-1155; el endpoint de inventario directo es PRO/pago). Verificado: 4 NFTs reales en Ethereum (The Plague, Good Vibes Club, LilPudgys) + 139 en Abstract (mayoría spam).
- **Curación:** tokens con precio pre-marcados (el spam sin cotización se oculta); NFTs **agrupados por colección** (49 colecciones para 139 NFTs) para poder elegir las reales sin scroll infinito.
- **Modelo:** tabla `tracked_assets` (watchlist por cuenta: token/nft, red, contrato, tokenId). Guardar = reemplaza la watchlist de la cuenta **y** guarda un snapshot de los tokens elegidos (atómico). Los NFTs quedan trackeados sin valuar (floor price = E7b/OpenSea).
- **Pantalla `/metamask`** rediseñada: direcciones → escanear → curar (tokens + colecciones NFT) → guardar. Muestra la watchlist actual si ya existe.

Verificado end-to-end con wallets reales: escaneo (~47s), curación, guardado de 4 tokens + 4 NFTs + snapshots. **Pendiente:** historial de movimientos on-chain y dedup de snapshots por día (refinamiento menor).

## E7 — Integración MetaMask (on-chain, multichain)

Primera integración por API (dirección MetaMask-first: MP/Balanz/Binance quedan por CSV). Lee holdings on-chain de una dirección pública y los guarda como `holdings_snapshots`. Solo lectura.

- **Fuente:** Etherscan V2 (un API key, multichain por `chainId`) para balances nativos + ERC-20; **CoinGecko** (gratis, sin key) para precios USD. Config de redes en `src/lib/chains.ts` (Ethereum, Arbitrum, Polygon, Abstract). **Base quedó afuera**: no está en el free tier de Etherscan (costo cero).
- **Multi-dirección:** el EOA sirve para Ethereum/Arbitrum/Polygon; Abstract usa dirección aparte (native account abstraction). La pantalla toma ambas.
- **Filtro de spam por precio:** los tokens scam (airdrops) no cotizan en CoinGecko → se marcan "sin precio" y no suman al patrimonio (en la wallet de prueba: 4 activos con precio vs 41 spam).
- **Rate limit:** el free tier de Etherscan es ~2-3 req/s; el cliente espacia llamadas y reintenta con backoff.
- **Schema:** `holdings_snapshots.red` (chain) para distinguir USDC-en-Arbitrum de USDC-en-otra-red.
- **Flujo:** pantalla `/metamask` → traer holdings (preview valuado, sin escribir) → elegir qué guardar → snapshot. `POST /api/metamask/holdings` (preview) es solo lectura.
- **Pendiente (E7b):** NFTs vía OpenSea (owned + floor price), cuando esté la API key.

Verificado end-to-end con wallets reales: 4 holdings valuados (USDC 483.83 en Arbitrum + ETH/POL) = US$487.71, snapshot guardado. 8 tests nuevos (formatUnits, valuación/filtrado de spam).

## E6.7b — Pulido UX (modal cuentas, dólar, date picker)

- Cuentas: botones chicos en la tabla; editar abre modal (ya no reusa el form de alta).
- Dólar: muestra compra y venta; se elige compra / venta / promedio para el cálculo.
- Período: date picker estilo ClickUp (presets laterales + calendario con rango).

## E6.7 — UX del dashboard e import

Mejoras de experiencia pedidas tras probar el shell:
- Import: memoria de clasificación por descripción (reusa categoría/tipo/destino de imports previos en la misma cuenta).
- Cuentas: editar y eliminar (`PATCH`/`DELETE /api/accounts/:id`).
- Dashboard: selector de período (mes / día / rango + presets), selector de tipo de dólar (MEP/blue/oficial/cripto) con cotización de referencia visible en USD, gastos sin categoría en el desglose.
- Docs actualizados.

## E6.6 — Shell de UI

Primera capa de diseño e interfaz sobre el MVP (sin cambiar APIs ni el modelo):
- Home (`/`) = dashboard; `/dashboard` → redirect a `/`.
- Nav sticky + `globals.css` (tokens de color, tipografía Plus Jakarta Sans, cards, tablas, forms, alerts).
- Dashboard pulido: cards de resumen, barras por categoría, labels humanos, fechas cortas, mes ← →, “Guardando…”.
- Import MP: pasos visibles, contador importar/saltear, dirección Ahorro explícita, filas dudosas.
- CRUD y error boundary alineados al mismo estilo.
- Docs: `PLAN.md`, `CHANGELOG.md`, `CLAUDE.md` actualizados.

## E6.5b — Fixes de dominio + higiene (follow-up)

Segunda ronda tras revisión de Pedro con la base ya endurecida:
- **Bug de dirección de Ahorro (dominio):** "Dinero retirado Ahorro" ahora va Ahorro→corriente (antes iba corriente→Ahorro como el reservado, así que el dashboard sumaba a ahorros cuando en realidad se sacaba). El parser expone `esAhorroSalida` y el importador invierte origen/destino para los retiros. Verificado end-to-end: reservar 500 + retirar 500 netea 0 en ahorros.
- `external_id` vacío → NULL en el import (evita colisión de varias filas sin id en el índice unique).
- La categoría sugerida por el parser ("Rendimientos MP") se autocrea si falta (tras un arranque limpio).
- Cálculo de flujo extraído a `src/lib/flujo.ts` (función pura) + 6 tests (incluida la dirección de ahorros).
- Todas las pantallas CRUD (accounts, categories, transactions, holdings) migradas a `apiFetch` con estado de error.

## E6.5 — Endurecimiento

Manejo de errores e integridad de datos, antes de sumar más integraciones. Consolidado de bugs detectados por Pedro + auditoría de Claude (9 issues únicos). Objetivo secundario: dejar una capa de errores consistente que facilite debuggear a futuro. Diseño genérico (dedupe, import bulk, error helpers reutilizables para cualquier importador CSV, no atados a MP).

- **Integridad:** `foreign_keys` ON en SQLite; validación de existencia de refs en rutas; dedupe de import por `external_id` (unique por `(cuentaId, external_id)`, se completa con el `referenceId` de la fuente); PATCH de transacciones valida reglas de negocio sobre el estado resultante.
- **Flujo:** endpoint de import bulk transaccional con reporte de duplicados/errores por fila; helper `apiFetch` en el cliente + estado de error en dashboard/import; rango de fechas del dashboard usa el último día real del mes.
- **Prolijidad:** wrapper de rutas que atrapa/loguea y devuelve `{ error: { message, details } }`; aviso cuando falta cotización en vez de convertir a 0 en silencio; error boundary de React.

## E1–E6 — Fundaciones (resumen)

- **E1** Esqueleto Next.js + TypeScript, health check.
- **E2** Datos de referencia: `exchange_rates` (MEP/blue/oficial/cripto desde 2025) e `inflation_index` (desde 1943) vía ArgentinaDatos. Seed idempotente.
- **E3** Conversión histórica ARS↔USD e inflación (`src/lib/currency.ts`) + tests.
- **E4** Modelo core: `accounts` (con `tipoCuenta`, `grupo`), `categories`, `transactions`, `holdings_snapshots`, `holdings_movements`. CRUD + UI mínima por tabla.
- **E5** Importador de Mercado Pago vía CSV "Resumen de cuenta" (MP no tiene API personal, ver `PLAN.md`). Parser puro + pantalla de revisión.
- **E6** Dashboard MVP: resumen mensual gastos/ingresos/ahorros, toggle ARS↔USD, recategorización inline. Campo `grupo` en cuentas, Ahorro como cuenta propia, multi-moneda.
