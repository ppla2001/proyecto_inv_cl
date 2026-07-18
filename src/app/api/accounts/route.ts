import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { accounts } from "@/db/schema";

const PLATAFORMAS = ["mercado_pago", "binance", "metamask", "balanz"] as const;
const ORIGENES = [
  "manual",
  "api_binance",
  "api_mercadopago",
  "onchain_metamask",
] as const;

const accountInput = z.object({
  nombre: z.string().min(1),
  plataforma: z.enum(PLATAFORMAS),
  monedaDefault: z.string().min(1),
  origen: z.enum(ORIGENES),
  identificadorExterno: z.string().optional(),
});

export async function GET() {
  const rows = await db.select().from(accounts);
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = accountInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const [row] = await db.insert(accounts).values(parsed.data).returning();
  return NextResponse.json(row, { status: 201 });
}
