# CLAUDE.md — Contexto del proyecto

## Qué es

Dashboard personal de finanzas e inversiones. PWA para iPhone, uso individual (Pedro). Consolida **Mercado Pago, Binance, MetaMask y Balanz** para responder: ¿a dónde va la plata?, ¿cómo rinden las inversiones vs. benchmarks (SPY, inflación)?, ¿qué mirar del mercado?

## Restricción dura

**Costo cero absoluto.** Sin APIs pagas de ningún tipo, incluida inferencia de IA. Esto no es una preferencia: elimina categorías enteras de soluciones (OCR pago, tiers pagos de DB, etc.).

## Stack

- **Next.js + TypeScript** (App Router, `src/app/`): una sola app con API routes + frontend React (PWA).
- **Drizzle ORM** sobre **SQLite** en local → **Neon Postgres** al deployar. No usar SQL crudo específico de SQLite.
- **Ingesta: preferir API oficial sobre OCR siempre que sea gratis.** OCR con tesseract.js queda para lo que no tiene API (Balanz) y como fallback si una integración por API no alcanza (a confirmar con Mercado Pago, ver `PLAN.md` E5).
- **ArgentinaDatos** (`api.argentinadatos.com`, MIT): dólar MEP/blue/oficial/cripto (`/v1/cotizaciones/dolares/{casa}`) e inflación (`/v1/finanzas/indices/inflacion`, mensual desde 1943). Se almacena MEP desde 2025-01-01; fechas anteriores se resuelven con el endpoint por fecha `/bolsa/{yyyy}/{mm}/{dd}`.
- **Binance**: API pública para precios + API key de solo lectura (gratis) para balances/historial propio.
- **MetaMask**: on-chain vía Etherscan API (free tier) para balance actual e historial de tx. El balance histórico en fecha pasada es función paga de Etherscan — se reconstruye con `holdings_snapshots` propios en vez de pagarlo.
- **Mercado Pago**: API oficial (`POST /v1/account/settlement_report`, OAuth de la cuenta personal) — cobertura sin confirmar todavía, ver `PLAN.md` E5.
- **Credenciales de API** (Binance, MP, Etherscan) siempre en `.env.local`, nunca en la base de datos ni en el repo.
- Deploy final: **Vercel + Neon** (E12, al final de todo, después de iterar en local).

## Principios de diseño

1. **Model-data-first**: modelo de datos e ingesta antes que UI.
2. **Transferencias internas son críticas**: `transactions.tipo` ∈ {gasto_real, ingreso_real, transferencia_interna}. Un flujo MP → Binance → MetaMask no es gasto ni ganancia. Una transferencia a un tercero (no una cuenta propia) sí es `gasto_real`. El conciliador solo *sugiere*; la clasificación se confirma a mano.
3. **Nada entra a la base sin validación humana**: todo parse de OCR pasa por pantalla de revisión.
4. **Simplicidad sobre features**: pocas cosas que funcionen de manera confiable.
5. Las tablas locales son la fuente de verdad; las APIs externas solo alimentan actualizaciones.
6. **Patrimonio vs. movimiento son cosas separadas**: `transactions` responde "¿a dónde va la plata?" (incluye tarjetas de crédito como cuentas `pasivo` — comprar es `gasto_real` en el momento, pagar el resumen es `transferencia_interna`). `holdings_snapshots` + `holdings_movements` responden "¿cómo rinden las inversiones?" (valor actual vs. costo base). Un swap dentro de una misma cuenta (ej. ARS→BTC en Binance) no es una `transaction`, solo un `holdings_movement`.

## Plan

Ver `PLAN.md` — etapas E1 a E13, cada una con criterio verificable. Estado actual: **E1-E3 completadas**, **E4 en curso** (modelo core, por slices).

## Convenciones

- Código y comentarios en inglés; UI y docs en español.
- Commits chicos y descriptivos en español.
- Tests para lógica pura (conversión de moneda, parsers OCR, conciliador).
