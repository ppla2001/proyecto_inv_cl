"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, mensajeDeError } from "@/lib/api-client";
import { fmtFechaCorta } from "@/lib/labels";

type Account = { id: number; nombre: string; plataforma: string };
type Montos = { ars: number; usdMep: number; usdCcl: number };
type Posicion = {
  activo: string;
  cantidad: number;
  costo: Montos;
  realizado: Montos;
  precioArs: number | null;
  valor: Montos | null;
  pnl: Montos | null;
};
type PosicionResp = {
  posiciones: Posicion[];
  dolar: { mep: number | null; ccl: number | null; fechaMep: string | null; fechaCcl: string | null };
  totales: { costo: Montos; valor: Montos; pnl: Montos; realizado: Montos };
  sinPrecio: string[];
  movimientos: number;
};
type Candidate = {
  fecha: string;
  ticker: string;
  descripcion: string;
  operacion: "compra" | "venta";
  cantidad: number;
  precio: number;
  gastos: number;
  moneda: "ARS" | "USD";
  boleto: string;
  dolarMep: number | null;
  dolarCcl: number | null;
  total: number;
  totalUsdMep: number | null;
  totalUsdCcl: number | null;
  duplicado: boolean;
};

// Unidad en la que se muestran montos: USD a MEP, USD a CCL o pesos.
type Unidad = "usdMep" | "usdCcl" | "ars";
const LABEL_UNIDAD: Record<Unidad, string> = { usdMep: "USD (MEP)", usdCcl: "USD (CCL)", ars: "ARS" };

const fmt = (n: number, u: Unidad) =>
  `${n < 0 ? "-" : ""}${u === "ars" ? "$" : "US$"} ${Math.abs(n).toLocaleString("es-AR", {
    maximumFractionDigits: u === "ars" ? 0 : 2,
  })}`;
const fmtPct = (n: number) => `${n >= 0 ? "+" : ""}${n.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`;
const clasePnl = (n: number) => (n >= 0 ? "num-pos" : "num-neg");

