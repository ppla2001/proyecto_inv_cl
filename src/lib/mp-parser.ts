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
  // cuenta pasivo de la tarjeta, que se autoselecciona en la revisión.
  esPagoTarjeta: boolean;
  // true si es un movimiento de Ahorro: una de las patas es la cuenta
  // grupo=ahorro, que se autoselecciona en la revisión.
  esAhorro: boolean;
  // Solo para esAhorro: true si la plata SALE de Ahorro hacia la cuenta
  // corriente ("Dinero retirado"); false si ENTRA a Ahorro ("Dinero
  // reservado"). Define la dirección origen/destino de la transferencia.
  esAhorroSalida: boolean;
  // true si conviene ignorar por default (plumbing interno de MP, o una
  // operación anulada por su devolución).
  ignorarPorDefecto: boolean;
  // Aclaración para la pantalla de revisión (ej. por qué se saltea).
  nota?: string;
};

// Movimiento crudo, igual para cualquier formato de origen (CSV o PDF).
export type MovimientoMp = {
  fecha: string; // yyyy-mm-dd
  descripcion: string;
  referenceId: string;
  montoConSigno: number;
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
  | "tipoSugerido"
  | "categoriaSugerida"
  | "esPagoTarjeta"
  | "esAhorro"
  | "esAhorroSalida"
  | "ignorarPorDefecto"
> {
  const tipo = tipoRaw.trim();
  const esNegativo = monto < 0;

  // Rendimientos de la cuenta remunerada -> ingreso con categoría propia.
  if (/^rendimientos/i.test(tipo)) {
    return {
      tipoSugerido: "ingreso_real",
      categoriaSugerida: RENDIMIENTOS_CATEGORIA,
      esPagoTarjeta: false,
      esAhorro: false,
      esAhorroSalida: false,
      ignorarPorDefecto: false,
    };
  }

  // Ahorro: Pedro aparta plata deliberadamente para metas específicas y quiere
  // verlo. Es una transferencia entre MP-corriente y la cuenta de Ahorro
  // (grupo=ahorro). La DIRECCIÓN importa: "reservado" entra a Ahorro
  // (corriente -> Ahorro); "retirado" sale de Ahorro (Ahorro -> corriente).
  // El monto en el CSV lo confirma: reservado es negativo (sale de corriente),
  // retirado es positivo (entra a corriente).
  // (Distinto del auto-invest del fondo, que solo aparece en el PDF de
  // tenencias y sí se ignora.)
  const ahorro = tipo.match(/dinero (reservado|retirado) ahorro/i);
  if (ahorro) {
    return {
      tipoSugerido: "transferencia_interna",
      esAhorro: true,
      esAhorroSalida: /retirado/i.test(ahorro[1]),
      esPagoTarjeta: false,
      ignorarPorDefecto: false,
    };
  }

  // Pago automático del resumen de la tarjeta de crédito -> transferencia
  // interna hacia la cuenta pasivo de la tarjeta.
  if (/pago autom[aá]tico tarjeta de cr[eé]dito/i.test(tipo)) {
    return {
      tipoSugerido: "transferencia_interna",
      esPagoTarjeta: true,
      esAhorro: false,
      esAhorroSalida: false,
      ignorarPorDefecto: false,
    };
  }

  // Transferencias: si la contraparte es Pedro, es entre cuentas propias.
  if (/^transferencia/i.test(tipo)) {
    if (esNombrePropio(tipo, selfNames)) {
      return {
        tipoSugerido: "transferencia_interna",
        esPagoTarjeta: false,
        esAhorro: false,
        esAhorroSalida: false,
        ignorarPorDefecto: false,
      };
    }
    return {
      tipoSugerido: esNegativo ? "gasto_real" : "ingreso_real",
      esPagoTarjeta: false,
      esAhorro: false,
      esAhorroSalida: false,
      ignorarPorDefecto: false,
    };
  }

  // Pagos (QR, servicios, etc.) -> gasto.
  return {
    tipoSugerido: esNegativo ? "gasto_real" : "ingreso_real",
    esPagoTarjeta: false,
    esAhorro: false,
    esAhorroSalida: false,
    ignorarPorDefecto: false,
  };
}

export type ParseOptions = {
  // Nombres que representan a Pedro (para detectar transferencias entre
  // cuentas propias). Case-insensitive, match por substring.
  selfNames?: string[];
};

const esDevolucion = (descripcion: string) => /^devoluci[oó]n/i.test(descripcion.trim());

/**
 * Clasifica movimientos crudos (de cualquier formato) en candidatas.
 *
 * IDs: MP repite el ID de la operación original en su devolución (ej.
 * "Transferencia recibida X" y "Devolución de transferencia enviada X" con el
 * mismo ID). Como el ID es la clave de dedup, la devolución lleva el sufijo
 * `-dev` (determinístico: el mismo en CSV y PDF) y cualquier otra repetición
 * `-2`, `-3`... Una operación y su devolución se anulan: ambas se sugieren
 * salteadas.
 */
export function clasificarMovimientos(
  movs: MovimientoMp[],
  opts: ParseOptions = {}
): MpCandidate[] {
  const selfNames = opts.selfNames ?? [];
  const vistos = new Map<string, number>();

  const candidatas: MpCandidate[] = movs.map((m) => {
    const base = m.referenceId.trim();
    let referenceId = base;
    if (esDevolucion(m.descripcion)) {
      referenceId = `${base}-dev`;
    } else {
      const n = (vistos.get(base) ?? 0) + 1;
      vistos.set(base, n);
      if (n > 1) referenceId = `${base}-${n}`;
    }
    return {
      fecha: m.fecha,
      descripcion: m.descripcion.trim(),
      referenceId,
      monto: Math.abs(m.montoConSigno),
      ...clasificar(m.descripcion, m.montoConSigno, selfNames),
    };
  });

  // Emparejar cada devolución con su operación original (mismo ID base,
  // signo opuesto) → ambas se saltean por defecto: netean cero.
  movs.forEach((m, i) => {
    if (!esDevolucion(m.descripcion)) return;
    const base = m.referenceId.trim();
    const j = movs.findIndex(
      (o, k) =>
        k !== i &&
        !esDevolucion(o.descripcion) &&
        o.referenceId.trim() === base &&
        Math.sign(o.montoConSigno) === -Math.sign(m.montoConSigno) &&
        Math.abs(o.montoConSigno) === Math.abs(m.montoConSigno)
    );
    if (j === -1) {
      candidatas[i].nota = "Devolución de una operación que no está en este resumen.";
      return;
    }
    candidatas[i].ignorarPorDefecto = true;
    candidatas[i].nota = "Anula la operación original (netean cero).";
    candidatas[j].ignorarPorDefecto = true;
    candidatas[j].nota = "Fue devuelta (netea cero con su devolución).";
  });

  return candidatas;
}

/**
 * Parsea el CSV de "Resumen de cuenta" de MP y devuelve transacciones
 * candidatas. Ignora el bloque de resumen inicial; procesa solo el detalle
 * de movimientos.
 */
export function parseMpStatement(
  csv: string,
  opts: ParseOptions = {}
): MpCandidate[] {
  const lineas = csv.split(/\r?\n/);

  const idxHeader = lineas.findIndex((l) => l.startsWith("RELEASE_DATE"));
  if (idxHeader === -1) {
    throw new Error("No se encontró la cabecera de movimientos (RELEASE_DATE).");
  }

  const movs: MovimientoMp[] = [];
  for (const linea of lineas.slice(idxHeader + 1)) {
    if (linea.trim() === "") continue;
    const cols = linea.split(";");
    if (cols.length < 5) continue;

    const [fechaRaw, tipoRaw, referenceId, montoRaw] = cols;
    movs.push({
      fecha: parseFechaAr(fechaRaw),
      descripcion: tipoRaw,
      referenceId,
      montoConSigno: parseMontoAr(montoRaw),
    });
  }

  return clasificarMovimientos(movs, opts);
}
