import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts } from "@/db/schema";
import { ApiError, readJson, route } from "@/lib/http";

const PLATAFORMAS = ["mercado_pago", "binance", "metamask", "balanz"] as const;
const TIPOS_CUENTA = ["activo", "pasivo"] as const;
const GRUPOS = ["uso", "ahorro", "inversion"] as const;
const ORIGENES = [
  "manual",
  "api_binance",
  "api_mercadopago",
  "onchain_metamask",
] as const;

const accountPatch = z.object({
  nombre: z.string().min(1).optional(),
  plataforma: z.enum(PLATAFORMAS).optional(),
  tipoCuenta: z.enum(TIPOS_CUENTA).optional(),
  grupo: z.enum(GRUPOS).optional(),
  monedaDefault: z.string().min(1).optional(),
  origen: z.enum(ORIGENES).optional(),
  identificadorExterno: z.string().nullable().optional(),
  activa: z.boolean().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route<Ctx>("PATCH /accounts/:id", async (request, { params }) => {
  const { id } = await params;
  const parsed = accountPatch.safeParse(await readJson(request));
  if (!parsed.success) {
    throw new ApiError(400, "Payload inválido.", parsed.error.flatten());
  }
  if (Object.keys(parsed.data).length === 0) {
    throw new ApiError(400, "Nada para actualizar.");
  }

  const [row] = await db
    .update(accounts)
    .set(parsed.data)
    .where(eq(accounts.id, Number(id)))
    .returning();

  if (!row) throw new ApiError(404, "Cuenta no encontrada.");
  return NextResponse.json(row);
});

export const DELETE = route<Ctx>("DELETE /accounts/:id", async (_request, { params }) => {
  const { id } = await params;
  const [row] = await db
    .delete(accounts)
    .where(eq(accounts.id, Number(id)))
    .returning();

  if (!row) throw new ApiError(404, "Cuenta no encontrada.");
  return NextResponse.json({ ok: true });
});
