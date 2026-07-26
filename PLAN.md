# Plan por etapas — Dashboard de Finanzas Personales

> PWA de costo cero para iPhone. Consolida Mercado Pago, Binance, MetaMask y Balanz.
> Responde tres preguntas: ¿a dónde va la plata?, ¿cómo rinden las inversiones vs. benchmarks?, ¿qué mirar del mercado?
> **Restricción dura: costo cero absoluto.** Sin APIs pagas de ningún tipo (incluida inferencia de IA).

**Stack:** Node + Next.js (una sola app: API routes + PWA React) · Drizzle ORM sobre SQLite (local) → Neon Postgres (deploy) · OCR local con tesseract.js (Balanz) · ArgentinaDatos para cotizaciones e inflación · Binance API (pública + autenticada de solo lectura) · Etherscan API para MetaMask on-chain · Mercado Pago: **sin API pública para movimientos personales** (confirmado 19-07-2026) → importador de exportación manual del panel.

**Modo de trabajo:** desarrollo local-first en este repo, todo con Claude en Cowork. El deploy es la anteúltima etapa, después de iterar el dashboard en local. Commits chicos, rama por etapa, PR contra `main`. Historial de cambios en `CHANGELOG.md` (una entrada por etapa); planificación hacia adelante acá.

**Dirección posible (a confirmar, 19-07-2026):** una primera versión con **solo MetaMask integrado por API**, y MP / Balanz / Binance todos ingeridos por CSV o similar (dejando la integración de Binance por API para más adelante). Por eso el endurecimiento de E6.5 se diseña genérico para importadores CSV, no atado a MP. Si se confirma, se reordenan E7–E8.

**Principio de ingesta:** priorizar conexiones oficiales por API sobre OCR/import manual siempre que exista una opción gratuita y con la cobertura que necesitamos. Mercado Pago no la tiene (ver validación abajo); Balanz nunca la tuvo. Ambos quedan como ingesta semi-manual (exportación/screenshot + parser + pantalla de revisión), no automatizados end-to-end.

---

## Validación de datos de referencia (18-07-2026)

| Fuente | Endpoint | Resultado |
|---|---|---|
| Inflación mensual | `api.argentinadatos.com/v1/finanzas/indices/inflacion` | ✅ Desde **1943-03** hasta **2026-06** |
| Dólar MEP (bolsa) | `/v1/cotizaciones/dolares/bolsa` | ✅ Diario desde **2018-10-29** hasta ayer |
| Dólar blue | `/v1/cotizaciones/dolares/blue` | ✅ Diario desde **2011-01-03** |
| Dólar oficial | `/v1/cotizaciones/dolares/oficial` | ✅ Diario desde **2011-01-03** |
| Dólar cripto | `/v1/cotizaciones/dolares/cripto` | ✅ Disponible (mismo formato) |
| MEP por fecha puntual | `/v1/cotizaciones/dolares/bolsa/{yyyy}/{mm}/{dd}` | ✅ Probado 2026-07-17: venta 1521.9. Confirmado que arrastra el valor del último día hábil en fines de semana/feriados (probado con 2024-03-16/17). |

**Decisión (E2, ya implementada):** se almacena localmente MEP **desde 2025-01-01** (serie liviana, ~560 filas). Transacciones anteriores a 2025 se resuelven puntualmente con el endpoint por fecha, sin almacenar toda la serie. No existe MEP anterior a oct-2018; para eso, fallback blue/oficial o TC manual.

**Pendiente (a implementar junto con E4):** agregar `blue`, `oficial` y `cripto` a la tabla `exchange_rates` (ya tiene columna `tipo` genérica, no requiere cambio de schema) y al script de seed.

## Validación de integraciones externas (18-07-2026)

