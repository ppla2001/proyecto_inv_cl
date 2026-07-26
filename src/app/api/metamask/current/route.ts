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

  const nftRows = await db
    .select()
    .from(trackedAssets)
    .where(and(eq(trackedAssets.cuentaId, cuentaId), eq(trackedAssets.tipo, "nft")));

  // Agrupar NFTs por colección (red+contrato): floor/oferta son por-NFT, así que
  // el valor de la colección = valor por NFT × cantidad poseída.
  const colMap = new Map<
    string,
    { red: string; coleccion: string; cantidad: number; floorUsd: number | null; ofertaUsd: number | null }
  >();
  for (const n of nftRows) {
    const key = `${n.red}|${(n.contractAddress ?? n.activo).toLowerCase()}`;
    const g = colMap.get(key) ?? {
      red: n.red,
      coleccion: n.activo,
      cantidad: 0,
      floorUsd: n.floorUsd,
      ofertaUsd: n.ofertaUsd,
    };
    g.cantidad++;
    colMap.set(key, g);
  }
  const nftColecciones = [...colMap.values()].sort((a, b) => (b.floorUsd ?? 0) * b.cantidad - (a.floorUsd ?? 0) * a.cantidad);

  const totalTokens = tokens.reduce((s, t) => s + t.valorUsd, 0);
  const nftFloorTotal = nftColecciones.reduce((s, c) => s + (c.floorUsd ?? 0) * c.cantidad, 0);
  const nftOfertaTotal = nftColecciones.reduce((s, c) => s + (c.ofertaUsd ?? 0) * c.cantidad, 0);

  return NextResponse.json({
    fechaSnapshot: ultimo?.fecha ?? null,
    tokens,
    // Compat: `nfts` sigue siendo la lista cruda; `nftColecciones` trae la
    // valuación agrupada y los totales por base (floor / oferta).
    nfts: nftRows,
    nftColecciones,
    totalTokens,
    nftFloorTotal,
    nftOfertaTotal,
    total: totalTokens + nftFloorTotal, // patrimonio con NFTs a floor (base por defecto)
  });
});
