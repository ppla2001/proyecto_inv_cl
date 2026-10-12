// Parser of the TEXT of Mercado Pago's "Resumen de cuenta" PDF (the format the
// mobile app exports). Pure function: text (already extracted from the PDF) ->
// raw movements, which then go through the same classification as the CSV.
//
// Layout observed (2026-10), one row per movement, description may wrap:
//   02-09-2026 Transferencia recibida
//   Victoria Bernasconi 176842793044 $ 15.000,00 $ 1.257.699,86
// i.e. fecha · descripción · ID de la operación · $ valor · $ saldo.
//
// Integrity check: every row's running balance must equal the previous balance
// plus its value, starting at "Saldo inicial" and ending at "Saldo final". If
// the chain breaks, the text wasn't read correctly and nothing is imported.

import { parseFechaAr, parseMontoAr, type MovimientoMp } from "@/lib/mp-parser";

export type ResumenMpPdf = {
  periodo: string | null; // "Del 1 al 30 de septiembre de 2026"
  saldoInicial: number;
  saldoFinal: number;
  movimientos: MovimientoMp[];
  avisos: string[];
};

const MONTO = String.raw`-?[\d.]+,\d{2}`;
const FECHA = String.raw`\d{2}-\d{2}-\d{4}`;
// fecha, descripción (sin cruzar otra fecha), ID (6+ dígitos), $ valor, $ saldo.
const FILA = new RegExp(
  String.raw`(${FECHA}) ((?:(?!${FECHA}).)+?) (\d{6,}) \$ ?(${MONTO}) \$ ?(${MONTO})`,
  "g"
);

const centavos = (n: number) => Math.round(n * 100);

function montoTras(etiqueta: string, texto: string): number | null {
  const m = texto.match(new RegExp(`${etiqueta}:?\\s*\\$\\s*(${MONTO})`, "i"));
  return m ? parseMontoAr(m[1]) : null;
}

export function parseMpPdfText(texto: string): ResumenMpPdf {
  const plano = texto.replace(/\s+/g, " ");
  if (!/RESUMEN DE CUENTA EN PESOS/i.test(plano)) {
    throw new Error('No parece el "Resumen de cuenta" de Mercado Pago (falta "Resumen de cuenta en pesos").');
  }

  // Solo la sección en pesos; la de dólares (tenencias) tiene otras columnas.
  const corteUsd = plano.search(/RESUMEN DE TENENCIAS EN D[ÓO]LARES/i);
  const pesos = corteUsd >= 0 ? plano.slice(0, corteUsd) : plano;
  const usd = corteUsd >= 0 ? plano.slice(corteUsd) : "";

  const saldoInicial = montoTras("Saldo inicial", pesos);
  const saldoFinal = montoTras("Saldo final", pesos);
  if (saldoInicial == null || saldoFinal == null) {
    throw new Error("No se encontró el saldo inicial/final del resumen.");
  }
  const periodo = pesos.match(/Del \d{1,2} al \d{1,2} de [a-záéíóú]+ de \d{4}/i)?.[0] ?? null;

  const movimientos: MovimientoMp[] = [];
  const saldos: number[] = [];
  for (const m of pesos.matchAll(FILA)) {
    movimientos.push({
      fecha: parseFechaAr(m[1]),
      descripcion: m[2].trim(),
      referenceId: m[3],
      montoConSigno: parseMontoAr(m[4]),
    });
    saldos.push(parseMontoAr(m[5]));
  }

  // Cadena de saldos: saldo anterior + valor = saldo de la fila.
  let anterior = saldoInicial;
  movimientos.forEach((mov, i) => {
    if (centavos(anterior + mov.montoConSigno) !== centavos(saldos[i])) {
      throw new Error(
        `No se pudo leer bien el PDF: el saldo no cierra en la fila ${i + 1} ` +
          `(${mov.fecha} · ${mov.descripcion}). No se importó nada.`
      );
    }
    anterior = saldos[i];
  });
  if (centavos(anterior) !== centavos(saldoFinal)) {
    throw new Error(
      `No se pudo leer bien el PDF: los movimientos leídos (${movimientos.length}) no llegan al saldo final. No se importó nada.`
    );
  }

  const avisos: string[] = [];
  if (usd) {
    const ini = usd.match(new RegExp(`Saldo inicial:?\\s*US\\$\\s*(${MONTO})`, "i"));
    const fin = usd.match(new RegExp(`Saldo final:?\\s*US\\$\\s*(${MONTO})`, "i"));
    const hayMovUsd = new RegExp(`${FECHA} .+? US\\$`).test(usd.replace(/Fecha de generaci[oó]n: ${FECHA}/gi, ""));
    if ((ini && parseMontoAr(ini[1]) !== 0) || (fin && parseMontoAr(fin[1]) !== 0) || hayMovUsd) {
      avisos.push("El resumen tiene movimientos o saldo en dólares: esa sección todavía no se importa.");
    }
  }

  return { periodo, saldoInicial, saldoFinal, movimientos, avisos };
}
