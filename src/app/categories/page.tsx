"use client";

import { useEffect, useState } from "react";
import { apiFetch, mensajeDeError } from "@/lib/api-client";

type Category = {
  id: number;
  nombre: string;
  tipo: string;
};

const TIPOS = ["gasto", "ingreso"] as const;

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<string>(TIPOS[0]);
  const [error, setError] = useState<string | null>(null);

  async function cargarCategorias() {
    try {
      setCategories(await apiFetch<Category[]>("/api/categories"));
    } catch (e) {
      setError(mensajeDeError(e));
    }
  }

  useEffect(() => {
    cargarCategorias();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre, tipo }),
      });
    } catch (e) {
      setError(mensajeDeError(e));
      return;
    }
    setNombre("");
    await cargarCategorias();
  }

  return (
    <main className="app-main narrow">
      <h1 className="page-title">Categorías</h1>
      <p className="page-lead">Etiquetas de gasto e ingreso para clasificar movimientos.</p>

      <form onSubmit={handleSubmit} className="card form-grid">
        <label>
          Nombre
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
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
        <div className="btn-row">
          <button type="submit" className="btn">
            Agregar categoría
          </button>
        </div>
        {error && <div className="alert alert-error">{error}</div>}
      </form>

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Tipo</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.id}>
                <td>{c.nombre}</td>
                <td>
                  <span className={c.tipo === "gasto" ? "badge badge-gasto" : "badge badge-ingreso"}>
                    {c.tipo}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