| Plataforma | Vía | Costo | Cobertura | Riesgo/nota |
|---|---|---|---|---|
| **Binance** | API REST autenticada, API key de solo lectura (`enableReading: true`, sin retiros/trading) generada en la propia cuenta | Gratis, sin tier pago | Balances, historial de operaciones, depósitos y retiros | Ninguno relevante para uso personal |
| **MetaMask (on-chain)** | Etherscan API (free tier: 5 calls/seg) o RPC público | Gratis | Balance actual + historial de transacciones | **Balance histórico en fecha pasada es función PRO (paga)** → se resuelve reconstruyendo la curva con snapshots propios desde que empecemos a trackear (tabla `balance_snapshots`), no pidiéndoselo a Etherscan. Desde 01-07-2026 el free tier limita a 1000 registros por request (no debería afectar a una wallet personal). |
| **Mercado Pago** | ~~API oficial~~ — **descartada, ver veredicto abajo** | — | — | — |
| **CoinGecko** (para E13, módulo mercado diferido) | API pública | Gratis, 10.000 llamadas/mes, sin key para lo básico | Precios, 1 año de histórico | Preferido sobre CoinMarketCap (free tier de CMC: 9 endpoints, casi sin histórico, ~24x más caro en llamadas equivalentes) |

**Veredicto Mercado Pago (19-07-2026): sin API pública para movimientos de una cuenta personal.** Se probaron tres combinaciones reales contra `POST /v1/account/settlement_report` (el único endpoint documentado para "Todas las transacciones"):

| Token usado | Resultado |
|---|---|
| Access token estático de una app de Mercado Pago | 403 (prohibido) |
| Token OAuth autorizado por el usuario vía app de Mercado Pago | 404 (no encontrado) |
| Token OAuth autorizado por el usuario vía app de Mercado Libre | 404 (no encontrado) |

El endpoint existe (responde, no es un 404 de ruta inexistente) pero está pensado para vendedores liquidando cobros — no hay nada que "liquidar" en una cuenta que no vende, así que el recurso no existe para ese caso sin importar el token. En el panel de usuario (no developers) sí se pueden generar a mano "Resumen de cuenta" y "Reporte de tenencias", pero no tienen equivalente en la API pública. **Decisión: se importan manualmente** (ver E5 rediseñado más abajo) en vez de automatizar el pull.

**Decisión de credenciales:** ninguna API key/secret/token vive en la base de datos ni se commitea. Todo en `.env.local` (ya gitignoreado): `BINANCE_API_KEY`, `BINANCE_API_SECRET`, `ETHERSCAN_API_KEY`. La tabla `accounts` solo guarda identificadores no sensibles (ej. dirección pública de wallet de MetaMask).

---

## Etapas

Cada etapa es completable en una sesión y termina con algo verificable. Rama por etapa (`eN-nombre-corto`), PR contra `main`.

### E1 — Esqueleto del repo ✅
Next.js (TypeScript) con estructura de carpetas, `CLAUDE.md` con contexto del proyecto, `.gitignore`, README.
**Verificado:** `npm run dev` levanta y responde en localhost.

### E2 — Datos de referencia ✅
Tablas `exchange_rates` e `inflation_index` (Drizzle + migraciones drizzle-kit). Script que descarga MEP desde 2025-01-01 e inflación desde ArgentinaDatos y los carga. Comando de actualización incremental (`npm run db:seed`, idempotente por upsert). Lookup puntual por fecha para transacciones pre-2025 (`src/lib/mep.ts`).
**Verificado:** 563 días de MEP (2025-01-01→hoy), 1000 meses de inflación (1943-03→hoy) cargados en `local.db`.
**Pendiente sumar acá:** blue, oficial, cripto (ver tabla de validación arriba) — se hace junto con E4.

### E3 — Conversión histórica ✅
Helper `ars_to_usd(monto, fecha)` y `ajustar_inflacion(monto, desde, hasta)` en `src/lib/currency.ts`. Manejo defensivo de días sin cotización (último hábil anterior, ventana de 10 días — en la práctica la fuente ya no tiene huecos). Tests con vitest.
**Verificado:** 6 tests pasando, conversión correcta para fechas conocidas.

