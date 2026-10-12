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
  costoSinGastos: Montos;
  realizadoSinGastos: Montos;
};
type Cot = { compra: number; venta: number; fecha: string } | null;
type PosicionResp = {
  posiciones: Posicion[];
  dolar: { mep: number | null; ccl: number | null; fechaMep: string | null; fechaCcl: string | null };
  cotizaciones: { mep: Cot; ccl: Cot; bonos: { mep: number | null; ccl: number | null } };
  totales: {
    costo: Montos; costoSinGastos: Montos; valor: Montos;
    pnl: Montos; pnlSinGastos: Montos; realizado: Montos; realizadoSinGastos: Montos;
  };
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
// Con qué cotización de HOY se pasa el valor actual a dólares. El costo siempre
// usa el dólar del día de cada compra (viene del reporte de Balanz).
type Fuente = "venta" | "compra" | "promedio" | "bonos" | "manual";
const LABEL_FUENTE: Record<Fuente, string> = {
  venta: "Venta (ArgentinaDatos)",
  compra: "Compra (ArgentinaDatos)",
  promedio: "Promedio (ArgentinaDatos)",
  bonos: "Implícito en bonos (AL30)",
  manual: "Manual (ej. la de Balanz)",
};
const FUENTES = Object.keys(LABEL_FUENTE) as Fuente[];
type Manual = { mep: string; ccl: string };
const MANUAL_KEY = "balanz.cotizacionManual";

function tasaDe(
  c: PosicionResp["cotizaciones"] | undefined,
  dolar: "mep" | "ccl",
  fuente: Fuente,
  manual: Manual
): number | null {
  if (!c) return null;
  if (fuente === "manual") {
    const n = Number(manual[dolar].replace(/\./g, "").replace(",", "."));
    return n > 0 ? n : null;
  }
  if (fuente === "bonos") return c.bonos[dolar];
  const r = c[dolar];
  if (!r) return null;
  if (fuente === "compra") return r.compra;
  if (fuente === "promedio") return (r.compra + r.venta) / 2;
  return r.venta;
}

const fmtTasa = (n: number | null) =>
  n == null ? "—" : `$ ${n.toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;

const fmtPct = (n: number) => `${n >= 0 ? "+" : ""}${n.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`;
const clasePnl = (n: number) => (n >= 0 ? "num-pos" : "num-neg");

export default function BalanzPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cuentaId, setCuentaId] = useState("");
  const [unidad, setUnidad] = useState<Unidad>("usdMep");
  const [fuente, setFuente] = useState<Fuente>("venta");
  const [sinGastos, setSinGastos] = useState(false);
  const [manual, setManual] = useState<Manual>({ mep: "", ccl: "" });

  // La cotización manual se recuerda en este navegador (comodidad, no dato).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(MANUAL_KEY);
      if (raw) setManual(JSON.parse(raw) as Manual);
    } catch { /* sin storage: queda vacía */ }
  }, []);
  function cambiarManual(dolar: "mep" | "ccl", v: string) {
    const next = { ...manual, [dolar]: v };
    setManual(next);
    try { localStorage.setItem(MANUAL_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }
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
  const cot = pos?.cotizaciones;
  const tasaMep = tasaDe(cot, "mep", fuente, manual);
  const tasaCcl = tasaDe(cot, "ccl", fuente, manual);
  const tasaUsada = unidad === "usdCcl" ? tasaCcl : unidad === "usdMep" ? tasaMep : null;

  // Valor actual en la unidad elegida: pesos tal cual, o pesos / dólar de hoy.
  const enUnidad = (ars: number): number | null =>
    unidad === "ars" ? ars : tasaUsada ? ars / tasaUsada : null;
  const costoDe = (p: { costo: Montos; costoSinGastos: Montos }) => (sinGastos ? p.costoSinGastos : p.costo)[unidad];

  const valorTotal = t ? enUnidad(t.valor.ars) : null;
  const costoTotal = t ? costoDe(t) : 0;
  const pnlTotal = valorTotal != null ? valorTotal - costoTotal : null;
  const pnlPct = pnlTotal != null && costoTotal > 0 ? (pnlTotal / costoTotal) * 100 : null;
  const realizado = t ? (sinGastos ? t.realizadoSinGastos : t.realizado)[unidad] : 0;

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
            {unidad !== "ars" && (
              <label style={{ margin: 0 }}>
                Dólar de hoy{" "}
                <select value={fuente} onChange={(e) => setFuente(e.target.value as Fuente)}>
                  {FUENTES.map((f) => <option key={f} value={f}>{LABEL_FUENTE[f]}</option>)}
                </select>
              </label>
            )}
            <label style={{ margin: 0 }}>
              Costo{" "}
              <select value={sinGastos ? "sin" : "con"} onChange={(e) => setSinGastos(e.target.value === "sin")}>
                <option value="con">Con gastos</option>
                <option value="sin">Sin gastos</option>
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
          {unidad !== "ars" && fuente === "manual" && (
            <div className="card form-grid" style={{ maxWidth: 560, marginBottom: "1rem" }}>
              <p className="muted" style={{ margin: 0 }}>
                Cargá la cotización que muestra Balanz (en el PDF de posición: “Tipo de cambio para esa fecha”).
              </p>
              <div className="toolbar" style={{ gap: "1rem" }}>
                <label style={{ margin: 0 }}>
                  MEP <input inputMode="decimal" value={manual.mep} onChange={(e) => cambiarManual("mep", e.target.value)} placeholder="1533,45" style={{ width: 110 }} />
                </label>
                <label style={{ margin: 0 }}>
                  Cable / CCL <input inputMode="decimal" value={manual.ccl} onChange={(e) => cambiarManual("ccl", e.target.value)} placeholder="1601,67" style={{ width: 110 }} />
                </label>
              </div>
            </div>
          )}

          <section className="card-grid" style={{ marginBottom: "1rem" }}>
            <div className="stat-card">
              <div className="label">Valor actual</div>
              <div className="value">{valorTotal != null ? fmt(valorTotal, unidad) : "—"}</div>
              <div className="hint">
                {unidad === "ars"
                  ? "Precio data912 × cantidad"
                  : `${LABEL_UNIDAD[unidad]} ${fmtTasa(tasaUsada)} · ${LABEL_FUENTE[fuente]}`}
              </div>
            </div>
            <div className="stat-card">
              <div className="label">Costo base</div>
              <div className="value">{fmt(costoTotal, unidad)}</div>
              <div className="hint">
                {sinGastos ? "Sin gastos" : "Con gastos"}
                {unidad !== "ars" && " · al dólar del día de cada compra"}
              </div>
            </div>
            <div className={`stat-card ${pnlTotal != null && pnlTotal < 0 ? "gasto" : "ingreso"}`}>
              <div className="label">Ganancia no realizada</div>
              <div className="value">{pnlTotal != null ? fmt(pnlTotal, unidad) : "—"}</div>
              {pnlPct != null && <div className="hint">{fmtPct(pnlPct)}</div>}
            </div>
            {realizado !== 0 && (
              <div className={`stat-card ${realizado >= 0 ? "ingreso" : "gasto"}`}>
                <div className="label">Ganancia realizada</div>
                <div className="value">{fmt(realizado, unidad)}</div>
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
                {abiertas.map((p) => {
                  const valor = p.valor ? enUnidad(p.valor.ars) : null;
                  const costo = costoDe(p);
                  const res = valor != null ? valor - costo : null;
                  return (
                    <tr key={p.activo}>
                      <td><strong>{p.activo}</strong></td>
                      <td className="num">{p.cantidad.toLocaleString("es-AR")}</td>
                      <td className="num">{p.precioArs != null ? p.precioArs.toLocaleString("es-AR") : "—"}</td>
                      <td className="num">{fmt(costo, unidad)}</td>
                      <td className="num">{valor != null ? fmt(valor, unidad) : "—"}</td>
                      <td className={`num ${res != null ? clasePnl(res) : ""}`}>{res != null ? fmt(res, unidad) : "—"}</td>
                      <td className={`num ${res != null ? clasePnl(res) : ""}`}>
                        {res != null && costo > 0 ? fmtPct((res / costo) * 100) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="hint">
            Precios: data912 (último operado). El costo usa el MEP/CCL del día de cada compra; el valor, el de hoy.
          </p>

          <h2 className="section-title">Desglose</h2>
          <p className="hint">
            Valor en pesos: <strong>{fmt(t.valor.ars, "ars")}</strong> (instrumentos, sin el efectivo de la cuenta).
            Cada broker pasa a dólares con su propia cotización, por eso el total en USD cambia según cuál uses.
          </p>
          <div className="table-wrap" style={{ marginBottom: "1rem" }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Dólar de hoy</th>
                  <th className="num">MEP</th><th className="num">Total USD MEP</th>
                  <th className="num">CCL</th><th className="num">Total USD CCL</th>
                </tr>
              </thead>
              <tbody>
                {FUENTES.map((f) => {
                  const m = tasaDe(cot, "mep", f, manual);
                  const c = tasaDe(cot, "ccl", f, manual);
                  const activa = f === fuente;
                  return (
                    <tr key={f} style={activa ? { fontWeight: 600 } : undefined}>
                      <td>
                        <button type="button" className="btn-link" onClick={() => setFuente(f)}>
                          {LABEL_FUENTE[f]}
                        </button>
                        {activa && <> <span className="badge badge-transfer">en uso</span></>}
                      </td>
                      <td className="num">{fmtTasa(m)}</td>
                      <td className="num">{m ? fmt(t.valor.ars / m, "usdMep") : "—"}</td>
                      <td className="num">{fmtTasa(c)}</td>
                      <td className="num">{c ? fmt(t.valor.ars / c, "usdCcl") : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Costo</th>
                  <th className="num">Costo ARS</th><th className="num">Resultado ARS</th>
                  <th className="num">Costo USD MEP</th><th className="num">Resultado MEP</th>
                  <th className="num">Costo USD CCL</th><th className="num">Resultado CCL</th>
                </tr>
              </thead>
              <tbody>
                {([false, true] as const).map((sg) => {
                  const costo = sg ? t.costoSinGastos : t.costo;
                  const celda = (c: number, valor: number | null, u: Unidad) => {
                    if (valor == null) return <td className="num">—</td>;
                    const r = valor - c;
                    return (
                      <td className={`num ${clasePnl(r)}`}>
                        {fmt(r, u)} <span className="muted">({fmtPct((r / c) * 100)})</span>
                      </td>
                    );
                  };
                  return (
                    <tr key={String(sg)} style={sg === sinGastos ? { fontWeight: 600 } : undefined}>
                      <td>{sg ? "Sin gastos" : "Con gastos"}</td>
                      <td className="num">{fmt(costo.ars, "ars")}</td>
                      {celda(costo.ars, t.valor.ars, "ars")}
                      <td className="num">{fmt(costo.usdMep, "usdMep")}</td>
                      {celda(costo.usdMep, tasaMep ? t.valor.ars / tasaMep : null, "usdMep")}
                      <td className="num">{fmt(costo.usdCcl, "usdCcl")}</td>
                      {celda(costo.usdCcl, tasaCcl ? t.valor.ars / tasaCcl : null, "usdCcl")}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="hint">
            Gastos totales: {fmt(t.costo.ars - t.costoSinGastos.ars, "ars")}. El resultado en dólares usa el dólar de
            hoy seleccionado ({LABEL_FUENTE[fuente].toLowerCase()}); el costo, el del día de cada compra.
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
