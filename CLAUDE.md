# CLAUDE.md — Contexto del proyecto

## Qué es

Dashboard personal de finanzas e inversiones. PWA para iPhone, uso individual (Pedro). Consolida **Mercado Pago, Binance, MetaMask y Balanz** para responder: ¿a dónde va la plata?, ¿cómo rinden las inversiones vs. benchmarks (SPY, inflación)?, ¿qué mirar del mercado?

## Restricción dura

**Costo cero absoluto.** Sin APIs pagas de ningún tipo, incluida inferencia de IA. Esto no es una preferencia: elimina categorías enteras de soluciones (OCR pago, tiers pagos de DB, etc.).

## Stack

- **Next.js + TypeScript** (App Router, `src/app/`): una sola app con API routes + frontend React (PWA).
- **Drizzle ORM** sobre **SQLite** en local → **Neon Postgres** al deployar. No usar SQL crudo específico de SQLite.
- **Ingesta: preferir API oficial sobre OCR/import manual siempre que sea gratis y cubra lo que necesitamos.** Binance y MetaMask sí tienen API gratuita utilizable. Mercado Pago y Balanz no (ver abajo) — quedan como ingesta semi-manual con pantalla de revisión.
- **ArgentinaDatos** (`api.argentinadatos.com`, MIT): dólar MEP/blue/oficial/cripto (`/v1/cotizaciones/dolares/{casa}`) e inflación (`/v1/finanzas/indices/inflacion`, mensual desde 1943). Se almacena MEP desde 2025-01-01; fechas anteriores se resuelven con el endpoint por fecha `/bolsa/{yyyy}/{mm}/{dd}`.
- **Binance**: API pública para precios + API key de solo lectura (gratis) para balances/historial propio.
- **MetaMask**: on-chain vía Etherscan API (free tier) para balance actual e historial de tx. El balance histórico en fecha pasada es función paga de Etherscan — se reconstruye con `holdings_snapshots` propios en vez de pagarlo.
- **Mercado Pago**: **sin API pública para movimientos de cuenta personal** (confirmado 19-07-2026 probando 3 combinaciones de token contra `settlement_report`, ver `PLAN.md`). Se resuelve con importador de exportación manual del panel de usuario (E5), no con integración automática.
- **Credenciales de API** (Binance, Etherscan) siempre en `.env.local`, nunca en la base de datos ni en el repo.
- Deploy final: **Vercel + Neon** (E12, al final de todo, después de iterar en local).

## Principios de diseño

1. **Model-data-first**: modelo de datos e ingesta antes que UI.
2. **Transferencias internas son críticas**: `transactions.tipo` ∈ {gasto_real, ingreso_real, transferencia_interna}. Un flujo MP → Binance → MetaMask no es gasto ni ganancia. Una transferencia a un tercero (no una cuenta propia) sí es `gasto_real`. El conciliador solo *sugiere*; la clasificación se confirma a mano.
3. **Nada entra a la base sin validación humana**: todo parse de OCR o importador de exportación manual pasa por pantalla de revisión.
4. **Simplicidad sobre features**: pocas cosas que funcionen de manera confiable.
5. Las tablas locales son la fuente de verdad; las APIs externas solo alimentan actualizaciones.
6. **Patrimonio vs. movimiento son cosas separadas**: `transactions` responde "¿a dónde va la plata?" (incluye tarjetas de crédito como cuentas `pasivo` — comprar es `gasto_real` en el momento, pagar el resumen es `transferencia_interna`). `holdings_snapshots` + `holdings_movements` responden "¿cómo rinden las inversiones?" (valor actual vs. costo base). Un swap dentro de una misma cuenta (ej. ARS→BTC en Binance) no es una `transaction`, solo un `holdings_movement`.

## Plan

Ver `PLAN.md` — etapas E1 a E14. Estado actual: **E1–E6.7b completadas**. Próximo: **E7+**. Home = dashboard (`/`).

## Convenciones

- Código y comentarios en inglés; UI y docs en español.
- Commits chicos y descriptivos en español.
- Tests para lógica pura (conversión de moneda, parsers OCR, conciliador).
- **Trazabilidad:** cada etapa deja una entrada en `CHANGELOG.md`; el plan hacia adelante en `PLAN.md`.

## Robustez y manejo de errores (desde E6.5)

- **API:** rutas envueltas en un wrapper (`src/lib/http.ts`) que atrapa excepciones, loguea con contexto y devuelve un shape uniforme `{ error: { message, details? } }`. El body se parsea con un `readJson` seguro (JSON inválido → 400, no 500 opaco). Validación de forma con `zod`; validación de existencia de FKs antes de escribir.
- **Integridad:** `foreign_keys` ON en SQLite. Import idempotente por `transactions.external_id` (unique por `(cuentaId, external_id)`): reimportar el mismo CSV no duplica. El PATCH de transacciones valida las mismas reglas de negocio que el POST sobre el estado resultante.
- **Cliente:** todo fetch pasa por `apiFetch` (`src/lib/api-client.ts`), que chequea `res.ok` y surface el error; las pantallas críticas (dashboard, import) muestran estado de error en vez de crashear o fallar en silencio.
- **Importadores CSV:** diseñados genéricos (parser puro + candidatas + pantalla de revisión + confirm bulk), reutilizables para MP/Balanz/Binance, no atados a una fuente.
