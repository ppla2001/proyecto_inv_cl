import { db } from "@/db";
import { inflationIndex } from "@/db/schema";
import { TIPOS_DOLAR } from "@/lib/dolar";
import { COTIZACIONES_DESDE, refrescarCotizacion } from "@/lib/cotizaciones-sync";

const FUENTE = "argentinadatos";

type InflacionApi = { fecha: string; valor: number };

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

async function main() {
  await seedInflacion();
  for (const tipo of TIPOS_DOLAR) {
    const n = await refrescarCotizacion(tipo);
    console.log(`${tipo}: ${n} días cargados/actualizados (desde ${COTIZACIONES_DESDE}).`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
