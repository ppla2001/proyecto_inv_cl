"use client";

import { useEffect, useState } from "react";
import { apiFetch, mensajeDeError } from "@/lib/api-client";
import { fmtFechaCorta } from "@/lib/labels";

type Account = { id: number; nombre: string };
type Movement = {
  id: number;
  cuentaId: number;
  fecha: string;
  activo: string;
  tipo: string;
  cantidad: number;
  precioUnitario: number;
  moneda: string;
  valorUsd: number;
  fuente: string;
};

const TIPOS = ["compra", "venta"] as const;

export default function HoldingsMovementsPage() {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const [cuentaId, setCuentaId] = useState("");
  const [fecha, setFecha] = useState("");
  const [activo, setActivo] = useState("");
  const [tipo, setTipo] = useState<string>(TIPOS[0]);
  const [cantidad, setCantidad] = useState("");
  const [precioUnitario, setPrecioUnitario] = useState("");
  const [moneda, setMoneda] = useState("USD");
  const [valorUsd, setValorUsd] = useState("");
  const [fuente, setFuente] = useState("manual");
  const [error, setError] = useState<string | null>(null);

  async function cargarTodo() {
    try {
      const [m, a] = await Promise.all([
        apiFetch<Movement[]>("/api/holdings-movements"),
        apiFetch<Account[]>("/api/accounts"),
      ]);
      setMovements(m);
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
      await apiFetch("/api/holdings-movements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cuentaId: Number(cuentaId),
          fecha,
          activo,
          tipo,
          cantidad: Number(cantidad),
          precioUnitario: Number(precioUnitario),
          moneda,
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
    setPrecioUnitario("");
    setValorUsd("");
    await cargarTodo();
  }

  const nombreCuenta = (id: number) => accounts.find((a) => a.id === id)?.nombre ?? id;

  return (
    <main className="app-main narrow">
      <h1 className="page-title">Holdings — movimientos</h1>
      <p className="page-lead">Compras y ventas de un activo, para calcular costo base.</p>

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
            placeholder="BTC, AAPL…"
            required
          />
        </label>
        <label>
          Tipo
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {TIPOS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
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
          Precio unitario
          <input
            type="number"
            step="any"
            value={precioUnitario}
            onChange={(e) => setPrecioUnitario(e.target.value)}
            required
          />
        </label>
        <label>
          Moneda del precio
          <input value={moneda} onChange={(e) => setMoneda(e.target.value)} required />
        </label>
        <label>
          Valor total (USD)
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
            Agregar movimiento
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
              <th>Tipo</th>
              <th className="num">Cantidad</th>
              <th className="num">Precio</th>
              <th className="num">Valor USD</th>
            </tr>
          </thead>
          <tbody>
            {movements.map((m) => (
              <tr key={m.id}>
                <td>{fmtFechaCorta(m.fecha)}</td>
                <td>{nombreCuenta(m.cuentaId)}</td>
                <td>{m.activo}</td>
                <td>{m.tipo}</td>
                <td className="num">{m.cantidad}</td>
                <td className="num">
                  {m.precioUnitario} {m.moneda}
                </td>
                <td className="num">{m.valorUsd}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
