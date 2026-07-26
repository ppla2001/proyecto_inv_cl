import { NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, holdingsSnapshots, trackedAssets } from "@/db/schema";
import { ApiError, readJson, route } from "@/lib/http";
import { hoyIso } from "@/lib/periodo";
import { direccionesPorRed, parseAddresses } from "@/lib/metamask-addresses";
import { revaluarTokens, type TrackedToken } from "@/lib/metamask";
import { revaluarNfts } from "@/lib/metamask-nft";

const input = z.object({ cuentaId: z.number().int() });

// Revalúa SOLO los tokens de la watchlist (rápido, sin re-descubrir) y guarda
// un snapshot de hoy (dedup por día). Es lo que corre el botón "Actualizar".
export const POST = route<unknown>("POST /metamask/sync", async (request) => {
  const parsed = input.safeParse(await readJson(request));
  if (!parsed.success) {
    throw new ApiError(400, "Payload inválido.", parsed.error.flatten());
  }
  const { cuentaId } = parsed.data;

  const cuenta = await db.select().from(accounts).where(eq(accounts.id, cuentaId)).get();
  if (!cuenta) throw new ApiError(404, "Cuenta no encontrada.");

  const direcciones = direccionesPorRed(parseAddresses(cuenta.identificadorExterno));
  if (Object.keys(direcciones).length === 0) {
    throw new ApiError(400, "La cuenta no tiene direcciones guardadas. Reconfigurala primero.");
  }

  const trackedTokens = (
    await db
      .select()
      .from(trackedAssets)
      .where(and(eq(trackedAssets.cuentaId, cuentaId), eq(trackedAssets.tipo, "token")))
  ).map<TrackedToken>((t) => ({
    red: t.red,
    activo: t.activo,
    nombre: t.nombre,
    contractAddress: t.contractAddress,
    decimals: t.decimals,
  }));

  const holdings = trackedTokens.length > 0 ? await revaluarTokens(direcciones, trackedTokens) : [];
  const fecha = hoyIso();

  db.transaction((tx) => {
    tx.delete(holdingsSnapshots)
      .where(
        and(
          eq(holdingsSnapshots.cuentaId, cuentaId),
          eq(holdingsSnapshots.fecha, fecha),
          eq(holdingsSnapshots.fuente, "onchain_metamask")
        )
      )
      .run();
    for (const h of holdings) {
      tx.insert(holdingsSnapshots)
        .values({
          cuentaId,
          fecha,
          activo: h.activo,
          red: h.red,
          cantidad: h.cantidad,
          valorUsd: h.valorUsd,
          fuente: "onchain_metamask",
        })
        .run();
    }
  });

  // Revaluar los NFTs de la watchlist (floor + oferta vía OpenSea) y estamparlos.
  const nfts = await revaluarNfts(cuentaId);

  const total = holdings.reduce((s, h) => s + h.valorUsd, 0);
  return NextResponse.json({ holdings, total, nfts, fecha }, { status: 201 });
});
