import { NextResponse } from "next/server";
import { ApiError, route } from "@/lib/http";
import { cuentaBalanz, posicionBalanz } from "@/lib/balanz-server";

// Posición actual de la cuenta: tenencia por ticker con costo base, precio
// (data912) y PnL en ARS / USD MEP / USD CCL. Solo lectura.
export const GET = route<unknown>("GET /balanz/position", async (request) => {
  const raw = new URL(request.url).searchParams.get("cuentaId");
  if (!raw) throw new ApiError(400, "Falta cuentaId.");
  const cuentaId = Number(raw);
  await cuentaBalanz(cuentaId);
  return NextResponse.json(await posicionBalanz(cuentaId));
});
