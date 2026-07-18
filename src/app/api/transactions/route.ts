import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { transactions } from "@/db/schema";

const TIPOS = ["gasto_real", "ingreso_real", "transferencia_interna"] as const;

const transactionInput = z
  .object({
    fecha: z.string().min(1),
    monto: z.number().positive(),
    moneda: z.string().min(1),
    cuentaId: z.number().int(),
    categoriaId: z.number().int().optional(),
    tipo: z.enum(TIPOS),
    descripcion: z.string().optional(),
    cuentaDestinoId: z.number().int().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.tipo === "transferencia_interna" && !data.cuentaDestinoId) {
      ctx.addIssue({
        code: "custom",
        path: ["cuentaDestinoId"],
        message: "Requerido para transferencia_interna",
      });
    }
    if (data.tipo !== "transferencia_interna" && data.cuentaDestinoId) {
      ctx.addIssue({
        code: "custom",
        path: ["cuentaDestinoId"],
        message: "Solo válido para transferencia_interna",
      });
    }
  });

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const cuentaId = params.get("cuentaId");
  const desde = params.get("desde");
  const hasta = params.get("hasta");

  const filtros = [
    cuentaId ? eq(transactions.cuentaId, Number(cuentaId)) : undefined,
    desde ? gte(transactions.fecha, desde) : undefined,
    hasta ? lte(transactions.fecha, hasta) : undefined,
  ].filter((f): f is NonNullable<typeof f> => f !== undefined);

  const rows = await db
    .select()
    .from(transactions)
    .where(filtros.length ? and(...filtros) : undefined)
    .orderBy(desc(transactions.fecha));

  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = transactionInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const [row] = await db.insert(transactions).values(parsed.data).returning();
  return NextResponse.json(row, { status: 201 });
}