### E4 — Modelo core (en curso)
Implementación **escalonada por slices verticales** (schema + API + UI mínima por tabla, no todo de una vez), para poder ir probando manualmente en el browser en vez de solo con `curl`.

**Modelo de patrimonio e inversiones (definido 18-07-2026):** dos preguntas, dos mecanismos separados que no se pisan:
- *"¿A dónde va la plata?"* → `transactions`: movimiento de plata entre cuentas propias o hacia/desde el mundo exterior. Un swap dentro de una misma cuenta (ej. ARS→BTC dentro de Binance) **no** genera una fila acá — queda capturado solo por el delta entre `holdings_snapshots`.
- *"¿Cómo rinden las inversiones?"* → `holdings_snapshots` (valor actual en el tiempo) + `holdings_movements` (compras/ventas, para costo base). Rendimiento = valor actual − costo base.

Dos reglas de clasificación que resuelven casos ambiguos sin agregar tipos nuevos a `transactions`:
- **Transferencia a un tercero** (no una cuenta propia) = `gasto_real`, no `transferencia_interna`. Afecta el patrimonio neto, a diferencia de mover plata entre tus propias cuentas.
- **Tarjeta de crédito** = una `account` más, con `tipoCuenta="pasivo"` y saldo negativo. Comprar con la tarjeta = `gasto_real` sobre esa cuenta (el PN baja en el momento de la compra, no cuando se paga el resumen). Pagar el resumen = `transferencia_interna` desde la cuenta que paga hacia la tarjeta (el PN no se mueve dos veces).

- **Slice 1 — `accounts`** ✅: id, nombre, plataforma (`mercado_pago` / `binance` / `metamask` / `balanz`), tipo_cuenta (`activo` / `pasivo`, default `activo`), moneda_default, origen (`manual` / `api_binance` / `api_mercadopago` / `onchain_metamask`), identificador_externo (no sensible, ej. address de wallet), activa. + endpoints GET/POST + pantalla simple de alta/listado.
- **Slice 2 — `categories`** ✅: id, nombre, tipo (gasto/ingreso). + GET/POST + UI.
- **Slice 3 — `transactions`** ✅: id, fecha, monto, moneda, cuenta_id (FK), categoria_id (FK nullable — null en transferencias), tipo (`gasto_real` / `ingreso_real` / `transferencia_interna`), descripción, cuenta_destino_id (FK nullable, solo transferencias). GET (con filtros)/POST/PATCH/DELETE + UI de alta/edición/listado. Validación de payloads con `zod`.
- **Slice 4 — `holdings_snapshots`** ✅: id, cuenta_id (FK), fecha, activo (`ARS`/`USD`/`BTC`/ticker...), cantidad, valor_usd (normalizado al momento, no depende de re-consultar precios históricos después), fuente — log de eventos, no cron diario; se llena en cada carga manual, OCR/import (E5, E10) o consulta on-chain/API (E6-E7). GET/POST + UI simple.
- **Slice 5 — `holdings_movements`** ✅: id, cuenta_id (FK), fecha, activo, tipo (`compra`/`venta`), cantidad, precio_unitario, moneda, valor_usd (normalizado), fuente. GET/POST + UI simple.

**Verificado por slice:** alta/edición/listado real desde el browser, no solo `curl`. Probado end-to-end: gasto con tarjeta de crédito (`gasto_real` sobre cuenta `pasivo`) + pago de resumen (`transferencia_interna`); compra de cripto (`holdings_movements`) + snapshot posterior (`holdings_snapshots`) mostrando rendimiento positivo.

**E4 completo.**

### E5 — Importador Mercado Pago (exportación manual) ✅
Sin API disponible (ver veredicto arriba), la ingesta es semi-manual: Pedro descarga a mano el reporte **"Resumen de cuenta"** desde el panel de usuario de MP (no developers) y un importador lo parsea.

