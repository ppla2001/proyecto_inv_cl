import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { categories } from "@/db/schema";

const TIPOS = ["gasto", "ingreso"] as const;

const categoryInput = z.object({
  nombre: z.string().min(1),
  tipo: z.enum(TIPOS),
});

export async function GET() {
  const rows = await db.select().from(categories);
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = categoryInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const [row] = await db.insert(categories).values(parsed.data).returning();
  return NextResponse.json(row, { status: 201 });
}
