import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, readJson, route } from "@/lib/http";
import { CHAINS } from "@/lib/chains";
import { descubrir } from "@/lib/metamask";

const input = z.object({
  addresses: z.record(z.string(), z.string().min(1)),
});

// Escanea TODAS las redes con dirección y trae todos los tokens (valuados) y
// NFTs poseídos, para que Pedro cure la watchlist. Solo lectura, no escribe.
export const POST = route<unknown>("POST /metamask/discover", async (request) => {
  const parsed = input.safeParse(await readJson(request));
  if (!parsed.success) {
    throw new ApiError(400, "Payload inválido.", parsed.error.flatten());
  }

  const { tokens, nfts } = await descubrir(parsed.data.addresses);
  return NextResponse.json({
    tokens,
    nfts,
    redes: CHAINS.map((c) => ({ red: c.red, nombre: c.nombre })),
  });
});
