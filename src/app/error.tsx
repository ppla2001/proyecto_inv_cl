"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="app-main narrow">
      <h1 className="page-title">Algo salió mal</h1>
      <div className="alert alert-error">{error.message}</div>
      <button type="button" className="btn" onClick={reset}>
        Reintentar
      </button>
    </main>
  );
}
