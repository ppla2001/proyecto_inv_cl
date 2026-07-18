import { db } from "@/db";
import { exchangeRates, inflationIndex } from "@/db/schema";

const MEP_DESDE = "2025-01-01";
const FUENTE = "argentinadatos";

type InflacionApi = { fecha: string; valor: number };
type MepApi = { casa: string; compra: number; venta: number; fecha: string };

async function seedInflacion() {
  const res = await fetch(
    "https://api.argentinadatos.com/v1/finanzas/indices/inflacion"
  );
  if (!res.ok) throw new Error(`Inflación: HTTP ${res.status}`);
  const data: InflacionApi[] = await res.json();

  for (const { fecha, valor } of data) {
    const mes = fecha.slice(0, 7);
    await db
      .insert(inflationIndex)
      .values({ mes, valor, fuente: FUENTE })
      .onConflictDoUpdate({
        target: inflationIndex.mes,
        set: { valor, fuente: FUENTE },
      });
  }

  console.log(`Inflación: ${data.length} meses cargados/actualizados.`);
}

async function seedMep() {
  const res = await fetch(
    "https://api.argentinadatos.com/v1/cotizaciones/dolares/bolsa"
  );
  if (!res.ok) throw new Error(`MEP: HTTP ${res.status}`);
  const data: MepApi[] = await res.json();
  const desde2025 = data.filter((d) => d.fecha >= MEP_DESDE);

  for (const { fecha, compra, venta } of desde2025) {
    await db
      .insert(exchangeRates)
      .values({ fecha, tipo: "mep", compra, venta, fuente: FUENTE })
      .onConflictDoUpdate({
        target: exchangeRates.fecha,
        set: { compra, venta, fuente: FUENTE },
      });
  }

  console.log(`MEP: ${desde2025.length} días cargados/actualizados (desde ${MEP_DESDE}).`);
}

async function main() {
  await seedInflacion();
  await seedMep();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
