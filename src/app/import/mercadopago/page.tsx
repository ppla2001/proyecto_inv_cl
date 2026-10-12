"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiClientError, mensajeDeError } from "@/lib/api-client";
import { fmtFechaCorta, labelTipo } from "@/lib/labels";
import { normalizarDescripcion } from "@/lib/category-hints";

type Account = { id: number; nombre: string; tipoCuenta: string; grupo: string };
type Category = { id: number; nombre: string; tipo: string };

type Candidate = {
  fecha: string;
  descripcion: string;
  referenceId: string;
  monto: number;
  tipoSugerido: "gasto_real" | "ingreso_real" | "transferencia_interna";
  categoriaSugerida?: string;
  esPagoTarjeta: boolean;
  esAhorro: boolean;
  esAhorroSalida: boolean;
  ignorarPorDefecto: boolean;
  nota?: string;
};

type Resumen = {
  formato: "pdf" | "csv";
  periodo: string | null;
  saldoInicial: number | null;
  saldoFinal: number | null;
  avisos: string[];
};

type Row = Candidate & {
  incluir: boolean;
  tipo: "gasto_real" | "ingreso_real" | "transferencia_interna";
  categoriaId: string;
  cuentaDestinoId: string;
};

const TIPOS = ["gasto_real", "ingreso_real", "transferencia_interna"] as const;

const TIPO_CATEGORIA_SUGERIDA: Record<string, "gasto" | "ingreso"> = {
  "Rendimientos MP": "ingreso",
};

