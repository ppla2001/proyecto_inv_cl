import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { holdingsSnapshots, trackedAssets } from "@/db/schema";
import { ApiError, route } from "@/lib/http";

// Holdings actuales de una cuenta MetaMask: el último snapshot on-chain (tokens
// valuados) + los NFTs de la watchlist. Lo que se muestra al abrir la app.
export const GET = route<unknown>("GET /metamask/current", async (request) => {
  const cuentaIdParam = new URL(request.url).searchParams.get("cuentaId");
  if (!cuentaIdParam) throw new ApiError(400, "Falta cuentaId.");
  const cuentaId = Number(cuentaIdParam);

  // Fecha del snapshot más reciente para la cuenta (dedup por día → una fila por token).
  const ultimo = await db
    .select({ fecha: holdingsSnapshots.fecha })
    .from(holdingsSnapshots)
    .where(
      and(
        eq(holdingsSnapshots.cuentaId, cuentaId),
        eq(holdingsSnapshots.fuente, "onchain_metamask")
      )
    )
    .orderBy(desc(holdingsSnapshots.fecha))
    .limit(1)
    .get();

  const tokens = ultimo
    ? await db
        .select()
        .from(holdingsSnapshots)
        .where(
          and(
            eq(holdingsSnapshots.cuentaId, cuentaId),
            eq(holdingsSnapshots.fuente, "onchain_metamask"),
            eq(holdingsSnapshots.fecha, ultimo.fecha)
          )
        )
    : [];

  const nfts = await db
    .select()
    .from(trackedAssets)
    .where(and(eq(trackedAssets.cuentaId, cuentaId), eq(trackedAssets.tipo, "nft")));

  const total = tokens.reduce((s, t) => s + t.valorUsd, 0);
  return NextResponse.json({
    fechaSnapshot: ultimo?.fecha ?? null,
    tokens,
    nfts,
    total,
  });
});
