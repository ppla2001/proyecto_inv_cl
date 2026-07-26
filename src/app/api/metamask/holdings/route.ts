import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, readJson, route } from "@/lib/http";
import { CHAINS } from "@/lib/chains";
import { holdingsValuados } from "@/lib/metamask";

const input = z.object({
  // Dirección por red (ej. { ethereum: "0x..", abstract: "0x.." }). El EOA
  // suele servir para varias redes; Abstract va aparte.
  addresses: z.record(z.string(), z.string().min(1)),
});

// Lee los holdings actuales de MetaMask (multichain) valuados en USD. Solo
// lectura on-chain, NO escribe en la base: es el preview que la pantalla
// muestra antes de que Pedro elija qué guardar.
export const POST = route<unknown>("POST /metamask/holdings", async (request) => {
  const parsed = input.safeParse(await readJson(request));
  if (!parsed.success) {
    throw new ApiError(400, "Payload inválido.", parsed.error.flatten());
  }

  const holdings = await holdingsValuados(parsed.data.addresses);
  return NextResponse.json({
    holdings,
    redes: CHAINS.map((c) => ({ red: c.red, nombre: c.nombre })),
  });
});
