import { NextResponse } from "next/server";
import { db } from "@/db";
import { transactions } from "@/db/schema";
import { ApiError, readJson, route } from "@/lib/http";
import {
  assertReglasTransaccion,
  transactionInput,
  type TransactionInput,
} from "@/lib/transactions";

// Confirmación de import GENÉRICA (no atada a MP): recibe filas ya resueltas
// (cuenta, tipo, categoría, destino, external_id) y las inserta. Reutilizable
// por cualquier importador CSV (MP hoy, Balanz/Binance a futuro).
//
// - Valida TODAS las filas primero (forma + reglas de negocio). Si alguna falla,
//   no inserta nada y devuelve el detalle por fila (índice + error). Atómico
//   respecto a la validación.
// - Si todas son válidas, inserta en una única transacción de DB (atómico).
// - Dedupe por (cuentaId, external_id): las filas ya presentes se saltan y se
//   cuentan como duplicadas, no se insertan de nuevo.

export const POST = route<unknown>("POST /import/confirm", async (request) => {
  const body = await readJson(request);
  if (typeof body !== "object" || body === null || !Array.isArray((body as { rows?: unknown }).rows)) {
    throw new ApiError(400, "Se espera { rows: [...] }.");
  }
  const rows = (body as { rows: unknown[] }).rows;

  // 1) Validar todo antes de tocar la base.
  const validadas: TransactionInput[] = [];
  const errores: { fila: number; error: unknown }[] = [];
  for (let i = 0; i < rows.length; i++) {
    const parsed = transactionInput.safeParse(rows[i]);
    if (!parsed.success) {
      errores.push({ fila: i, error: parsed.error.flatten() });
      continue;
    }
    try {
      assertReglasTransaccion(parsed.data);
    } catch (e) {
      errores.push({ fila: i, error: e instanceof ApiError ? e.message : String(e) });
      continue;
    }
    validadas.push(parsed.data);
  }

  if (errores.length > 0) {
    return NextResponse.json(
      { error: { message: "Hay filas inválidas; no se importó nada.", details: errores } },
      { status: 400 }
    );
  }

  // 2) Insertar atómicamente, saltando duplicados por external_id.
  const resultado = db.transaction((tx) => {
    let insertadas = 0;
    for (const data of validadas) {
      const res = tx.insert(transactions).values(data).onConflictDoNothing().run();
      if (res.changes > 0) insertadas++;
    }
    return insertadas;
  });

  return NextResponse.json(
    {
      total: validadas.length,
      insertadas: resultado,
      duplicadas: validadas.length - resultado,
    },
    { status: 201 }
  );
});
