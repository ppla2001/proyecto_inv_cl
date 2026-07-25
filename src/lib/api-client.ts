// Cliente HTTP para el frontend: centraliza el chequeo de `res.ok` y el
// parseo del shape de error uniforme `{ error: { message, details } }`, para
// que las pantallas no traguen errores en silencio.

export class ApiClientError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.details = details;
  }
}

export async function apiFetch<T = unknown>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(url, options); // un fallo de red rechaza acá y propaga
  if (!res.ok) {
    let message = `Error ${res.status}`;
    let details: unknown;
    try {
      const body = await res.json();
      message = body?.error?.message ?? message;
      details = body?.error?.details;
    } catch {
      // respuesta sin JSON: se queda con el mensaje por status
    }
    throw new ApiClientError(res.status, message, details);
  }
  return res.json() as Promise<T>;
}

export function mensajeDeError(err: unknown): string {
  if (err instanceof ApiClientError) return err.message;
  if (err instanceof Error) return err.message;
  return "Error desconocido";
}
