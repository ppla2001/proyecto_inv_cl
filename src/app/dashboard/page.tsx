"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, mensajeDeError } from "@/lib/api-client";

type Monto = { ars: number; usd: number };
type Account = { id: number; nombre: string; grupo: string };
type Category = { id: number; nombre: string; tipo: string };
type Movimiento = {
  id: number;
  fecha: string;
  monto: number;
  moneda: string;
  cuentaId: number;
  categoriaId: number | null;
  tipo: string;
  descripcion: string | null;
  cuentaDestinoId: number | null;
  montoConvertido: Monto;
};
type Dashboard = {
  mes: string;
  resumen: { gastos: Monto; ingresos: Monto; ahorros: Monto };
  porCategoria: { categoriaId: number; nombre: string; monto: Monto }[];
  movimientos: Movimiento[];
  cuentas: Account[];
  categorias: Category[];
  avisos: string[];
};

const TIPOS = ["gasto_real", "ingreso_real", "transferencia_interna"] as const;

function mesActual(): string {
  return new Date().toISOString().slice(0, 7);
}

export default function DashboardPage() {
  const [mes, setMes] = useState("2026-06");
  const [moneda, setMoneda] = useState<"ars" | "usd">("ars");
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      setData(await apiFetch<Dashboard>(`/api/dashboard?mes=${mes}`));
    } catch (e) {
      setError(mensajeDeError(e));
    }
  }, [mes]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  function fmt(m: Monto): string {
    const v = moneda === "ars" ? m.ars : m.usd;
    const simbolo = moneda === "ars" ? "$" : "US$";
    return `${simbolo} ${v.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
  }

  async function recategorizar(id: number, patch: Record<string, unknown>) {
    setError(null);
    try {
      await apiFetch(`/api/transactions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      await cargar();
    } catch (e) {
      setError(mensajeDeError(e));
      await cargar(); // revertir el select al estado real
    }
  }

  const nombreCuenta = (id: number | null) =>
    id == null ? "—" : data?.cuentas.find((a) => a.id === id)?.nombre ?? `#${id}`;

  return (
    <main style={{ fontFamily: "system-ui", padding: "2rem", maxWidth: 1000 }}>
      <h1>Dashboard</h1>

      <div style={{ display: "flex", gap: "1rem", alignItems: "center", marginBottom: "1.5rem" }}>
        <label>
          Mes{" "}
          <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} max={mesActual()} />
        </label>
        <label>
          Moneda{" "}
          <select value={moneda} onChange={(e) => setMoneda(e.target.value as "ars" | "usd")}>
            <option value="ars">ARS</option>
            <option value="usd">USD</option>
          </select>
        </label>
      </div>

      {error && (
        <p style={{ color: "red", border: "1px solid red", padding: "0.5rem", borderRadius: 4 }}>
          {error}
        </p>
      )}

      {!data ? (
        <p>{error ? "No se pudo cargar." : "Cargando…"}</p>
      ) : (
        <>
          {data.avisos?.map((a, i) => (
            <p key={i} style={{ color: "#8a6d00", background: "#fff8e1", padding: "0.5rem", borderRadius: 4 }}>
              ⚠ {a}
            </p>
          ))}
          <section style={{ display: "flex", gap: "1rem", marginBottom: "2rem" }}>
            <Tarjeta titulo="Ingresos" valor={fmt(data.resumen.ingresos)} color="#0a7d28" />
            <Tarjeta titulo="Gastos" valor={fmt(data.resumen.gastos)} color="#b00020" />
            <Tarjeta titulo="A ahorros" valor={fmt(data.resumen.ahorros)} color="#1558b0" />
          </section>

          <h2>Gastos por categoría</h2>
          {data.porCategoria.length === 0 ? (
            <p>Sin gastos categorizados este mes.</p>
          ) : (
            <table style={{ borderCollapse: "collapse", marginBottom: "2rem", minWidth: 300 }}>
              <tbody>
                {data.porCategoria
                  .slice()
                  .sort((a, b) => b.monto[moneda] - a.monto[moneda])
                  .map((c) => (
                    <tr key={c.categoriaId}>
                      <td style={{ paddingRight: "2rem" }}>{c.nombre}</td>
                      <td align="right">{fmt(c.monto)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}

          <h2>Movimientos ({data.movimientos.length})</h2>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr>
                <th align="left">Fecha</th>
                <th align="left">Descripción</th>
                <th align="right">Monto</th>
                <th align="left">Tipo</th>
                <th align="left">Categoría</th>
                <th align="left">Destino</th>
              </tr>
            </thead>
            <tbody>
              {data.movimientos
                .slice()
                .sort((a, b) => b.fecha.localeCompare(a.fecha))
                .map((m) => (
                  <tr key={m.id}>
                    <td>{m.fecha}</td>
                    <td>{m.descripcion ?? "—"}</td>
                    <td align="right">{fmt(m.montoConvertido)}</td>
                    <td>
                      <select
                        value={m.tipo}
                        onChange={(e) => recategorizar(m.id, { tipo: e.target.value })}
                      >
                        {TIPOS.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      {m.tipo === "transferencia_interna" ? (
                        "—"
                      ) : (
                        <select
                          value={m.categoriaId ?? ""}
                          onChange={(e) =>
                            recategorizar(m.id, {
                              categoriaId: e.target.value ? Number(e.target.value) : null,
                            })
                          }
                        >
                          <option value="">Sin categoría</option>
                          {data.categorias.map((c) => (
                            <option key={c.id} value={c.id}>{c.nombre}</option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td>{nombreCuenta(m.cuentaDestinoId)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </>
      )}
    </main>
  );
}

function Tarjeta({ titulo, valor, color }: { titulo: string; valor: string; color: string }) {
  return (
    <div style={{ border: "1px solid #ccc", borderRadius: 8, padding: "1rem", minWidth: 160 }}>
      <div style={{ fontSize: "0.8rem", color: "#666" }}>{titulo}</div>
      <div style={{ fontSize: "1.4rem", fontWeight: 600, color }}>{valor}</div>
    </div>
  );
}
