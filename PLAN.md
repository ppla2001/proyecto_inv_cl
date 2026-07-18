# Plan por etapas — Dashboard de Finanzas Personales

> PWA de costo cero para iPhone. Consolida Mercado Pago, Binance, MetaMask y Balanz.
> Responde tres preguntas: ¿a dónde va la plata?, ¿cómo rinden las inversiones vs. benchmarks?, ¿qué mirar del mercado?
> **Restricción dura: costo cero absoluto.** Sin APIs pagas de ningún tipo (incluida inferencia de IA).

**Stack:** Node + Next.js (una sola app: API routes + PWA React) · Drizzle ORM sobre SQLite (local) → Neon Postgres (deploy) · OCR local con tesseract.js · ArgentinaDatos para MEP e inflación · Binance API pública · MetaMask on-chain.

**Modo de trabajo:** desarrollo local-first en este repo, todo con Claude en Cowork. El deploy es la última etapa, después de iterar el dashboard en local. Commits locales acá; push manual de Pedro.

---

## Validación de datos (18-07-2026)

| Fuente | Endpoint | Resultado |
|---|---|---|
| Inflación mensual | `api.argentinadatos.com/v1/finanzas/indices/inflacion` | ✅ Desde **1943-03** hasta **2026-06** |
| Dólar MEP (bolsa) | `/v1/cotizaciones/dolares/bolsa` | ✅ Diario desde **2018-10-29** hasta ayer |
| MEP por fecha | `/v1/cotizaciones/dolares/bolsa/{yyyy}/{mm}/{dd}` | ✅ Probado 2026-07-17: venta 1521.9 |

**Decisión:** se almacena localmente solo MEP **desde 2025-01-01** (serie liviana, ~550 filas). Transacciones anteriores a 2025 se resuelven puntualmente con el endpoint por fecha, sin almacenar toda la serie. No existe MEP anterior a oct-2018; para eso, fallback blue/oficial o TC manual.

---

## Etapas

Cada etapa es completable en una sesión y termina con algo verificable.

### E1 — Esqueleto del repo
Next.js (TypeScript) con estructura de carpetas, `CLAUDE.md` con contexto del proyecto, `.gitignore`, README.
**Verificable:** `npm run dev` levanta y responde en localhost.

### E2 — Datos de referencia
Tablas `exchange_rates` e `inflation_index` (Drizzle + migraciones drizzle-kit). Script que descarga MEP desde 2025-01-01 e inflación desde ArgentinaDatos y los carga. Comando de actualización incremental (para correr a mano o con cron local). Lookup puntual por fecha para transacciones pre-2025.
**Verificable:** la base tiene MEP diario 2025→hoy e inflación mensual.

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

### E7 — OCR: Mercado Pago
Pipeline tesseract.js: screenshot → OCR → parser → transacciones candidatas → pantalla de revisión (nada entra sin validar). Parsers como funciones puras con fixtures de screenshots reales + tests.
**Verificable:** un screenshot real genera transacciones correctas con ≤1 corrección típica.

### E8 — OCR: Balanz
Segunda plantilla, reutilizando la interfaz de parser de E7.
**Verificable:** ídem E7.

### E9 — Cripto por API
Binance (API pública: precios históricos + valuación de holdings) y MetaMask (balances on-chain).
**Verificable:** holdings cripto valuados en USD y ARS a fecha de hoy.

### E10 — Dashboard (local)
Módulo gastos (flujo mensual, por categoría, toggle ARS⇄USD histórico) y módulo inversiones (curva de patrimonio, rendimiento por plataforma, benchmark vs. SPY e inflación). Se itera en local, en el browser de la Mac, todas las veces que haga falta.
**Verificable:** uso real durante 1–2 semanas en local antes de deployar.

### E11 — Deploy (al final de todo)
Migrar SQLite → Neon (cambio de driver/connection string + migraciones). Deploy Next.js en Vercel (primera clase, cero config). Cron de actualización de cotizaciones (Vercel Cron). PWA instalable (manifest + service worker).
**Verificable:** la app abre desde el iPhone con datos reales.

### E12 (diferida) — Módulo mercado
Watchlist y top movers vía CoinGecko/Binance. Lo último a propósito: es lo menos diferenciado.

---

## Riesgos y mitigaciones

- **Transacciones pre-2025** → lookup puntual por fecha en ArgentinaDatos; pre-2018 no hay MEP → fallback blue/oficial o TC manual.
- **ArgentinaDatos se cae/discontinúa** → las tablas locales son la fuente de verdad; la API solo alimenta la actualización. Backup del dump.
- **OCR frágil ante rediseños de apps** → parsers versionados por plantilla + pantalla de revisión siempre presente.
- **Scope creep** → E12 no se toca hasta que E11 tenga uso habitual real.
- **SQLite→Postgres** → Drizzle desde el día 1 y sin SQL crudo específico de SQLite.

## Próximo paso

E1: esqueleto del repo.
