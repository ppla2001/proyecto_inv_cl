"use client";

import { useEffect, useState } from "react";

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
    const res = await fetch("/api/categories");
    setCategories(await res.json());
  }

  useEffect(() => {
    cargarCategorias();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre, tipo }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(JSON.stringify(data.error));
      return;
    }
    setNombre("");
    await cargarCategorias();
  }

  return (
    <main style={{ fontFamily: "system-ui", padding: "2rem", maxWidth: 600 }}>
      <h1>Categorías</h1>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: "0.5rem", marginBottom: "2rem" }}>
        <label>
          Nombre
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
        </label>
        <label>
          Tipo
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {TIPOS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <button type="submit">Agregar categoría</button>
        {error && <p style={{ color: "red" }}>{error}</p>}
      </form>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th align="left">Nombre</th>
            <th align="left">Tipo</th>
          </tr>
        </thead>
        <tbody>
          {categories.map((c) => (
            <tr key={c.id}>
              <td>{c.nombre}</td>
              <td>{c.tipo}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
