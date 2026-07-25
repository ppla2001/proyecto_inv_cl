import { z } from "zod";
import { ApiError } from "@/lib/http";

// Validación compartida de transacciones, para que POST, PATCH y el importador
// bulk apliquen exactamente las mismas reglas.

export const TIPOS_TRANSACCION = [
  "gasto_real",
  "ingreso_real",
  "transferencia_interna",
] as const;

// Regla de negocio sobre el estado FINAL de una transacción: una transferencia
// interna necesita cuenta destino; cualquier otro tipo no debe tenerla. Lanza
// ApiError(400) si no se cumple. Sirve tanto para el alta (estado nuevo) como
// para el PATCH (estado resultante de mergear lo actual con el patch).
export function assertReglasTransaccion(estado: {
  tipo: string;
  cuentaDestinoId?: number | null;
}): void {
  if (estado.tipo === "transferencia_interna" && estado.cuentaDestinoId == null) {
    throw new ApiError(400, "cuentaDestinoId es requerido para transferencia_interna.");
  }
  if (estado.tipo !== "transferencia_interna" && estado.cuentaDestinoId != null) {
    throw new ApiError(400, "cuentaDestinoId solo es válido para transferencia_interna.");
  }
}

// Payload de alta (POST y cada fila del import bulk).
export const transactionInput = z.object({
  fecha: z.string().min(1),
  monto: z.number().positive(),
  moneda: z.string().min(1),
  cuentaId: z.number().int(),
  categoriaId: z.number().int().nullable().optional(),
  tipo: z.enum(TIPOS_TRANSACCION),
  descripcion: z.string().nullable().optional(),
  cuentaDestinoId: z.number().int().nullable().optional(),
  externalId: z.string().nullable().optional(),
});

export type TransactionInput = z.infer<typeof transactionInput>;

// Payload de edición: todo opcional (patch parcial).
export const transactionPatch = z.object({
  fecha: z.string().min(1).optional(),
  monto: z.number().positive().optional(),
  moneda: z.string().min(1).optional(),
  cuentaId: z.number().int().optional(),
  categoriaId: z.number().int().nullable().optional(),
  tipo: z.enum(TIPOS_TRANSACCION).optional(),
  descripcion: z.string().nullable().optional(),
  cuentaDestinoId: z.number().int().nullable().optional(),
});

export type TransactionPatch = z.infer<typeof transactionPatch>;

// Valida un payload de alta y devuelve los datos; lanza ApiError con detalles zod.
export function parseTransactionInput(body: unknown): TransactionInput {
  const parsed = transactionInput.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(400, "Payload inválido.", parsed.error.flatten());
  }
  assertReglasTransaccion(parsed.data);
  return parsed.data;
}
