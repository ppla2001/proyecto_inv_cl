# Plan por etapas — Dashboard de Finanzas Personales

> PWA de costo cero para iPhone. Consolida Balanz, Criteria, Lemon, MetaMask, Binance y Mercado Pago.
> Responde tres preguntas: ¿a dónde va la plata?, ¿cómo rinden las inversiones vs. benchmarks?, ¿qué mirar del mercado?
> **Restricción dura: costo cero absoluto.** Sin APIs pagas de ningún tipo (incluida inferencia de IA).

**Stack:** Python + FastAPI (una sola app: API + PWA) · SQLAlchemy sobre SQLite (local) → Neon Postgres (deploy) · OCR local con Tesseract · ArgentinaDatos para MEP e inflación · Binance API pública · MetaMask on-chain.

**Modo de trabajo:** desarrollo local-first en este repo, todo con Claude en Cowork. Deploy a Vercel/Neon recién en la Etapa 9. Commits locales acá; push manual de Pedro.

---

## Validación de datos (18-07-2026)

| Fuente | Endpoint | Resultado |
|---|---|---|
| Inflación mensual | `api.argentinadatos.com/v1/finanzas/indices/inflacion` | ✅ Desde **1943-03** hasta **2026-06** |
| Dólar MEP (bolsa) | `/v1/cotizaciones/dolares/bolsa` | ✅ Diario desde **2018-10-29** hasta ayer |
| MEP por fecha | `/v1/cotizaciones/dolares/bolsa/{yyyy}/{mm}/{dd}` | ✅ Probado 2026-07-17: venta 1521.9 |

**Caveat:** no hay MEP anterior a oct-2018 (fechas previas devuelven vacío). Fallback para transacciones viejas: blue/oficial de la misma API o carga manual del TC.

---

## Etapas

Cada etapa es completable en una sesión y termina con algo verificable.

### E1 — Esqueleto del repo
Estructura de carpetas, `pyproject.toml`, FastAPI "hola mundo", `CLAUDE.md` con contexto del proyecto, `.gitignore`, README.
**Verificable:** `uvicorn` levanta y responde en localhost.

### E2 — Datos de referencia
Tablas `exchange_rates` e `inflation_index` (SQLAlchemy + migraciones Alembic). Script que descarga la serie completa de ArgentinaDatos y la carga. Comando de actualización incremental (para correr a mano o con cron local).
**Verificable:** la base tiene MEP diario 2018→hoy e inflación mensual.

### E3 — Conversión histórica
Helper `ars_to_usd(monto, fecha)` y `ajustar_inflacion(monto, desde, hasta)`. Manejo de días sin cotización (último hábil anterior). Tests.
**Verificable:** tests pasan; conversión correcta para fechas conocidas.

### E4 — Modelo core
Tablas `accounts` (cuentas propias + wallets), `transactions` (`type`: gasto real / ingreso real / transferencia interna), `categories`, `balance_snapshots`. Endpoints CRUD.
**Verificable:** alta/edición/listado de transacciones vía API.

### E5 — Conciliador de transferencias
Aparea egresos/ingresos entre cuentas propias (monto ± tolerancia, ventana temporal) y sugiere clasificarlos como transferencia interna. Nada se autoclasifica sin confirmación.
**Verificable:** un flujo MP → Binance → MetaMask cargado a mano queda como transferencia, no como gasto.

### E6 — UI mínima de carga y revisión
Pantalla web local: alta manual de transacciones, edición, confirmación de conciliaciones sugeridas. Fea pero funcional; es la red de seguridad de todo lo que viene.
**Verificable:** flujo completo carga → conciliación → confirmación desde el browser.

### E7 — OCR: primera plantilla
Pipeline Tesseract: screenshot → OCR → parser → transacciones candidatas → pantalla de revisión (nada entra sin validar). Una sola plataforma para empezar (la de layout más simple, probablemente Mercado Pago o Lemon). Parsers como funciones puras con fixtures de screenshots reales + tests.
**Verificable:** un screenshot real genera transacciones correctas con ≤1 corrección típica.

### E8 — OCR: resto de plantillas
Balanz, Criteria y la que faltó de E7. Una plantilla por sesión si hace falta.
**Verificable:** ídem E7 por plataforma.

### E9 — Cripto por API
Binance (API pública: precios históricos + valuación de holdings) y MetaMask (balances on-chain).
**Verificable:** holdings cripto valuados en USD y ARS a fecha de hoy.

### E10 — Deploy
Migrar SQLite → Neon (cambio de connection string + migraciones). Deploy FastAPI en Vercel. Cron de actualización de cotizaciones (Vercel Cron). PWA instalable (manifest + service worker).
**Verificable:** la app abre desde el iPhone con datos reales.

### E11 — Dashboard
Módulo gastos (flujo mensual, por categoría, toggle ARS⇄USD histórico) y módulo inversiones (curva de patrimonio, rendimiento por plataforma, benchmark vs. SPY e inflación).
**Verificable:** uso voluntario diario/semanal durante 2+ semanas — la métrica de éxito real.

### E12 (diferida) — Módulo mercado
Watchlist y top movers vía CoinGecko/Binance. Lo último a propósito: es lo menos diferenciado.

---

## Riesgos y mitigaciones

- **MEP pre-2018 inexistente** → fallback blue/oficial o TC manual.
- **ArgentinaDatos se cae/discontinúa** → las tablas locales son la fuente de verdad; la API solo alimenta la actualización. Backup del dump.
- **OCR frágil ante rediseños de apps** → parsers versionados por plantilla + pantalla de revisión siempre presente.
- **Scope creep** → E12 no se toca hasta que E11 tenga uso habitual real.
- **SQLite→Postgres** → SQLAlchemy desde el día 1 y sin SQL crudo específico de SQLite.

## Próximo paso

E1: esqueleto del repo.
