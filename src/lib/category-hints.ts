/**
 * Memoria de clasificación para imports: dado un historial de transacciones
 * previas, sugiere categoría/tipo/destino por descripción normalizada.
 * La más reciente gana.
 */

export type HintHistorial = {
  descripcion: string | null;
  categoriaId: number | null;
  tipo: string;
  cuentaDestinoId: number | null;
};

export type ClassHint = {
  categoriaId: number | null;
  tipo: string;
  cuentaDestinoId: number | null;
};

export function normalizarDescripcion(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Construye un mapa descripcion→hint a partir de txs ordenadas (más recientes primero). */
export function buildHintsByDescripcion(rows: HintHistorial[]): Map<string, ClassHint> {
  const map = new Map<string, ClassHint>();
  for (const r of rows) {
    if (!r.descripcion) continue;
    const key = normalizarDescripcion(r.descripcion);
    if (!key || map.has(key)) continue;
    // Solo recordamos si hubo categoría o fue transferencia con destino
    // (sirve para reaplicar lo que Pedro ya corrigió a mano).
    if (r.categoriaId == null && !(r.tipo === "transferencia_interna" && r.cuentaDestinoId != null)) {
      continue;
    }
    map.set(key, {
      categoriaId: r.categoriaId,
      tipo: r.tipo,
      cuentaDestinoId: r.cuentaDestinoId,
    });
  }
  return map;
}

export function hintParaDescripcion(
  map: Map<string, ClassHint>,
  descripcion: string
): ClassHint | undefined {
  return map.get(normalizarDescripcion(descripcion));
}
