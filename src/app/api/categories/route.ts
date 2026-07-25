import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { ApiError, readJson, route } from "@/lib/http";

const TIPOS = ["gasto", "ingreso"] as const;

const categoryInput = z.object({
  nombre: z.string().min(1),
  tipo: z.enum(TIPOS),
});

export const GET = route<unknown>("GET /categories", async () => {
  const rows = await db.select().from(categories);
  return NextResponse.json(rows);
});

export const POST = route<unknown>("POST /categories", async (request) => {
  const parsed = categoryInput.safeParse(await readJson(request));
  if (!parsed.success) {
    throw new ApiError(400, "Payload inválido.", parsed.error.flatten());
  }
  const [row] = await db.insert(categories).values(parsed.data).returning();
  return NextResponse.json(row, { status: 201 });
});
