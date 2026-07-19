# Plan por etapas — Dashboard de Finanzas Personales

> PWA de costo cero para iPhone. Consolida Mercado Pago, Binance, MetaMask y Balanz.
> Responde tres preguntas: ¿a dónde va la plata?, ¿cómo rinden las inversiones vs. benchmarks?, ¿qué mirar del mercado?
> **Restricción dura: costo cero absoluto.** Sin APIs pagas de ningún tipo (incluida inferencia de IA).

**Stack:** Node + Next.js (una sola app: API routes + PWA React) · Drizzle ORM sobre SQLite (local) → Neon Postgres (deploy) · OCR local con tesseract.js (Balanz) · ArgentinaDatos para cotizaciones e inflación · Binance API (pública + autenticada de solo lectura) · Etherscan API para MetaMask on-chain · Mercado Pago: **sin API pública para movimientos personales** (confirmado 19-07-2026) → importador de exportación manual del panel.

**Modo de trabajo:** desarrollo local-first en este repo, todo con Claude en Cowork. El deploy es la anteúltima etapa, después de iterar el dashboard en local. Commits chicos, rama por etapa, PR contra `main`.

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

### E5 — Importador Mercado Pago (exportación manual)
Sin API disponible (ver veredicto arriba), la ingesta es semi-manual: Pedro genera y descarga a mano el "Resumen de cuenta" desde el panel normal de Mercado Pago (no developers) para el período que quiera cargar, y un importador nuestro lo parsea.
- Primer paso concreto: bajar un "Resumen de cuenta" real, ver en qué formato viene (CSV/Excel/PDF) y qué columnas trae — recién ahí se sabe si hace falta un parser de archivo estructurado (si es CSV/Excel, más simple y confiable que OCR) o si termina necesitando OCR igual (si solo exporta PDF/imagen).
- El importador mapea filas del archivo a `transactions` candidatas (clasificación gasto/ingreso/transferencia sugerida, no automática) y pasa por pantalla de revisión antes de confirmar — mismo principio que el OCR de Balanz (E10): nada entra sin validación humana.
**Verificable:** un export real de Mercado Pago importado y clasificado correctamente vía la pantalla de revisión.

### E6 — Integración Binance (API)
API key de solo lectura (`.env.local`). Trae balances actuales, historial de operaciones, depósitos y retiros. Depósitos/retiros que cruzan hacia otra cuenta propia alimentan `transactions`; compras/ventas de cripto dentro de la plataforma alimentan `holdings_movements`; balances actuales alimentan `holdings_snapshots`.
**Verificable:** holdings y movimientos reales de Binance reflejados en la base.

### E7 — Integración MetaMask (on-chain)
Etherscan API (o RPC público) con la dirección pública de la wallet. Balance actual + historial de transacciones on-chain. Curva histórica se reconstruye con `holdings_snapshots` propios desde que arranca el tracking (no se paga el histórico de Etherscan PRO).
**Verificable:** holdings de MetaMask valuados en USD/ARS a fecha de hoy, snapshot guardado.

### E8 — Conciliador de transferencias
Con datos reales entrando desde MP, Binance y MetaMask (E5–E7), aparea egresos/ingresos entre cuentas propias (monto ± tolerancia, ventana temporal) y sugiere clasificarlos como transferencia interna. Nada se autoclasifica sin confirmación.
**Verificable:** un flujo MP → Binance → MetaMask real queda sugerido como transferencia, no como gasto.

### E9 — UI de revisión y conciliación
Pantalla de confirmación de las sugerencias del conciliador (E8) sobre la base de la UI ya construida en los slices de E4. Es la red de seguridad de lo que viene en E10 (OCR).
**Verificable:** flujo completo de confirmación de conciliaciones desde el browser.

### E10 — OCR: Balanz
Pipeline tesseract.js: screenshot → OCR → parser → transacciones candidatas → pantalla de revisión (nada entra sin validar). Parsers como funciones puras con fixtures de screenshots reales + tests. Si el export de Mercado Pago (E5) resultó ser PDF/imagen en vez de CSV/Excel, se reutiliza este mismo pipeline para MP con su propia plantilla de parser.
**Verificable:** un screenshot real genera transacciones correctas con ≤1 corrección típica.

### E11 — Dashboard (local)
Módulo gastos (flujo mensual, por categoría, toggle ARS⇄USD histórico) y módulo inversiones (curva de patrimonio, rendimiento por plataforma, benchmark vs. SPY e inflación). Se itera en local, en el browser de la Mac, todas las veces que haga falta.
**Verificable:** uso real durante 1–2 semanas en local antes de deployar.

### E12 — Deploy (al final de todo)
Migrar SQLite → Neon (cambio de driver/connection string + migraciones). Deploy Next.js en Vercel (primera clase, cero config). Cron de actualización de cotizaciones y sincronización de integraciones (Vercel Cron). PWA instalable (manifest + service worker). Variables de entorno (API keys) configuradas en Vercel, nunca en el repo.
**Verificable:** la app abre desde el iPhone con datos reales.

### E13 (diferida) — Módulo mercado
Watchlist y top movers vía CoinGecko (preferido sobre CoinMarketCap por mejor free tier, ver tabla de validación). Lo último a propósito: es lo menos diferenciado.

---

## Riesgos y mitigaciones

- **Mercado Pago sin API personal** → confirmado (ver validación), se resuelve con importador de exportación manual (E5); si el export no es un archivo estructurado, cae al mismo pipeline OCR de E10.
- **Etherscan free tier sin balance histórico** → se reconstruye localmente con `holdings_snapshots` propios en vez de pedirlo pago.
- **Transacciones pre-2025** → lookup puntual por fecha en ArgentinaDatos; pre-2018 no hay MEP → fallback blue/oficial o TC manual.
- **ArgentinaDatos se cae/discontinúa** → las tablas locales son la fuente de verdad; la API solo alimenta la actualización. Backup del dump.
- **OCR frágil ante rediseños de apps** → parsers versionados por plantilla + pantalla de revisión siempre presente.
- **Scope creep** → E13 no se toca hasta que E12 tenga uso habitual real.
- **SQLite→Postgres** → Drizzle desde el día 1 y sin SQL crudo específico de SQLite.
- **Credenciales de API** → todas en `.env.local`, nunca en la base ni en el repo; en deploy (E12) van como env vars de Vercel.

## Próximo paso

E5 — bajar un "Resumen de cuenta" real de Mercado Pago (panel de usuario) para ver el formato exacto (CSV/Excel/PDF) y diseñar el importador según eso.
