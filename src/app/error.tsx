"use client";

// Error boundary global: si una pantalla crashea al renderizar, se muestra
// esto en vez del overlay crudo, con opción de reintentar.

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main style={{ fontFamily: "system-ui", padding: "2rem", maxWidth: 600 }}>
      <h1>Algo salió mal</h1>
      <p style={{ color: "#b00020" }}>{error.message}</p>
      <button type="button" onClick={reset}>Reintentar</button>
    </main>
  );
}
