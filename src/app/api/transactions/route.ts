import { NextResponse } from "next/server";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { transactions } from "@/db/schema";
import { readJson, route } from "@/lib/http";
import { parseTransactionInput } from "@/lib/transactions";

export const GET = route<unknown>("GET /transactions", async (request) => {
  const params = new URL(request.url).searchParams;
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
});

export const POST = route<unknown>("POST /transactions", async (request) => {
  const data = parseTransactionInput(await readJson(request));
  const [row] = await db.insert(transactions).values(data).returning();
  return NextResponse.json(row, { status: 201 });
});
