"use client";

import { useEffect, useState } from "react";
import { apiFetch, mensajeDeError } from "@/lib/api-client";

type Account = { id: number; nombre: string };
type Category = { id: number; nombre: string; tipo: string };
type Transaction = {
  id: number;
  fecha: string;
  monto: number;
  moneda: string;
  cuentaId: number;
  categoriaId: number | null;
  tipo: string;
  descripcion: string | null;
  cuentaDestinoId: number | null;
};

const TIPOS = ["gasto_real", "ingreso_real", "transferencia_interna"] as const;

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const [editId, setEditId] = useState<number | null>(null);
  const [fecha, setFecha] = useState("");
  const [monto, setMonto] = useState("");
  const [moneda, setMoneda] = useState("ARS");
  const [cuentaId, setCuentaId] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [tipo, setTipo] = useState<string>(TIPOS[0]);
  const [descripcion, setDescripcion] = useState("");
  const [cuentaDestinoId, setCuentaDestinoId] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function cargarTodo() {
    try {
      const [t, a, c] = await Promise.all([
        apiFetch<Transaction[]>("/api/transactions"),
        apiFetch<Account[]>("/api/accounts"),
        apiFetch<Category[]>("/api/categories"),
      ]);
      setTransactions(t);
      setAccounts(a);
      setCategories(c);
    } catch (e) {
      setError(mensajeDeError(e));
    }
  }

  useEffect(() => {
    cargarTodo();
  }, []);

  function resetForm() {
    setEditId(null);
    setFecha("");
    setMonto("");
    setMoneda("ARS");
    setCuentaId("");
    setCategoriaId("");
    setTipo(TIPOS[0]);
    setDescripcion("");
    setCuentaDestinoId("");
  }

  function editar(t: Transaction) {
    setEditId(t.id);
    setFecha(t.fecha);
    setMonto(String(t.monto));
    setMoneda(t.moneda);
    setCuentaId(String(t.cuentaId));
    setCategoriaId(t.categoriaId ? String(t.categoriaId) : "");
    setTipo(t.tipo);
    setDescripcion(t.descripcion ?? "");
    setCuentaDestinoId(t.cuentaDestinoId ? String(t.cuentaDestinoId) : "");
  }

  async function borrar(id: number) {
    setError(null);
    try {
      await apiFetch(`/api/transactions/${id}`, { method: "DELETE" });
      await cargarTodo();
    } catch (e) {
      setError(mensajeDeError(e));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const payload = {
      fecha,
      monto: Number(monto),
      moneda,
      cuentaId: Number(cuentaId),
      categoriaId: categoriaId ? Number(categoriaId) : undefined,
      tipo,
      descripcion: descripcion || undefined,
      cuentaDestinoId:
        tipo === "transferencia_interna" && cuentaDestinoId
          ? Number(cuentaDestinoId)
          : undefined,
    };

    try {
      await apiFetch(
        editId ? `/api/transactions/${editId}` : "/api/transactions",
        {
          method: editId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
    } catch (e) {
      setError(mensajeDeError(e));
      return;
    }
    resetForm();
    await cargarTodo();
  }

  const nombreCuenta = (id: number) =>
    accounts.find((a) => a.id === id)?.nombre ?? id;
  const nombreCategoria = (id: number | null) =>
    id ? (categories.find((c) => c.id === id)?.nombre ?? id) : "—";

  return (
    <main style={{ fontFamily: "system-ui", padding: "2rem", maxWidth: 700 }}>
      <h1>Transacciones</h1>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: "0.5rem", marginBottom: "2rem" }}>
        <label>
          Fecha
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
        </label>
        <label>
          Monto
          <input type="number" step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} required />
        </label>
        <label>
          Moneda
          <input value={moneda} onChange={(e) => setMoneda(e.target.value)} required />
        </label>
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
          Tipo
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {TIPOS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        {tipo !== "transferencia_interna" && (
          <label>
            Categoría
            <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
              <option value="">Sin categoría</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.nombre} ({c.tipo})</option>
              ))}
            </select>
          </label>
        )}
        {tipo === "transferencia_interna" && (
          <label>
            Cuenta destino
            <select value={cuentaDestinoId} onChange={(e) => setCuentaDestinoId(e.target.value)} required>
              <option value="" disabled>Elegir cuenta destino</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.nombre}</option>
              ))}
            </select>
          </label>
        )}
        <label>
          Descripción (opcional)
          <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
        </label>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button type="submit">{editId ? "Guardar cambios" : "Agregar transacción"}</button>
          {editId && <button type="button" onClick={resetForm}>Cancelar</button>}
        </div>
        {error && <p style={{ color: "red" }}>{error}</p>}
      </form>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th align="left">Fecha</th>
            <th align="left">Monto</th>
            <th align="left">Cuenta</th>
            <th align="left">Tipo</th>
            <th align="left">Categoría</th>
            <th align="left">Destino</th>
            <th align="left">Descripción</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((t) => (
            <tr key={t.id}>
              <td>{t.fecha}</td>
              <td>{t.monto} {t.moneda}</td>
              <td>{nombreCuenta(t.cuentaId)}</td>
              <td>{t.tipo}</td>
              <td>{nombreCategoria(t.categoriaId)}</td>
              <td>{t.cuentaDestinoId ? nombreCuenta(t.cuentaDestinoId) : "—"}</td>
              <td>{t.descripcion ?? "—"}</td>
              <td>
                <button type="button" onClick={() => editar(t)}>Editar</button>{" "}
                <button type="button" onClick={() => borrar(t.id)}>Borrar</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