**Formato confirmado (19-07-2026):** el "Resumen de cuenta" se baja en **CSV** (también PDF/XLSX, pero CSV es lo que usamos — data estructurada, cero OCR). Separador `;`, números en formato AR (`2.540.000,00`), fechas `dd-mm-yyyy`. Dos bloques: un resumen inicial (`INITIAL_BALANCE;CREDITS;DEBITS;FINAL_BALANCE`) que se ignora, y el detalle (`RELEASE_DATE;TRANSACTION_TYPE;REFERENCE_ID;TRANSACTION_NET_AMOUNT;PARTIAL_BALANCE`). El signo de `TRANSACTION_NET_AMOUNT` da entrada/salida.

**Clasificación sugerida por el parser** (`src/lib/mp-parser.ts`, función pura + tests):
- `Rendimientos ...` → `ingreso_real` con categoría "Rendimientos MP". Decisión: la cuenta de MP es remunerada automáticamente; se trata como interés (ingreso), no se modela el fondo como holding — Pedro solo deja en MP plata para gastar en el mes.
- `Pago con QR ...` / `Pago <servicio>` → `gasto_real`.
- `Transferencia enviada/recibida <tercero>` → `gasto_real` / `ingreso_real`; si el nombre es propio (lista configurable de "tus nombres") → `transferencia_interna`.
- `Pago automático Tarjeta de crédito` → `transferencia_interna` hacia la cuenta `pasivo` de la tarjeta (se autoselecciona en la revisión).
- `Dinero reservado/retirado Ahorro` → plumbing del auto-invest de MP; se marca **ignorar por default** (destildado en la revisión).

**Nota sobre el PDF "Reporte de tenencias":** es el ledger del fondo (suscripción/rescate/rendimientos por cuotaparte). Se comprobó que sus `Rendimientos obtenidos` son los mismos eventos que los `Rendimientos` del CSV, y sus suscripción/rescate son el auto-invest automático (no decisiones de Pedro). Por eso **no se importa** para MP; el CSV solo alcanza.

**Flujo:** subir CSV → `POST /api/import/mercadopago` parsea (no escribe) → pantalla `/import/mercadopago` muestra candidatas con clasificación editable, permite saltar filas → confirmar inserta en `transactions`. Nada entra sin validación humana (principio de siempre).

**Verificado:** import real de junio 2026 (52 movimientos): 47 importados sin error, 21 rendimientos categorizados, pago de tarjeta como transferencia al pasivo, self-transfers detectados. Las transferencias entre cuentas propias necesitan que exista una `account` para el banco externo como destino (pendiente crear cuando haga falta).

**Deuda menor:** el import inserta fila por fila (N requests); si el volumen crece, conviene un endpoint de inserción masiva. No bloqueante para uso personal.

### E6 — Dashboard MVP (local) — reordenado 19-07-2026
Se adelanta un dashboard mínimo **antes** de las integraciones, para ver los datos reales que ya entran (los ~47 movimientos de MP de E5), validar el modelo y el flujo, y ajustar antes de invertir en Binance/MetaMask. No es el dashboard completo (eso es E12); es la primera versión para iterar.

**Fundación de datos (se agrega acá):**
- Campo `accounts.grupo` ∈ {`uso`, `ahorro`, `inversion`} (default `uso`). Clasifica cada cuenta en un bloque, base del dashboard general separado que quiere Pedro (inversiones / ahorros / gastos). MP-corriente = `uso`; Ahorro MP = `ahorro`; Binance/MetaMask/Balanz = `inversion`.
- **Ahorro MP como cuenta propia** (`grupo=ahorro`): los movimientos `Dinero reservado/retirado Ahorro` del CSV de MP dejan de ignorarse y pasan a `transferencia_interna` entre MP-corriente y Ahorro MP (Pedro aparta plata para metas específicas y quiere verlo). **Sutileza a validar con datos reales:** el retiro suele ser mayor que lo reservado por el rendimiento ganado dentro de Ahorro (ej. reservó 496.026, retiró 500.161 → ~4.100 de yield no desglosado); el saldo real de Ahorro se reconcilia con un `holdings_snapshot`, no forzando que las transferencias cierren exactas.
- **Multi-moneda:** MP también tiene cuenta en dólares (hoy sin movimientos, a futuro sí). El modelo ya lo soporta (cada `transaction` tiene su `moneda`; `holdings_snapshots` guarda saldo por `activo`). Se agrega selector de moneda (default ARS) a la pantalla de import para cuando se baje el extracto en USD.

