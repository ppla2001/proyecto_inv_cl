import { NextResponse } from "next/server";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { holdingsMovements } from "@/db/schema";
import { ApiError, readJson, route } from "@/lib/http";

const TIPOS = ["compra", "venta"] as const;

const movementInput = z.object({
  cuentaId: z.number().int(),
  fecha: z.string().min(1),
  activo: z.string().min(1),
  tipo: z.enum(TIPOS),
  cantidad: z.number().positive(),
  precioUnitario: z.number().positive(),
  moneda: z.string().min(1),
  valorUsd: z.number(),
  fuente: z.string().min(1),
});

export const GET = route<unknown>("GET /holdings-movements", async (request) => {
  const cuentaId = new URL(request.url).searchParams.get("cuentaId");
  const rows = await db
    .select()
    .from(holdingsMovements)
    .where(cuentaId ? eq(holdingsMovements.cuentaId, Number(cuentaId)) : undefined)
    .orderBy(desc(holdingsMovements.fecha));
  return NextResponse.json(rows);
});

export const POST = route<unknown>("POST /holdings-movements", async (request) => {
  const parsed = movementInput.safeParse(await readJson(request));
  if (!parsed.success) {
    throw new ApiError(400, "Payload inválido.", parsed.error.flatten());
  }
  const [row] = await db.insert(holdingsMovements).values(parsed.data).returning();
  return NextResponse.json(row, { status: 201 });
});
