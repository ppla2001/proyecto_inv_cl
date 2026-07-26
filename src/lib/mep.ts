import { getMepRateForDate as getMepFromExchange } from "@/lib/exchange-rates";

export type MepRate = { fecha: string; compra: number; venta: number };
export async function getMepRateForDate(fecha: string): Promise<MepRate | null> {
  return getMepFromExchange(fecha);
}