**Dashboard MVP en sí:**
- Vista mensual de flujo: **gastaste / ingresaste / apartaste en ahorros** (esta última = transferencias netas hacia cuentas `grupo=ahorro`), con desglose por categoría y listado de movimientos.
- Toggle ARS⇄USD (conversión histórica de E3).
- **Recategorización inline** desde el dashboard: editar categoría/tipo de un movimiento ya cargado (pedido por Pedro), reusando `PATCH /api/transactions/:id`.
- Patrimonio simple por cuenta, agrupado por `grupo` (uso/ahorro/inversion) — con la data que haya.
**Verificable:** ver los movimientos reales de MP en el dashboard, recategorizar uno desde ahí, y que el resumen mensual (gastos/ingresos/ahorros) cuadre.

### E6.5 — Endurecimiento (robustez y manejo de errores) — 19-07-2026
Antes de sumar más integraciones se cierra un conjunto de gaps de robustez detectados por Pedro + auditoría de Claude (9 issues únicos consolidados). Objetivo doble: integridad de datos y una capa de errores consistente que facilite debuggear más adelante. **Diseño genérico**: dedupe, import bulk y helpers de error quedan reutilizables para cualquier importador CSV (Balanz/Binance a futuro), no atados a MP.
- **Integridad:** `foreign_keys` ON en SQLite; validación de existencia de refs (`cuentaId`/`categoriaId`/`cuentaDestinoId`) en las rutas; dedupe de import por `external_id` (columna nueva en `transactions`, unique por `(cuentaId, external_id)`, se completa con el `referenceId` de la fuente — así reimportar el mismo CSV no duplica); PATCH de `transactions` valida las reglas de negocio del POST sobre el estado resultante (merge current+patch).
- **Flujo:** endpoint de import bulk transaccional (atómico) que reporta duplicados y errores por fila; helper `apiFetch` en el cliente + estado de error en dashboard/import (no más crash silencioso); rango de fechas del dashboard usa el último día real del mes.
- **Prolijidad:** wrapper de rutas que atrapa/loguea con contexto y devuelve `{ error: { message, details } }`; aviso explícito cuando falta cotización en vez de convertir a 0 en silencio; error boundary de React (`error.tsx`).
**Verificable:** reimportar el mismo CSV no duplica; recategorizar a un estado inválido desde el dashboard se rechaza con mensaje claro; una API caída muestra error en la UI en vez de crashear.

### E6.5b — Fixes de dominio + higiene ✅
Follow-up tras revisión con la base endurecida: dirección correcta de “Dinero retirado Ahorro” (Ahorro→corriente), `external_id` vacío → NULL, autocreación de categorías sugeridas, `resumirFlujo` puro + tests, CRUD con `apiFetch`.

### E6.6 — Shell de UI (diseño e interfaz) ✅
Primera pasada de diseño sobre el MVP, sin tocar APIs ni el modelo:
- Home (`/`) = dashboard; `/dashboard` redirige a `/`.
- Layout con nav sticky (Dashboard, Importar, Cuentas, Categorías, Movimientos) + `globals.css` (tokens, tipografía Plus Jakarta Sans, superficies, tablas, alerts).
- Dashboard: resumen en cards, barras de gasto por categoría, labels humanos de tipo, fechas `dd/mm`, navegación de mes ← →, feedback “Guardando…”.
- Import MP: pasos 1–2–3, contador a importar/salteadas, hint de dirección Ahorro, filas dudosas marcadas.
- Pantallas CRUD y `error.tsx` alineadas al mismo lenguaje visual.
**Verificable:** abrir `/` se ve como app (nav + dashboard), no como páginas sueltas de debug; import y CRUD usan el mismo estilo.