export default function BalanzPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cuentaId, setCuentaId] = useState("");
  const [unidad, setUnidad] = useState<Unidad>("usdMep");
  const [pos, setPos] = useState<PosicionResp | null>(null);

  const [fileName, setFileName] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [incluir, setIncluir] = useState<Record<string, boolean>>({});

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);

  const cargarCuentas = useCallback(async () => {
    const a = await apiFetch<Account[]>("/api/accounts");
    const bz = a.filter((x) => x.plataforma === "balanz");
    setAccounts(bz);
    setCuentaId((prev) => prev || (bz[0] ? String(bz[0].id) : ""));
  }, []);

  useEffect(() => {
    cargarCuentas().catch((e) => setError(mensajeDeError(e)));
  }, [cargarCuentas]);

  const cargarPosicion = useCallback(async (id: string) => {
    setPos(await apiFetch<PosicionResp>(`/api/balanz/position?cuentaId=${id}`));
  }, []);

  useEffect(() => {
    if (!cuentaId) return;
    setError(null);
    cargarPosicion(cuentaId).catch((e) => setError(mensajeDeError(e)));
  }, [cuentaId, cargarPosicion]);

  async function crearCuenta() {
    setError(null);
    setBusy(true);
    try {
      await apiFetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: "Balanz", plataforma: "balanz", tipoCuenta: "activo",
          grupo: "inversion", monedaDefault: "ARS", origen: "manual",
        }),
      });
      await cargarCuentas();
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setBusy(false);
    }
  }

  async function actualizar() {
    setError(null);
    setResultado(null);
    setBusy(true);
    try {
      const res = await apiFetch<PosicionResp & { fecha: string }>("/api/balanz/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cuentaId: Number(cuentaId) }),
      });
      setPos(res);
      setResultado(`Actualizado al ${fmtFechaCorta(res.fecha)}: ${fmt(res.totales.valor.usdMep, "usdMep")} (snapshot guardado).`);
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite volver a elegir el mismo archivo
    if (!file) return;
    setError(null);
    setResultado(null);
    setFileName(file.name);
    setBusy(true);
    try {
      const { candidates: cs } = await apiFetch<{ candidates: Candidate[] }>("/api/import/balanz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cuentaId: Number(cuentaId), csv: await file.text() }),
      });
      setCandidates(cs);
      setIncluir(Object.fromEntries(cs.map((c) => [c.boleto, !c.duplicado])));
    } catch (err) {
      setCandidates([]);
      setError(mensajeDeError(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirmar() {
    const rows = candidates.filter((c) => incluir[c.boleto]);
    if (rows.length === 0) { setError("No hay operaciones seleccionadas."); return; }
    setError(null);
    setBusy(true);
    try {
      const res = await apiFetch<{ insertadas: number; duplicadas: number }>("/api/import/balanz/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cuentaId: Number(cuentaId), rows }),
      });
      setCandidates([]);
      setFileName("");
      setResultado(
        `Importadas ${res.insertadas} operaciones` + (res.duplicadas ? ` (${res.duplicadas} ya estaban).` : ".")
      );
      await cargarPosicion(cuentaId);
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setBusy(false);
    }
  }

  const abiertas = (pos?.posiciones ?? []).filter((p) => p.cantidad > 0);
  const t = pos?.totales;
  const pnlPct = t && t.costo[unidad] > 0 ? (t.pnl[unidad] / t.costo[unidad]) * 100 : null;
  const tasaUsada = unidad === "usdCcl" ? pos?.dolar.ccl : unidad === "usdMep" ? pos?.dolar.mep : null;
  const fechaTasa = unidad === "usdCcl" ? pos?.dolar.fechaCcl : pos?.dolar.fechaMep;
  const seleccionadas = candidates.filter((c) => incluir[c.boleto]).length;

  return (
    <main className="app-main">
      <h1 className="page-title">Balanz</h1>

      {accounts.length === 0 && (
        <div className="alert alert-warn">
          No tenés una cuenta de Balanz.{" "}
          <button type="button" className="btn-link" onClick={crearCuenta} disabled={busy}>
            Crear cuenta “Balanz” (inversión, ARS)
          </button>
        </div>
      )}

      {accounts.length > 0 && (
        <div className="toolbar" style={{ gap: "1rem", marginBottom: "1rem", justifyContent: "space-between" }}>
          <div className="toolbar" style={{ gap: "1rem" }}>
            {accounts.length > 1 && (
              <label style={{ margin: 0 }}>
                Cuenta{" "}
                <select value={cuentaId} onChange={(e) => setCuentaId(e.target.value)}>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                </select>
              </label>
            )}
            <label style={{ margin: 0 }}>
              Mostrar en{" "}
              <select value={unidad} onChange={(e) => setUnidad(e.target.value as Unidad)}>
                {(Object.keys(LABEL_UNIDAD) as Unidad[]).map((u) => (
                  <option key={u} value={u}>{LABEL_UNIDAD[u]}</option>
                ))}
              </select>
            </label>
          </div>
          <button type="button" className="btn" onClick={actualizar} disabled={busy || !cuentaId || !pos?.movimientos}>
            {busy ? "Procesando…" : "Actualizar"}
          </button>
        </div>
      )}

      {error && <div className="alert alert-error">{error}</div>}
      {resultado && <div className="alert alert-ok">{resultado}</div>}

      {pos && pos.movimientos > 0 && t && (
        <>
          <section className="card-grid" style={{ marginBottom: "1rem" }}>
            <div className="stat-card">
              <div className="label">Valor actual</div>
              <div className="value">{fmt(t.valor[unidad], unidad)}</div>
              {tasaUsada != null && fechaTasa && (
                <div className="hint">
                  {LABEL_UNIDAD[unidad]} $ {tasaUsada.toLocaleString("es-AR")} · {fmtFechaCorta(fechaTasa)}
                </div>
              )}
            </div>
            <div className="stat-card">
              <div className="label">Costo base</div>
              <div className="value">{fmt(t.costo[unidad], unidad)}</div>
              <div className="hint">Al dólar del día de cada compra</div>
            </div>
            <div className={`stat-card ${t.pnl[unidad] >= 0 ? "ingreso" : "gasto"}`}>
              <div className="label">Ganancia no realizada</div>
              <div className="value">{fmt(t.pnl[unidad], unidad)}</div>
              {pnlPct != null && <div className="hint">{fmtPct(pnlPct)}</div>}
            </div>
            {t.realizado[unidad] !== 0 && (
              <div className={`stat-card ${t.realizado[unidad] >= 0 ? "ingreso" : "gasto"}`}>
                <div className="label">Ganancia realizada</div>
                <div className="value">{fmt(t.realizado[unidad], unidad)}</div>
                <div className="hint">Por ventas</div>
              </div>
            )}
          </section>

          {pos.sinPrecio.length > 0 && (
            <div className="alert alert-warn">Sin cotización en data912: {pos.sinPrecio.join(", ")} (no suman al valor).</div>
          )}

          <h2 className="section-title">Posiciones</h2>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Ticker</th>
                  <th className="num">Cant.</th>
                  <th className="num">Precio ($)</th>
                  <th className="num">Costo</th>
                  <th className="num">Valor</th>
                  <th className="num">Resultado</th>
                  <th className="num">%</th>
                </tr>
              </thead>
              <tbody>
                {abiertas.map((p) => (
                  <tr key={p.activo}>
                    <td><strong>{p.activo}</strong></td>
                    <td className="num">{p.cantidad.toLocaleString("es-AR")}</td>
                    <td className="num">{p.precioArs != null ? p.precioArs.toLocaleString("es-AR") : "—"}</td>
                    <td className="num">{fmt(p.costo[unidad], unidad)}</td>
                    <td className="num">{p.valor ? fmt(p.valor[unidad], unidad) : "—"}</td>
                    <td className={`num ${p.pnl ? clasePnl(p.pnl[unidad]) : ""}`}>
                      {p.pnl ? fmt(p.pnl[unidad], unidad) : "—"}
                    </td>
                    <td className={`num ${p.pnl ? clasePnl(p.pnl[unidad]) : ""}`}>
                      {p.pnl && p.costo[unidad] > 0 ? fmtPct((p.pnl[unidad] / p.costo[unidad]) * 100) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hint">
            Precios: data912 (último operado). El costo usa el MEP/CCL del día de cada compra; el valor, el de hoy.
          </p>
        </>
      )}

      {cuentaId && (
        <>
          <h2 className="section-title">Importar operaciones</h2>
          <div className="card form-grid" style={{ maxWidth: 560, marginBottom: "1rem" }}>
            <p className="muted" style={{ margin: 0 }}>
              En Balanz: <strong>Reportes → Resultados del período</strong> → CSV. Reimportar el mismo reporte no
              duplica (se deduplica por nº de boleto).
            </p>
            <label>
              Archivo CSV
              <input type="file" accept=".csv,text/csv" onChange={handleFile} disabled={busy} />
            </label>
            {fileName && <div className="hint">{fileName}</div>}
          </div>

          {candidates.length > 0 && (
            <>
              <div className="toolbar" style={{ justifyContent: "space-between" }}>
                <p className="muted" style={{ margin: 0 }}>
                  <strong>{seleccionadas}</strong> para importar · {candidates.length - seleccionadas} se saltean
                </p>
                <button type="button" className="btn" onClick={confirmar} disabled={busy || seleccionadas === 0}>
                  {busy ? "Importando…" : "Confirmar import"}
                </button>
              </div>
              <div className="table-wrap">
                <table className="data">
                  <thead>
                    <tr>
                      <th></th><th>Fecha</th><th>Ticker</th><th>Operación</th>
                      <th className="num">Cant.</th><th className="num">Precio</th>
                      <th className="num">Gastos</th><th className="num">Total</th>
                      <th className="num">USD MEP</th><th className="num">USD CCL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidates.map((c) => (
                      <tr key={c.boleto}>
                        <td>
                          <input
                            type="checkbox"
                            checked={!!incluir[c.boleto]}
                            onChange={(e) => setIncluir((p) => ({ ...p, [c.boleto]: e.target.checked }))}
                          />
                        </td>
                        <td>{fmtFechaCorta(c.fecha)}</td>
                        <td>
                          <strong>{c.ticker}</strong>
                          {c.duplicado && <> <span className="badge badge-transfer">ya importado</span></>}
                        </td>
                        <td>
                          <span className={`badge ${c.operacion === "compra" ? "badge-ingreso" : "badge-gasto"}`}>
                            {c.operacion}
                          </span>
                        </td>
                        <td className="num">{c.cantidad.toLocaleString("es-AR")}</td>
                        <td className="num">{c.precio.toLocaleString("es-AR")}</td>
                        <td className="num">{c.gastos.toLocaleString("es-AR")}</td>
                        <td className="num">{fmt(c.total, c.moneda === "ARS" ? "ars" : "usdMep")}</td>
                        <td className="num">{c.totalUsdMep != null ? fmt(c.totalUsdMep, "usdMep") : "—"}</td>
                        <td className="num">{c.totalUsdCcl != null ? fmt(c.totalUsdCcl, "usdCcl") : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </main>
  );
}
