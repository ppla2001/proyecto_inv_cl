// Parser del CSV "Resumen de cuenta" (account_statement) de Mercado Pago.
// Función pura: texto CSV -> transacciones candidatas con clasificación
// SUGERIDA. Nada se autoclasifica sin confirmación humana (ver PLAN.md);
// esto solo propone, la pantalla de revisión confirma.

export type TipoTransaccion =
  | "gasto_real"
  | "ingreso_real"
  | "transferencia_interna";

export type MpCandidate = {
  fecha: string; // yyyy-mm-dd
  descripcion: string; // TRANSACTION_TYPE original (trim)
  referenceId: string;
  monto: number; // siempre positivo; el signo lo da `tipo`
  tipoSugerido: TipoTransaccion;
  categoriaSugerida?: string; // ej. "Rendimientos MP"
  // true si es "Pago automático Tarjeta de crédito": el destino es la
  // cuenta pasivo de la tarjeta, que Pedro elige en la revisión.
  esPagoTarjeta: boolean;
  // true si conviene ignorar por default (plumbing interno de MP).
  ignorarPorDefecto: boolean;
};

const RENDIMIENTOS_CATEGORIA = "Rendimientos MP";

// Convierte "2.540.000,00" / "-240.000,00" / "937,71" a number.
export function parseMontoAr(raw: string): number {
  const limpio = raw.trim().replace(/\./g, "").replace(",", ".");
  const n = Number(limpio);
  if (Number.isNaN(n)) throw new Error(`Monto inválido: "${raw}"`);
  return n;
}

// "01-06-2026" -> "2026-06-01"
export function parseFechaAr(raw: string): string {
  const m = raw.trim().match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) throw new Error(`Fecha inválida: "${raw}"`);
  const [, dd, mm, yyyy] = m;
  return `${yyyy}-${mm}-${dd}`;
}

function esNombrePropio(descripcion: string, selfNames: string[]): boolean {
  const d = descripcion.toLowerCase();
  return selfNames.some((n) => d.includes(n.toLowerCase()));
}

function clasificar(
  tipoRaw: string,
  monto: number,
  selfNames: string[]
): Pick<
  MpCandidate,
  "tipoSugerido" | "categoriaSugerida" | "esPagoTarjeta" | "ignorarPorDefecto"
> {
  const tipo = tipoRaw.trim();
  const esNegativo = monto < 0;

  // Rendimientos de la cuenta remunerada -> ingreso con categoría propia.
  if (/^rendimientos/i.test(tipo)) {
    return {
      tipoSugerido: "ingreso_real",
      categoriaSugerida: RENDIMIENTOS_CATEGORIA,
      esPagoTarjeta: false,
      ignorarPorDefecto: false,
    };
  }

  // Movimientos hacia/desde la cuenta remunerada (auto-invest de MP): son
  // plumbing entre el saldo disponible y el fondo, no plata que entra o sale
  // de MP como un todo. Se ignoran por default.
  if (/dinero (reservado|retirado) ahorro/i.test(tipo)) {
    return {
      tipoSugerido: "transferencia_interna",
      esPagoTarjeta: false,
      ignorarPorDefecto: true,
    };
  }

  // Pago automático del resumen de la tarjeta de crédito -> transferencia
  // interna hacia la cuenta pasivo de la tarjeta.
  if (/pago autom[aá]tico tarjeta de cr[eé]dito/i.test(tipo)) {
    return {
      tipoSugerido: "transferencia_interna",
      esPagoTarjeta: true,
      ignorarPorDefecto: false,
    };
  }

  // Transferencias: si la contraparte es Pedro, es entre cuentas propias.
  if (/^transferencia/i.test(tipo)) {
    if (esNombrePropio(tipo, selfNames)) {
      return {
        tipoSugerido: "transferencia_interna",
        esPagoTarjeta: false,
        ignorarPorDefecto: false,
      };
    }
    return {
      tipoSugerido: esNegativo ? "gasto_real" : "ingreso_real",
      esPagoTarjeta: false,
      ignorarPorDefecto: false,
    };
  }

  // Pagos (QR, servicios, etc.) -> gasto.
  return {
    tipoSugerido: esNegativo ? "gasto_real" : "ingreso_real",
    esPagoTarjeta: false,
    ignorarPorDefecto: false,
  };
}

export type ParseOptions = {
  // Nombres que representan a Pedro (para detectar transferencias entre
  // cuentas propias). Case-insensitive, match por substring.
  selfNames?: string[];
};

/**
 * Parsea el CSV de "Resumen de cuenta" de MP y devuelve transacciones
 * candidatas. Ignora el bloque de resumen inicial; procesa solo el detalle
 * de movimientos.
 */
export function parseMpStatement(
  csv: string,
  opts: ParseOptions = {}
): MpCandidate[] {
  const selfNames = opts.selfNames ?? [];
  const lineas = csv.split(/\r?\n/);

  const idxHeader = lineas.findIndex((l) => l.startsWith("RELEASE_DATE"));
  if (idxHeader === -1) {
    throw new Error("No se encontró la cabecera de movimientos (RELEASE_DATE).");
  }

  const candidatas: MpCandidate[] = [];
  for (const linea of lineas.slice(idxHeader + 1)) {
    if (linea.trim() === "") continue;
    const cols = linea.split(";");
    if (cols.length < 5) continue;

    const [fechaRaw, tipoRaw, referenceId, montoRaw] = cols;
    const montoConSigno = parseMontoAr(montoRaw);
    const clasif = clasificar(tipoRaw, montoConSigno, selfNames);

    candidatas.push({
      fecha: parseFechaAr(fechaRaw),
      descripcion: tipoRaw.trim(),
      referenceId: referenceId.trim(),
      monto: Math.abs(montoConSigno),
      ...clasif,
    });
  }

  return candidatas;
}