### E6.7 — UX dashboard / import / cuentas ✅
- Memoria de categorías en import (`GET /api/import/hints`) por descripción normalizada.
- CRUD de cuentas: editar y eliminar.
- Dashboard: período flexible (mes, día, rango + presets), tipo de dólar seleccionable con tasa de referencia, “Sin categoría” en el desglose de gastos.
**Verificable:** reimportar una transferencia ya categorizada trae la categoría; cambiar a USD muestra MEP/blue/etc.; un gasto sin categoría aparece en el desglose.

### E6.7b — Pulido UX ✅
Modal de edición de cuentas + botones compactos; cotización con compra/venta/promedio; date picker con presets + calendario de rango.
**Verificable:** Editar cuenta abre modal; en USD se ven compra/venta y se puede elegir el precio; el período se elige como en ClickUp.

### E7 — Integración MetaMask (on-chain) ✅ — adelantada 25-07-2026
**Decisión (25-07-2026):** se confirma la dirección "MetaMask primero por API": MetaMask es la única integración por API en esta primera versión; Binance y Balanz quedan por CSV (ver E8). MetaMask es la más simple: address pública (dato no sensible, va en `accounts.identificador_externo`) + API key gratis de Etherscan en `.env.local`.

Etherscan API (free tier) para leer, de una dirección pública: balance de ETH + balances de tokens ERC-20 (se descubren desde el historial `tokentx` y se consulta el balance por contrato). Precios USD vía CoinGecko (`/simple/price` para ETH, `/simple/token_price/ethereum?contract_addresses=` para tokens — gratis, sin key). Cada activo se guarda como `holdings_snapshots` (activo, cantidad, valor_usd). La curva histórica se reconstruye con esos snapshots propios desde que arranca el tracking (el balance histórico en fecha pasada es función paga de Etherscan; no se paga).

Primera versión acotada a **holdings actuales valuados** (el lado "¿cómo rinden las inversiones?"). El historial de transacciones on-chain → `transactions` queda para después (gas, internal txs, más complejo). Flujo: pantalla que trae los holdings actuales de la wallet, los muestra, y con un botón guarda el snapshot (dato objetivo on-chain; se previsualiza antes de guardar).
**Verificable:** holdings reales de MetaMask valuados en USD a fecha de hoy, snapshot guardado.

**E7.1 (hecho, 27-07-2026):** rediseño con watchlist. Cambios sobre lo de arriba: multichain real (Ethereum/Arbitrum/Polygon/Abstract — **Base quedó afuera, no está en el free tier de Etherscan**); direcciones múltiples (EOA + Abstract aparte por account abstraction); rate-limit handling (free tier ~2-3 req/s, retry con backoff); filtro de spam por precio (los scam no cotizan). **NFTs vía Etherscan** (reconstruidos de `tokennfttx`/`token1155tx`, gratis — el inventario directo es PRO). Flujo nuevo: al configurar la cuenta se **escanean todas las redes** (todos los tokens + NFTs), se **curan** (spam filtrado, NFTs agrupados por colección), y los elegidos quedan en la tabla nueva `tracked_assets` (watchlist por cuenta). Guardar = reemplaza watchlist + snapshot de tokens; NFTs trackeados sin valuar. Verificado con wallets reales (4 tokens = US$487, 4 NFTs curados de 139).

**Pendiente (E7b):** floor price de NFTs vía OpenSea (cuando esté la API key) + historial de movimientos on-chain para el módulo inversiones + dedup de snapshots por día.

