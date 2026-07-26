import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { holdingsSnapshots, trackedAssets } from "@/db/schema";
import { ApiError, readJson, route } from "@/lib/http";
import { hoyIso } from "@/lib/periodo";

export const GET = route<unknown>("GET /metamask/tracked", async (request) => {
  const cuentaId = new URL(request.url).searchParams.get("cuentaId");
  if (!cuentaId) throw new ApiError(400, "Falta cuentaId.");
  const rows = await db
    .select()
    .from(trackedAssets)
    .where(eq(trackedAssets.cuentaId, Number(cuentaId)));
  return NextResponse.json(rows);
});

const tokenSel = z.object({
  red: z.string(),
  activo: z.string(),
  nombre: z.string().nullable().optional(),
  contractAddress: z.string().nullable().optional(),
  decimals: z.number().int().nullable().optional(),
  cantidad: z.number(),
  valorUsd: z.number(),
});
const nftSel = z.object({
  red: z.string(),
  contractAddress: z.string(),
  tokenId: z.string(),
  coleccion: z.string().nullable().optional(),
  simbolo: z.string().nullable().optional(),
});

const input = z.object({
  cuentaId: z.number().int(),
  tokens: z.array(tokenSel).default([]),
  nfts: z.array(nftSel).default([]),
});

// Guarda la watchlist curada (reemplaza la de la cuenta) Y guarda un snapshot
// de los tokens seleccionados (los NFTs quedan trackeados sin valuar por ahora).
// Todo atómico.
export const POST = route<unknown>("POST /metamask/tracked", async (request) => {
  const parsed = input.safeParse(await readJson(request));
  if (!parsed.success) {
    throw new ApiError(400, "Payload inválido.", parsed.error.flatten());
  }
  const { cuentaId, tokens, nfts } = parsed.data;
  const fecha = hoyIso();

  const resultado = db.transaction((tx) => {
    // Reemplazar la watchlist de la cuenta.
    tx.delete(trackedAssets).where(eq(trackedAssets.cuentaId, cuentaId)).run();

    for (const t of tokens) {
      tx.insert(trackedAssets)
        .values({
          cuentaId,
          red: t.red,
          tipo: "token",
          activo: t.activo,
          nombre: t.nombre ?? null,
          contractAddress: t.contractAddress ?? null,
          tokenId: null,
          decimals: t.decimals ?? null,
        })
        .run();
    }
    for (const n of nfts) {
      tx.insert(trackedAssets)
        .values({
          cuentaId,
          red: n.red,
          tipo: "nft",
          activo: n.coleccion ?? n.simbolo ?? "NFT",
          nombre: n.simbolo ?? null,
          contractAddress: n.contractAddress,
          tokenId: n.tokenId,
          decimals: null,
        })
        .run();
    }

    // Snapshot de los tokens seleccionados.
    let snaps = 0;
    for (const t of tokens) {
      tx.insert(holdingsSnapshots)
        .values({
          cuentaId,
          fecha,
          activo: t.activo,
          red: t.red,
          cantidad: t.cantidad,
          valorUsd: t.valorUsd,
          fuente: "onchain_metamask",
        })
        .run();
      snaps++;
    }
    return snaps;
  });

  return NextResponse.json(
    { trackeados: tokens.length + nfts.length, snapshots: resultado, fecha },
    { status: 201 }
  );
});
