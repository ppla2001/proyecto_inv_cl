# Changelog

Registro cronológico de las etapas del proyecto, para seguir los cambios y avances. Una entrada por etapa (E*) o cambio transversal relevante. La planificación hacia adelante vive en `PLAN.md`; esto es el historial de lo hecho.

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
