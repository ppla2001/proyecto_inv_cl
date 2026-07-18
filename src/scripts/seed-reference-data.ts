import { db } from "@/db";
import { exchangeRates, inflationIndex } from "@/db/schema";

const COTIZACIONES_DESDE = "2025-01-01";
const FUENTE = "argentinadatos";

// casa (ArgentinaDatos) -> tipo (nuestra tabla)
const CASAS: { casa: string; tipo: string }[] = [
  { casa: "bolsa", tipo: "mep" },
  { casa: "blue", tipo: "blue" },
  { casa: "oficial", tipo: "oficial" },
  { casa: "cripto", tipo: "cripto" },
];

type InflacionApi = { fecha: string; valor: number };
type CotizacionApi = { casa: string; compra: number; venta: number; fecha: string };

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

async function seedCotizacion(casa: string, tipo: string) {
  const res = await fetch(
    `https://api.argentinadatos.com/v1/cotizaciones/dolares/${casa}`
  );
  if (!res.ok) throw new Error(`${tipo}: HTTP ${res.status}`);
  const data: CotizacionApi[] = await res.json();
  const desde = data.filter((d) => d.fecha >= COTIZACIONES_DESDE);

  for (const { fecha, compra, venta } of desde) {
    await db
      .insert(exchangeRates)
      .values({ fecha, tipo, compra, venta, fuente: FUENTE })
      .onConflictDoUpdate({
        target: [exchangeRates.fecha, exchangeRates.tipo],
        set: { compra, venta, fuente: FUENTE },
      });
  }

  console.log(
    `${tipo}: ${desde.length} días cargados/actualizados (desde ${COTIZACIONES_DESDE}).`
  );
}

async function main() {
  await seedInflacion();
  for (const { casa, tipo } of CASAS) {
    await seedCotizacion(casa, tipo);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
