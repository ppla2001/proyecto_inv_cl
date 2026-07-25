import { NextResponse } from "next/server";

// Capa de errores consistente para las rutas API. Objetivo: un shape de error
// uniforme `{ error: { message, details? } }`, traducir errores conocidos
// (JSON inválido, violaciones de constraint de SQLite) a códigos HTTP claros,
// y loguear con contexto lo inesperado para poder debuggear.

export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

// Parsea el body como JSON; si no es válido, 400 en vez de un 500 opaco.
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ApiError(400, "El body no es JSON válido.");
  }
}

function sqliteCode(err: unknown): string | undefined {
  return typeof err === "object" && err !== null && "code" in err
    ? String((err as { code: unknown }).code)
    : undefined;
}

function toErrorResponse(err: unknown, contexto: string): NextResponse {
  if (err instanceof ApiError) {
    return NextResponse.json(
      { error: { message: err.message, details: err.details } },
      { status: err.status }
    );
  }

  const code = sqliteCode(err);
  if (code === "SQLITE_CONSTRAINT_FOREIGNKEY") {
    return NextResponse.json(
      { error: { message: "Referencia inexistente (cuenta o categoría)." } },
      { status: 400 }
    );
  }
  if (
    code === "SQLITE_CONSTRAINT_UNIQUE" ||
    code === "SQLITE_CONSTRAINT_PRIMARYKEY"
  ) {
    return NextResponse.json(
      { error: { message: "El registro ya existe (duplicado)." } },
      { status: 409 }
    );
  }

  // Inesperado: loguear con contexto para poder rastrearlo.
  console.error(`[API ${contexto}]`, err);
  return NextResponse.json(
    { error: { message: "Error interno del servidor." } },
    { status: 500 }
  );
}

type RouteHandler<Ctx> = (request: Request, ctx: Ctx) => Promise<Response>;

// Envuelve un handler de ruta: atrapa excepciones y las convierte al shape de
// error uniforme. `contexto` es una etiqueta para los logs (ej. "POST /transactions").
export function route<Ctx>(contexto: string, handler: RouteHandler<Ctx>): RouteHandler<Ctx> {
  return async (request, ctx) => {
    try {
      return await handler(request, ctx);
    } catch (err) {
      return toErrorResponse(err, contexto);
    }
  };
}