export default function ImportMpPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [cuentaOrigenId, setCuentaOrigenId] = useState("");
  const [moneda, setMoneda] = useState("ARS");
  const [selfNames, setSelfNames] = useState("PLA PEDRO, Pedro Pla");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([
      apiFetch<Account[]>("/api/accounts"),
      apiFetch<Category[]>("/api/categories"),
    ])
      .then(([a, c]) => {
        setAccounts(a);
        setCategories(c);
      })
      .catch((e) => setError(mensajeDeError(e)));
  }, []);

  function matchCategoria(nombre: string | undefined, lista: Category[]): string {
    if (!nombre) return "";
    const found = lista.find((c) => c.nombre === nombre);
    return found ? String(found.id) : "";
  }

  async function asegurarCategoriasSugeridas(candidates: Candidate[]): Promise<Category[]> {
    const sugeridas = new Set(
      candidates.map((c) => c.categoriaSugerida).filter((n): n is string => !!n)
    );
    const faltantes = [...sugeridas].filter((n) => !categories.some((c) => c.nombre === n));
    if (faltantes.length === 0) return categories;

    for (const nombre of faltantes) {
      await apiFetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre, tipo: TIPO_CATEGORIA_SUGERIDA[nombre] ?? "gasto" }),
      });
    }
    const actualizadas = await apiFetch<Category[]>("/api/categories");
    setCategories(actualizadas);
    return actualizadas;
  }

  function tarjetaPasivo(): string {
    const t = accounts.find((a) => a.tipoCuenta === "pasivo");
    return t ? String(t.id) : "";
  }

  function cuentaAhorro(): string {
    const a = accounts.find((acc) => acc.grupo === "ahorro");
    return a ? String(a.id) : "";
  }

  function destinoSugerido(c: Candidate): string {
    if (c.esPagoTarjeta) return tarjetaPasivo();
    if (c.esAhorro) return cuentaAhorro();
    return "";
  }

  function direccionAhorro(r: Row): string | null {
    if (!r.esAhorro) return null;
    return r.esAhorroSalida ? "Ahorro → corriente" : "Corriente → Ahorro";
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setArchivo(file);
    setRows([]);
    setResumen(null);
    setResultado(null);
    setError(null);
  }

  async function parsear() {
    setError(null);
    setResultado(null);
    setBusy(true);
    try {
      if (!archivo) return;
      // El archivo va tal cual (PDF de la app del celular o CSV): el server
      // detecta el formato.
      const form = new FormData();
      form.append("file", archivo);
      form.append("selfNames", selfNames);
      const { candidates, resumen: r } = await apiFetch<{ candidates: Candidate[]; resumen: Resumen }>(
        "/api/import/mercadopago",
        { method: "POST", body: form }
      );
      setResumen(r);
      const cats = await asegurarCategoriasSugeridas(candidates);

      // Memoria: si ya clasificaste la misma descripción en esta cuenta, reusar.
      let hints: Record<
        string,
        { categoriaId: number | null; tipo: string; cuentaDestinoId: number | null }
      > = {};
      if (cuentaOrigenId) {
        const res = await apiFetch<{ hints: typeof hints }>(
          `/api/import/hints?cuentaId=${cuentaOrigenId}`
        );
        hints = res.hints;
      }

      setRows(
        candidates.map((c) => {
          const hint = hints[normalizarDescripcion(c.descripcion)];
          const tipo = (hint?.tipo as Row["tipo"] | undefined) ?? c.tipoSugerido;
          let categoriaId = matchCategoria(c.categoriaSugerida, cats);
          if (hint?.categoriaId != null) categoriaId = String(hint.categoriaId);
          let cuentaDestinoId = destinoSugerido(c);
          if (hint?.cuentaDestinoId != null) {
            cuentaDestinoId = String(hint.cuentaDestinoId);
          }
          return {
            ...c,
            incluir: !c.ignorarPorDefecto,
            tipo,
            categoriaId: tipo === "transferencia_interna" ? "" : categoriaId,
            cuentaDestinoId:
              tipo === "transferencia_interna" ? cuentaDestinoId : "",
          };
        })
      );
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setBusy(false);
    }
  }

  function updateRow(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function confirmar() {
    setError(null);
    setResultado(null);
    if (!cuentaOrigenId) {
      setError("Elegí la cuenta de Mercado Pago de origen.");
      return;
    }

    const origen = Number(cuentaOrigenId);
    const filas = rows
      .filter((r) => r.incluir)
      .map((r) => {
        const destino =
          r.tipo === "transferencia_interna" && r.cuentaDestinoId
            ? Number(r.cuentaDestinoId)
            : undefined;

        const [cuentaId, cuentaDestinoId] =
          r.esAhorroSalida && destino ? [destino, origen] : [origen, destino];

        return {
          fecha: r.fecha,
          monto: r.monto,
          moneda,
          cuentaId,
          categoriaId:
            r.tipo !== "transferencia_interna" && r.categoriaId
              ? Number(r.categoriaId)
              : undefined,
          tipo: r.tipo,
          descripcion: r.descripcion,
          cuentaDestinoId,
          externalId: r.referenceId?.trim() || null,
        };
      });

    setBusy(true);
    try {
      const res = await apiFetch<{ total: number; insertadas: number; duplicadas: number }>(
        "/api/import/confirm",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: filas }),
        }
      );
      setResultado(
        `Importadas: ${res.insertadas}. Duplicadas (ya existían, se saltaron): ${res.duplicadas}.`
      );
      setRows([]);
    } catch (e) {
      const detalle =
        e instanceof ApiClientError && e.details
          ? ` Detalle: ${JSON.stringify(e.details)}`
          : "";
      setError(`${mensajeDeError(e)}${detalle}`);
    } finally {
      setBusy(false);
    }
  }

  const incluidas = rows.filter((r) => r.incluir).length;
  const salteadas = rows.length - incluidas;

  return (
    <main className="app-main">
      <h1 className="page-title">Importar Mercado Pago</h1>
      <p className="page-lead">
        Subí el &quot;Resumen de cuenta&quot; (el PDF que baja la app del celular, o el CSV de la web),
        revisá la clasificación sugerida y confirmá. Reimportar un período no duplica.
        Si elegís la cuenta antes de parsear, se reutilizan categorías de imports anteriores
        con la misma descripción.
      </p>

      <div className="steps" aria-label="Pasos">
        <div className={`step ${archivo || rows.length > 0 ? "active" : ""}`}>
          <span className="n">1</span> Cuenta y archivo
        </div>
        <div className={`step ${rows.length > 0 ? "active" : ""}`}>
          <span className="n">2</span> Revisar
        </div>
        <div className={`step ${resultado ? "active" : ""}`}>
          <span className="n">3</span> Confirmar
        </div>
      </div>

      <div className="card form-grid" style={{ maxWidth: 520, marginBottom: "1.5rem" }}>
        <label>
          Cuenta de origen (Mercado Pago)
          <select
            value={cuentaOrigenId}
            onChange={(e) => setCuentaOrigenId(e.target.value)}
            required
          >
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
          Moneda del extracto
          <select value={moneda} onChange={(e) => setMoneda(e.target.value)}>
            <option value="ARS">ARS</option>
            <option value="USD">USD</option>
          </select>
        </label>
        <label>
          Tus nombres (transferencias propias)
          <input value={selfNames} onChange={(e) => setSelfNames(e.target.value)} />
        </label>
        <label>
          Archivo (PDF o CSV)
          <input type="file" accept=".pdf,.csv,application/pdf,text/csv" onChange={handleFile} />
          {archivo && <span className="hint">{archivo.name}</span>}
        </label>
        <div className="btn-row">
          <button type="button" className="btn" onClick={parsear} disabled={!archivo || busy}>
            {busy && rows.length === 0 ? "Leyendo…" : "Leer archivo"}
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {resultado && <div className="alert alert-ok">{resultado}</div>}

      {resumen?.avisos.map((a) => (
        <div key={a} className="alert alert-warn">{a}</div>
      ))}

      {rows.length > 0 && (
        <>
          {resumen?.formato === "pdf" && resumen.saldoInicial != null && resumen.saldoFinal != null && (
            <p className="hint">
              {resumen.periodo ?? "Resumen"} · saldo inicial ${" "}
              {resumen.saldoInicial.toLocaleString("es-AR")} → saldo final ${" "}
              {resumen.saldoFinal.toLocaleString("es-AR")} · {rows.length} movimientos (saldos verificados ✓)
            </p>
          )}
          <div className="toolbar" style={{ justifyContent: "space-between" }}>
            <p className="muted" style={{ margin: 0 }}>
              <strong>{incluidas}</strong> a importar
              {salteadas > 0 && (
                <>
                  {" "}
                  · <strong>{salteadas}</strong> salteadas
                </>
              )}{" "}
              de {rows.length}
            </p>
            <button type="button" className="btn" onClick={confirmar} disabled={busy || incluidas === 0}>
              {busy ? "Importando…" : "Confirmar importación"}
            </button>
          </div>

          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th></th>
                  <th>Fecha</th>
                  <th>Descripción</th>
                  <th className="num">Monto</th>
                  <th>Tipo</th>
                  <th>Categoría / Destino</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const dudosa =
                    r.incluir &&
                    ((r.tipo === "transferencia_interna" && !r.cuentaDestinoId) ||
                      (r.tipo !== "transferencia_interna" && !r.categoriaId));
                  const dir = direccionAhorro(r);
                  return (
                    <tr key={r.referenceId} className={r.incluir ? undefined : "dim"}>
                      <td>
                        <input
                          type="checkbox"
                          checked={r.incluir}
                          onChange={(e) => updateRow(i, { incluir: e.target.checked })}
                          aria-label="Incluir"
                        />
                      </td>
                      <td>{fmtFechaCorta(r.fecha)}</td>
                      <td>
                        <div className="mov-desc">
                          <span>{r.descripcion}</span>
                          {dir && <span className="mov-meta">{dir}</span>}
                          {r.nota && <span className="mov-meta">{r.nota}</span>}
                          {dudosa && (
                            <span className="mov-meta" style={{ color: "var(--warn)" }}>
                              Revisar categoría o destino
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="num">{r.monto.toLocaleString("es-AR")}</td>
                      <td>
                        <select
                          value={r.tipo}
                          onChange={(e) =>
                            updateRow(i, { tipo: e.target.value as Row["tipo"] })
                          }
                        >
                          {TIPOS.map((t) => (
                            <option key={t} value={t}>
                              {labelTipo(t)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        {r.tipo === "transferencia_interna" ? (
                          <select
                            value={r.cuentaDestinoId}
                            onChange={(e) => updateRow(i, { cuentaDestinoId: e.target.value })}
                          >
                            <option value="">Cuenta destino…</option>
                            {accounts.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.nombre}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <select
                            value={r.categoriaId}
                            onChange={(e) => updateRow(i, { categoriaId: e.target.value })}
                          >
                            <option value="">Sin categoría</option>
                            {categories.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.nombre} ({c.tipo})
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
