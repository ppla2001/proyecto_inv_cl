"use client";

import { useEffect, useState } from "react";
import { apiFetch, mensajeDeError } from "@/lib/api-client";
import { fmtFechaCorta } from "@/lib/labels";

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
    try {
      const [s, a] = await Promise.all([
        apiFetch<Snapshot[]>("/api/holdings-snapshots"),
        apiFetch<Account[]>("/api/accounts"),
      ]);
      setSnapshots(s);
      setAccounts(a);
    } catch (e) {
      setError(mensajeDeError(e));
    }
  }

  useEffect(() => {
    cargarTodo();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch("/api/holdings-snapshots", {
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
    } catch (e) {
      setError(mensajeDeError(e));
      return;
    }
    setActivo("");
    setCantidad("");
    setValorUsd("");
    await cargarTodo();
  }

  const nombreCuenta = (id: number) => accounts.find((a) => a.id === id)?.nombre ?? id;

  return (
    <main className="app-main narrow">
      <h1 className="page-title">Holdings — snapshots</h1>
      <p className="page-lead">
        Valor de una posición en un momento dado. Responde &quot;¿cómo rinden las inversiones?&quot;.
      </p>

      <form onSubmit={handleSubmit} className="card form-grid">
        <label>
          Cuenta
          <select value={cuentaId} onChange={(e) => setCuentaId(e.target.value)} required>
            <option value="" disabled>
              Elegir cuenta
            </option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre}
              </option>
            ))}
          </select>
        </label>
        <label>
          Fecha
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
        </label>
        <label>
          Activo
          <input
            value={activo}
            onChange={(e) => setActivo(e.target.value)}
            placeholder="ARS, USD, BTC…"
            required
          />
        </label>
        <label>
          Cantidad
          <input
            type="number"
            step="any"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            required
          />
        </label>
        <label>
          Valor (USD)
          <input
            type="number"
            step="0.01"
            value={valorUsd}
            onChange={(e) => setValorUsd(e.target.value)}
            required
          />
        </label>
        <label>
          Fuente
          <input value={fuente} onChange={(e) => setFuente(e.target.value)} required />
        </label>
        <div className="btn-row">
          <button type="submit" className="btn">
            Agregar snapshot
          </button>
        </div>
        {error && <div className="alert alert-error">{error}</div>}
      </form>

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Cuenta</th>
              <th>Activo</th>
              <th className="num">Cantidad</th>
              <th className="num">Valor USD</th>
              <th>Fuente</th>
            </tr>
          </thead>
          <tbody>
            {snapshots.map((s) => (
              <tr key={s.id}>
                <td>{fmtFechaCorta(s.fecha)}</td>
                <td>{nombreCuenta(s.cuentaId)}</td>
                <td>{s.activo}</td>
                <td className="num">{s.cantidad}</td>
                <td className="num">{s.valorUsd}</td>
                <td>{s.fuente}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
