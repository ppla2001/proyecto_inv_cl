"use client";

import { useEffect, useState } from "react";
import { apiFetch, mensajeDeError } from "@/lib/api-client";

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

  const nombreCuenta = (id: number) =>
    accounts.find((a) => a.id === id)?.nombre ?? id;

  return (
    <main style={{ fontFamily: "system-ui", padding: "2rem", maxWidth: 700 }}>
      <h1>Holdings — movimientos</h1>
      <p>Compras/ventas de un activo, para calcular costo base.</p>

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
          <input value={activo} onChange={(e) => setActivo(e.target.value)} placeholder="BTC, AAPL..." required />
        </label>
        <label>
          Tipo
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {TIPOS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          Cantidad
          <input type="number" step="any" value={cantidad} onChange={(e) => setCantidad(e.target.value)} required />
        </label>
        <label>
          Precio unitario
          <input type="number" step="any" value={precioUnitario} onChange={(e) => setPrecioUnitario(e.target.value)} required />
        </label>
        <label>
          Moneda del precio
          <input value={moneda} onChange={(e) => setMoneda(e.target.value)} required />
        </label>
        <label>
          Valor total (USD)
          <input type="number" step="0.01" value={valorUsd} onChange={(e) => setValorUsd(e.target.value)} required />
        </label>
        <label>
          Fuente
          <input value={fuente} onChange={(e) => setFuente(e.target.value)} required />
        </label>
        <button type="submit">Agregar movimiento</button>
        {error && <p style={{ color: "red" }}>{error}</p>}
      </form>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th align="left">Fecha</th>
            <th align="left">Cuenta</th>
            <th align="left">Activo</th>
            <th align="left">Tipo</th>
            <th align="left">Cantidad</th>
            <th align="left">Precio</th>
            <th align="left">Valor USD</th>
          </tr>
        </thead>
        <tbody>
          {movements.map((m) => (
            <tr key={m.id}>
              <td>{m.fecha}</td>
              <td>{nombreCuenta(m.cuentaId)}</td>
              <td>{m.activo}</td>
              <td>{m.tipo}</td>
              <td>{m.cantidad}</td>
              <td>{m.precioUnitario} {m.moneda}</td>
              <td>{m.valorUsd}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
