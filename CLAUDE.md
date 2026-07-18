# CLAUDE.md — Contexto del proyecto

## Qué es

Dashboard personal de finanzas e inversiones. PWA para iPhone, uso individual (Pedro). Consolida **Mercado Pago, Binance, MetaMask y Balanz** para responder: ¿a dónde va la plata?, ¿cómo rinden las inversiones vs. benchmarks (SPY, inflación)?, ¿qué mirar del mercado?

## Restricción dura

**Costo cero absoluto.** Sin APIs pagas de ningún tipo, incluida inferencia de IA. Esto no es una preferencia: elimina categorías enteras de soluciones (OCR pago, tiers pagos de DB, etc.).

## Stack

- **Next.js + TypeScript** (App Router, `src/app/`): una sola app con API routes + frontend React (PWA).
- **Drizzle ORM** sobre **SQLite** en local → **Neon Postgres** al deployar. No usar SQL crudo específico de SQLite.
- **tesseract.js** para OCR local de screenshots (es el pipeline principal de ingesta para Mercado Pago y Balanz, no un workaround).
- **ArgentinaDatos** (`api.argentinadatos.com`, MIT): dólar MEP (`/v1/cotizaciones/dolares/bolsa`, diario desde 2018-10-29) e inflación (`/v1/finanzas/indices/inflacion`, mensual desde 1943). Se almacena MEP desde 2025-01-01; fechas anteriores se resuelven con el endpoint por fecha `/bolsa/{yyyy}/{mm}/{dd}`.
- **Binance API pública** (sin auth) para precios cripto; **MetaMask** vía consultas on-chain.
- Deploy final: **Vercel + Neon** (E11, al final de todo, después de iterar en local).

## Principios de diseño

1. **Model-data-first**: modelo de datos e ingesta antes que UI.
2. **Transferencias internas son críticas**: `transactions.type` ∈ {gasto real, ingreso real, transferencia interna}. Un flujo MP → Binance → MetaMask no es gasto ni ganancia. El conciliador solo *sugiere*; la clasificación se confirma a mano.
3. **Nada entra a la base sin validación humana**: todo parse de OCR pasa por pantalla de revisión.
4. **Simplicidad sobre features**: pocas cosas que funcionen de manera confiable.
5. Las tablas locales son la fuente de verdad; las APIs externas solo alimentan actualizaciones.

## Plan

Ver `PLAN.md` — etapas E1 a E12, cada una con criterio verificable. Estado actual: **E1 completada** (esqueleto).

## Convenciones

- Código y comentarios en inglés; UI y docs en español.
- Commits chicos y descriptivos en español. Pedro hace el push manual.
- Tests para lógica pura (conversión de moneda, parsers OCR, conciliador).
