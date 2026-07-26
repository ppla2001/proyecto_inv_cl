import { NextResponse } from "next/server";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { holdingsSnapshots } from "@/db/schema";
import { ApiError, readJson, route } from "@/lib/http";

const snapshotInput = z.object({
  cuentaId: z.number().int(),
  fecha: z.string().min(1),
  activo: z.string().min(1),
  red: z.string().nullable().optional(),
  cantidad: z.number(),
  valorUsd: z.number(),
  fuente: z.string().min(1),
});

export const GET = route<unknown>("GET /holdings-snapshots", async (request) => {
  const cuentaId = new URL(request.url).searchParams.get("cuentaId");
  const rows = await db
    .select()
    .from(holdingsSnapshots)
    .where(cuentaId ? eq(holdingsSnapshots.cuentaId, Number(cuentaId)) : undefined)
    .orderBy(desc(holdingsSnapshots.fecha));
  return NextResponse.json(rows);
});

export const POST = route<unknown>("POST /holdings-snapshots", async (request) => {
  const parsed = snapshotInput.safeParse(await readJson(request));
  if (!parsed.success) {
    throw new ApiError(400, "Payload inválido.", parsed.error.flatten());
  }
  const [row] = await db.insert(holdingsSnapshots).values(parsed.data).returning();
  return NextResponse.json(row, { status: 201 });
});
