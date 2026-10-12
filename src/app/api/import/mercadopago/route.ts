import { NextResponse } from "next/server";
import { z } from "zod";
import { clasificarMovimientos, parseMpStatement, type MpCandidate } from "@/lib/mp-parser";
import { parseMpPdfText } from "@/lib/mp-pdf";
import { esPdf, textoDePdf } from "@/lib/pdf-text";
import { ApiError, readJson, route } from "@/lib/http";

const jsonInput = z.object({
  csv: z.string().min(1),
  selfNames: z.array(z.string()).default([]),
});

const MAX_BYTES = 10 * 1024 * 1024;

type Resumen = {
  formato: "pdf" | "csv";
  periodo: string | null;
  saldoInicial: number | null;
  saldoFinal: number | null;
  avisos: string[];
};

// Parsea el "Resumen de cuenta" de MP (PDF — el que exporta la app del
// celular — o CSV) y devuelve las transacciones candidatas. NO escribe en la
// base: solo propone. La confirmación va por POST /api/import/confirm.
//
// Acepta multipart/form-data (`file` + `selfNames` separado por comas) o, por
// compatibilidad, JSON `{ csv, selfNames }`.
export const POST = route<unknown>("POST /import/mercadopago", async (request) => {
  let selfNames: string[] = [];
  let candidates: MpCandidate[];
  let resumen: Resumen;

  const contentType = request.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) throw new ApiError(400, "Falta el archivo.");
      if (file.size > MAX_BYTES) throw new ApiError(413, "El archivo es demasiado grande (máx. 10 MB).");
      selfNames = String(form.get("selfNames") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const bytes = new Uint8Array(await file.arrayBuffer());
      if (esPdf(bytes)) {
        const texto = await textoDePdf(bytes);
        const r = parseMpPdfText(texto);
        candidates = clasificarMovimientos(r.movimientos, { selfNames });
        resumen = { formato: "pdf", periodo: r.periodo, saldoInicial: r.saldoInicial, saldoFinal: r.saldoFinal, avisos: r.avisos };
      } else {
        candidates = parseMpStatement(new TextDecoder().decode(bytes), { selfNames });
        resumen = { formato: "csv", periodo: null, saldoInicial: null, saldoFinal: null, avisos: [] };
      }
    } else {
      const parsed = jsonInput.safeParse(await readJson(request));
      if (!parsed.success) throw new ApiError(400, "Payload inválido.", parsed.error.flatten());
      candidates = parseMpStatement(parsed.data.csv, { selfNames: parsed.data.selfNames });
      resumen = { formato: "csv", periodo: null, saldoInicial: null, saldoFinal: null, avisos: [] };
    }
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(422, err instanceof Error ? err.message : "No se pudo leer el archivo.");
  }

  return NextResponse.json({ candidates, resumen });
});
