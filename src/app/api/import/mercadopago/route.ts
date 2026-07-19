import { NextResponse } from "next/server";
import { z } from "zod";
import { parseMpStatement } from "@/lib/mp-parser";

const importInput = z.object({
  csv: z.string().min(1),
  selfNames: z.array(z.string()).default([]),
});

// Parsea el CSV de MP y devuelve las transacciones candidatas. NO escribe en
// la base: solo propone. La confirmación (que sí inserta) va por la pantalla
// de revisión llamando a POST /api/transactions.
export async function POST(request: Request) {
  const body = await request.json();
  const parsed = importInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const candidates = parseMpStatement(parsed.data.csv, {
      selfNames: parsed.data.selfNames,
    });
    return NextResponse.json({ candidates });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error parseando el CSV" },
      { status: 422 }
    );
  }
}