### E8 — Importadores CSV: Binance y Balanz
En vez de integrar Binance por API (diferido), y sumado a Balanz que nunca tuvo API, ambos entran por CSV/export con el mismo patrón genérico que MP (parser puro → candidatas → pantalla de revisión → confirm bulk, ya reutilizable desde E6.5). Binance permite exportar historial de operaciones/transacciones en CSV; Balanz según lo que exporte (si es solo PDF/imagen, cae al pipeline OCR de E11).
**Verificable:** un export real de Binance importado y clasificado (holdings_movements / transactions según corresponda).

### E9 — Conciliador de transferencias
Con datos reales entrando desde MP, Binance y MetaMask (E5–E8), aparea egresos/ingresos entre cuentas propias (monto ± tolerancia, ventana temporal) y sugiere clasificarlos como transferencia interna. Nada se autoclasifica sin confirmación.
**Verificable:** un flujo MP → Binance → MetaMask real queda sugerido como transferencia, no como gasto.

### E10 — UI de revisión y conciliación
Pantalla de confirmación de las sugerencias del conciliador (E9) sobre la base de la UI ya construida en E4/E6. Es la red de seguridad de lo que viene en E11 (OCR).
**Verificable:** flujo completo de confirmación de conciliaciones desde el browser.

### E11 — OCR: Balanz
Pipeline tesseract.js: screenshot → OCR → parser → transacciones candidatas → pantalla de revisión (nada entra sin validar). Parsers como funciones puras con fixtures de screenshots reales + tests.
**Verificable:** un screenshot real genera transacciones correctas con ≤1 corrección típica.

### E12 — Dashboard completo (local)
Sobre la base del MVP (E6): dashboard general con separación clara **inversiones / ahorros / gastos**, curva de patrimonio neto en el tiempo, rendimiento por plataforma, benchmark vs. SPY e inflación, módulo gastos con flujo mensual por categoría y toggle ARS⇄USD histórico. Se itera en local, en el browser de la Mac, todas las veces que haga falta.
**Verificable:** uso real durante 1–2 semanas en local antes de deployar.

### E13 — Deploy (al final de todo)
Migrar SQLite → Neon (cambio de driver/connection string + migraciones). Deploy Next.js en Vercel (primera clase, cero config). Cron de actualización de cotizaciones y sincronización de integraciones (Vercel Cron). PWA instalable (manifest + service worker). Variables de entorno (API keys) configuradas en Vercel, nunca en el repo.
**Verificable:** la app abre desde el iPhone con datos reales.

### E14 (diferida) — Módulo mercado
Watchlist y top movers vía CoinGecko (preferido sobre CoinMarketCap por mejor free tier, ver tabla de validación). Lo último a propósito: es lo menos diferenciado.

---

## Riesgos y mitigaciones

- **Mercado Pago sin API personal** → confirmado (ver validación), se resuelve con importador de exportación manual (E5); si el export no es un archivo estructurado, cae al mismo pipeline OCR de E11.
- **Etherscan free tier sin balance histórico** → se reconstruye localmente con `holdings_snapshots` propios en vez de pedirlo pago.
- **Transacciones pre-2025** → lookup puntual por fecha en ArgentinaDatos; pre-2018 no hay MEP → fallback blue/oficial o TC manual.
- **ArgentinaDatos se cae/discontinúa** → las tablas locales son la fuente de verdad; la API solo alimenta la actualización. Backup del dump.
- **OCR frágil ante rediseños de apps** → parsers versionados por plantilla + pantalla de revisión siempre presente.
- **Scope creep** → E14 no se toca hasta que E13 tenga uso habitual real.
- **SQLite→Postgres** → Drizzle desde el día 1 y sin SQL crudo específico de SQLite.
- **Credenciales de API** → todas en `.env.local`, nunca en la base ni en el repo; en deploy (E13) van como env vars de Vercel.

## Próximo paso

E7 (o confirmar si se adelanta MetaMask / CSV Binance). UX del dashboard e import (E6.7) ya cubre período flexible, tipo de dólar y memoria de categorías.
