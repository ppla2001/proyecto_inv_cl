"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch, mensajeDeError } from "@/lib/api-client";
import { fmtFechaCorta, labelTipo } from "@/lib/labels";
import {
  LABEL_DOLAR,
  LABEL_PRECIO,
  PRECIOS_DOLAR,
  TIPOS_DOLAR,
  type PrecioDolar,
  type TipoDolar,
} from "@/lib/dolar";
import { rangoDeMes, mesActual } from "@/lib/periodo";
import { DateRangePicker } from "@/components/DateRangePicker";

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
type Cotizacion = {
  tipo: TipoDolar;
  label: string;
  precio: PrecioDolar;
  precioLabel: string;
  venta: number | null;
  compra: number | null;
  tasaUsada: number | null;
  fecha: string | null;
  nota: string;
};
type Dashboard = {
  desde: string;
  hasta: string;
  resumen: { gastos: Monto; ingresos: Monto; ahorros: Monto };
  porCategoria: { categoriaId: number | null; nombre: string; monto: Monto }[];
  movimientos: Movimiento[];
  cuentas: Account[];
  categorias: Category[];
  avisos: string[];
  cotizacion: Cotizacion;
};

const TIPOS = ["gasto_real", "ingreso_real", "transferencia_interna"] as const;

function fmtTasa(n: number): string {
  return n.toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

export default function DashboardPage() {
  const inicial = rangoDeMes(mesActual());
  const [desde, setDesde] = useState(inicial.desde);
  const [hasta, setHasta] = useState(inicial.hasta);
  const [moneda, setMoneda] = useState<"ars" | "usd">("ars");
  const [dolar, setDolar] = useState<TipoDolar>("mep");
  const [precio, setPrecio] = useState<PrecioDolar>("venta");
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardandoId, setGuardandoId] = useState<number | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const q = new URLSearchParams({
        desde,
        hasta,
        modo: desde === hasta ? "dia" : "rango",
        dolar,
        precio,
      });
      setData(await apiFetch<Dashboard>(`/api/dashboard?${q}`));
    } catch (e) {
      setError(mensajeDeError(e));
    }
  }, [desde, hasta, dolar, precio]);

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
    setGuardandoId(id);
    try {
      await apiFetch(`/api/transactions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      await cargar();
    } catch (e) {
      setError(mensajeDeError(e));
      await cargar();
    } finally {
      setGuardandoId(null);
    }
  }

  const nombreCuenta = (id: number | null) =>
    id == null ? "—" : data?.cuentas.find((a) => a.id === id)?.nombre ?? `#${id}`;

  const catsSorted = useMemo(() => {
    if (!data) return [];
    return data.porCategoria
      .slice()
      .sort((a, b) => b.monto[moneda] - a.monto[moneda]);
  }, [data, moneda]);

  const maxCat = catsSorted[0]?.monto[moneda] ?? 0;

  return (
    <main className="app-main">
      <h1 className="page-title">Dashboard</h1>
      <p className="page-lead">
        Flujo del período: qué entró, qué salió y cuánto apartaste en ahorros.
      </p>

      <div className="toolbar">
        <div>
          <div className="field-label" style={{ marginBottom: "0.3rem" }}>
            Período
          </div>
          <DateRangePicker
            desde={desde}
            hasta={hasta}
            onChange={(a, b) => {
              setDesde(a);
              setHasta(b);
            }}
          />
        </div>

        <label>
          Moneda
          <select value={moneda} onChange={(e) => setMoneda(e.target.value as "ars" | "usd")}>
            <option value="ars">ARS</option>
            <option value="usd">USD</option>
          </select>
        </label>
      </div>

      {moneda === "usd" && data?.cotizacion && (
        <div className="alert alert-fx">
          <div className="fx-info">
            <div className="fx-title">{data.cotizacion.label}</div>
            <div className="fx-rates">
              <span>
                Compra{" "}
                <strong>
                  {data.cotizacion.compra != null
                    ? `$ ${fmtTasa(data.cotizacion.compra)}`
                    : "—"}
                </strong>
              </span>
              <span>
                Venta{" "}
                <strong>
                  {data.cotizacion.venta != null
                    ? `$ ${fmtTasa(data.cotizacion.venta)}`
                    : "—"}
                </strong>
              </span>
              <span>
                Usando {data.cotizacion.precioLabel.toLowerCase()}{" "}
                <strong>
                  {data.cotizacion.tasaUsada != null
                    ? `$ ${fmtTasa(data.cotizacion.tasaUsada)}`
                    : "—"}
                </strong>
              </span>
            </div>
            {data.cotizacion.fecha && (
              <div className="hint">
                Ref. {fmtFechaCorta(data.cotizacion.fecha)} · {data.cotizacion.nota}
              </div>
            )}
          </div>
          <div className="fx-controls">
            <label>
              Tipo
              <select
                value={dolar}
                onChange={(e) => setDolar(e.target.value as TipoDolar)}
              >
                {TIPOS_DOLAR.map((t) => (
                  <option key={t} value={t}>
                    {LABEL_DOLAR[t]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Precio
              <select
                value={precio}
                onChange={(e) => setPrecio(e.target.value as PrecioDolar)}
              >
                {PRECIOS_DOLAR.map((p) => (
                  <option key={p} value={p}>
                    {LABEL_PRECIO[p]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      )}

      {error && <div className="alert alert-error">{error}</div>}

      {!data ? (
        <p className="empty">{error ? "No se pudo cargar." : "Cargando…"}</p>
      ) : (
        <>
          {data.avisos?.map((a, i) => (
            <div key={i} className="alert alert-warn">
              {a}
            </div>
          ))}

          <section className="card-grid">
            <div className="stat-card ingreso">
              <div className="label">Ingresos</div>
              <div className="value">{fmt(data.resumen.ingresos)}</div>
            </div>
            <div className="stat-card gasto">
              <div className="label">Gastos</div>
              <div className="value">{fmt(data.resumen.gastos)}</div>
            </div>
            <div className="stat-card ahorro">
              <div className="label">A ahorros</div>
              <div className="value">{fmt(data.resumen.ahorros)}</div>
            </div>
          </section>

          <h2 className="section-title">Gastos por categoría</h2>
          {catsSorted.length === 0 ? (
            <p className="empty">
              Sin gastos este período.{" "}
              <Link href="/import/mercadopago">Importar Mercado Pago</Link>
            </p>
          ) : (
            <div className="cat-list card">
              {catsSorted.map((c) => {
                const pct = maxCat > 0 ? (c.monto[moneda] / maxCat) * 100 : 0;
                const key = c.categoriaId == null ? "sin" : String(c.categoriaId);
                return (
                  <div key={key} className="cat-row">
                    <span className="name">{c.nombre}</span>
                    <span className="amount">{fmt(c.monto)}</span>
                    <div className="cat-bar">
                      <span style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <h2 className="section-title">
            Movimientos ({data.movimientos.length})
            {guardandoId != null && (
              <span className="muted" style={{ fontWeight: 500, marginLeft: "0.5rem" }}>
                Guardando…
              </span>
            )}
          </h2>

          {data.movimientos.length === 0 ? (
            <p className="empty">
              No hay movimientos en este período.{" "}
              <Link href="/import/mercadopago">Cargar un extracto</Link>
            </p>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Descripción</th>
                    <th className="num">Monto</th>
                    <th>Tipo</th>
                    <th>Categoría</th>
                    <th className="hide-sm">Destino</th>
                  </tr>
                </thead>
                <tbody>
                  {data.movimientos
                    .slice()
                    .sort((a, b) => b.fecha.localeCompare(a.fecha))
                    .map((m) => (
                      <tr key={m.id}>
                        <td>{fmtFechaCorta(m.fecha)}</td>
                        <td>
                          <div className="mov-desc">
                            <span>{m.descripcion ?? "—"}</span>
                            <span className="mov-meta hide-sm">{nombreCuenta(m.cuentaId)}</span>
                          </div>
                        </td>
                        <td className="num">{fmt(m.montoConvertido)}</td>
                        <td>
                          <select
                            value={m.tipo}
                            aria-label="Tipo"
                            disabled={guardandoId === m.id}
                            onChange={(e) => recategorizar(m.id, { tipo: e.target.value })}
                          >
                            {TIPOS.map((t) => (
                              <option key={t} value={t}>
                                {labelTipo(t)}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          {m.tipo === "transferencia_interna" ? (
                            "—"
                          ) : (
                            <select
                              value={m.categoriaId ?? ""}
                              aria-label="Categoría"
                              disabled={guardandoId === m.id}
                              onChange={(e) =>
                                recategorizar(m.id, {
                                  categoriaId: e.target.value ? Number(e.target.value) : null,
                                })
                              }
                            >
                              <option value="">Sin categoría</option>
                              {data.categorias.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.nombre}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td className="hide-sm">{nombreCuenta(m.cuentaDestinoId)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </main>
  );
}
