/** Utilidades de períodos para el dashboard (mes / día / rango). */

export type ModoPeriodo = "mes" | "dia" | "rango";

export function mesActual(): string {
  return new Date().toISOString().slice(0, 7);
}

export function hoyIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function rangoDeMes(mes: string): { desde: string; hasta: string } {
  if (!/^\d{4}-\d{2}$/.test(mes)) {
    throw new Error(`Mes inválido: ${mes}`);
  }
  const [anio, m] = mes.split("-").map(Number);
  const ultimoDia = new Date(Date.UTC(anio, m, 0)).getUTCDate();
  return {
    desde: `${mes}-01`,
    hasta: `${mes}-${String(ultimoDia).padStart(2, "0")}`,
  };
}

export function mesAnterior(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return d.toISOString().slice(0, 7);
}

export function mesSiguiente(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 1));
  return d.toISOString().slice(0, 7);
}

export function labelPeriodo(modo: ModoPeriodo, desde: string, hasta: string): string {
  if (modo === "mes" && desde.slice(0, 7) === hasta.slice(0, 7) && desde.endsWith("-01")) {
    return desde.slice(0, 7);
  }
  if (desde === hasta) return desde;
  return `${desde} → ${hasta}`;
}

/** Normaliza query params del dashboard a un rango inclusive. */
export function parsePeriodoQuery(params: URLSearchParams): {
  desde: string;
  hasta: string;
  modo: ModoPeriodo;
} {
  const modoRaw = params.get("modo");
  const desde = params.get("desde");
  const hasta = params.get("hasta");
  const mes = params.get("mes");

  if (desde && hasta) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
      throw new Error("desde/hasta deben ser yyyy-mm-dd.");
    }
    if (hasta < desde) throw new Error("hasta debe ser ≥ desde.");
    const modo: ModoPeriodo =
      modoRaw === "dia" || modoRaw === "rango" || modoRaw === "mes"
        ? modoRaw
        : desde === hasta
          ? "dia"
          : "rango";
    return { desde, hasta, modo };
  }

  if (mes) {
    if (!/^\d{4}-\d{2}$/.test(mes)) throw new Error("mes debe ser yyyy-mm.");
    const r = rangoDeMes(mes);
    return { ...r, modo: "mes" };
  }

  throw new Error("Indicá mes=yyyy-mm o desde+hasta (yyyy-mm-dd).");
}
