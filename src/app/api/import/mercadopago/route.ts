import { NextResponse } from "next/server";
import { z } from "zod";
import { parseMpStatement } from "@/lib/mp-parser";
import { ApiError, readJson, route } from "@/lib/http";

const importInput = z.object({
  csv: z.string().min(1),
  selfNames: z.array(z.string()).default([]),
});

// Parsea el CSV de MP y devuelve las transacciones candidatas. NO escribe en
// la base: solo propone. La confirmación (que sí inserta) va por
// POST /api/import/confirm.
export const POST = route<unknown>("POST /import/mercadopago", async (request) => {
  const parsed = importInput.safeParse(await readJson(request));
  if (!parsed.success) {
    throw new ApiError(400, "Payload inválido.", parsed.error.flatten());
  }

  try {
    const candidates = parseMpStatement(parsed.data.csv, {
      selfNames: parsed.data.selfNames,
    });
    return NextResponse.json({ candidates });
  } catch (err) {
    throw new ApiError(422, err instanceof Error ? err.message : "Error parseando el CSV.");
  }
});
