"use client";

import { useEffect, useState } from "react";

type Account = { id: number; nombre: string };
type Snapshot = {
  id: number;
  cuentaId: number;
  fecha: string;
  activo: string;
  cantidad: number;
  valorUsd: number;
  fuente: string;
};

export default function HoldingsSnapshotsPage() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const [cuentaId, setCuentaId] = useState("");
  const [fecha, setFecha] = useState("");
  const [activo, setActivo] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [valorUsd, setValorUsd] = useState("");
  const [fuente, setFuente] = useState("manual");
  const [error, setError] = useState<string | null>(null);

  async function cargarTodo() {
    const [s, a] = await Promise.all([
      fetch("/api/holdings-snapshots").then((r) => r.json()),
      fetch("/api/accounts").then((r) => r.json()),
    ]);
    setSnapshots(s);
    setAccounts(a);
  }

  useEffect(() => {
    cargarTodo();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/holdings-snapshots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cuentaId: Number(cuentaId),
        fecha,
        activo,
        cantidad: Number(cantidad),
        valorUsd: Number(valorUsd),
        fuente,
      }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(JSON.stringify(data.error));
      return;
    }
    setActivo("");
    setCantidad("");
    setValorUsd("");
    await cargarTodo();
  }

  const nombreCuenta = (id: number) =>
    accounts.find((a) => a.id === id)?.nombre ?? id;

  return (
    <main style={{ fontFamily: "system-ui", padding: "2rem", maxWidth: 700 }}>
      <h1>Holdings — snapshots</h1>
      <p>Valor de una posición en un momento dado. "¿Cómo rinden las inversiones?".</p>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: "0.5rem", marginBottom: "2rem" }}>
        <label>
          Cuenta
          <select value={cuentaId} onChange={(e) => setCuentaId(e.target.value)} required>
            <option value="" disabled>Elegir cuenta</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.nombre}</option>
            ))}
          </select>
        </label>
        <label>
          Fecha
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
        </label>
        <label>
          Activo
          <input value={activo} onChange={(e) => setActivo(e.target.value)} placeholder="ARS, USD, BTC..." required />
        </label>
        <label>
          Cantidad
          <input type="number" step="any" value={cantidad} onChange={(e) => setCantidad(e.target.value)} required />
        </label>
        <label>
          Valor (USD)
          <input type="number" step="0.01" value={valorUsd} onChange={(e) => setValorUsd(e.target.value)} required />
        </label>
        <label>
          Fuente
          <input value={fuente} onChange={(e) => setFuente(e.target.value)} required />
        </label>
        <button type="submit">Agregar snapshot</button>
        {error && <p style={{ color: "red" }}>{error}</p>}
      </form>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th align="left">Fecha</th>
            <th align="left">Cuenta</th>
            <th align="left">Activo</th>
            <th align="left">Cantidad</th>
            <th align="left">Valor USD</th>
            <th align="left">Fuente</th>
          </tr>
        </thead>
        <tbody>
          {snapshots.map((s) => (
            <tr key={s.id}>
              <td>{s.fecha}</td>
              <td>{nombreCuenta(s.cuentaId)}</td>
              <td>{s.activo}</td>
              <td>{s.cantidad}</td>
              <td>{s.valorUsd}</td>
              <td>{s.fuente}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
