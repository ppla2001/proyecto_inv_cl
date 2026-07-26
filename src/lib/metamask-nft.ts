// Revaluación de los NFTs trackeados de una cuenta: consulta floor + mejor oferta
// por colección (OpenSea) y estampa el resultado en tracked_assets, para poder
// mostrar el valor sin re-pegarle a OpenSea en cada apertura. Devuelve totales.

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { trackedAssets } from "@/db/schema";
import { valuarColecciones } from "@/lib/opensea";

const keyDe = (red: string, contrato: string) => `${red}|${contrato.toLowerCase()}`;

export type TotalesNft = {
  floorTotal: number; // suma de floor por NFT (colecciones sin floor cuentan 0)
  ofertaTotal: number; // suma de mejor oferta por NFT
  colecciones: number;
};

export async function revaluarNfts(cuentaId: number): Promise<TotalesNft> {
  const nfts = await db
    .select()
    .from(trackedAssets)
    .where(and(eq(trackedAssets.cuentaId, cuentaId), eq(trackedAssets.tipo, "nft")));

  const conContrato = nfts.filter((n) => n.contractAddress);
  if (conContrato.length === 0) return { floorTotal: 0, ofertaTotal: 0, colecciones: 0 };

  const vals = await valuarColecciones(
    conContrato.map((n) => ({ red: n.red, contractAddress: n.contractAddress as string }))
  );

  db.transaction((tx) => {
    for (const n of conContrato) {
      const v = vals.get(keyDe(n.red, n.contractAddress as string));
      tx.update(trackedAssets)
        .set({ floorUsd: v?.floorUsd ?? null, ofertaUsd: v?.ofertaUsd ?? null })
        .where(eq(trackedAssets.id, n.id))
        .run();
    }
  });

  let floorTotal = 0;
  let ofertaTotal = 0;
  for (const n of conContrato) {
    const v = vals.get(keyDe(n.red, n.contractAddress as string));
    floorTotal += v?.floorUsd ?? 0;
    ofertaTotal += v?.ofertaUsd ?? 0;
  }
  const colecciones = new Set(conContrato.map((n) => keyDe(n.red, n.contractAddress as string))).size;
  return { floorTotal, ofertaTotal, colecciones };
}
