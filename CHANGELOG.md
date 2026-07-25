# Changelog

Registro cronológico de las etapas del proyecto, para seguir los cambios y avances. Una entrada por etapa (E*) o cambio transversal relevante. La planificación hacia adelante vive en `PLAN.md`; esto es el historial de lo hecho.

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
