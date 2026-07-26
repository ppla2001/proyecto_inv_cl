export const LABEL_TIPO: Record<string, string> = {
  gasto_real: "Gasto",
  ingreso_real: "Ingreso",
  transferencia_interna: "Transferencia",
};

export function labelTipo(tipo: string): string {
  return LABEL_TIPO[tipo] ?? tipo;
}

export function badgeClassTipo(tipo: string): string {
  if (tipo === "gasto_real") return "badge badge-gasto";
  if (tipo === "ingreso_real") return "badge badge-ingreso";
  return "badge badge-transfer";
}

/** yyyy-mm-dd → dd/mm */
export function fmtFechaCorta(fecha: string): string {
  const m = fecha.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return fecha;
  return `${m[3]}/${m[2]}`;
}
