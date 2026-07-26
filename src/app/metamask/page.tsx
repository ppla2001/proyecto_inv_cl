"use client";

import { useEffect, useState } from "react";
import { apiFetch, mensajeDeError } from "@/lib/api-client";
import { hoyIso } from "@/lib/periodo";

type Account = {
  id: number;
  nombre: string;
  plataforma: string;
  identificadorExterno: string | null;
};

type HoldingValuado = {
  red: string;
  activo: string;
  nombre: string;
  contractAddress: string | null;
  cantidad: number;
  precioUsd: number | null;
  valorUsd: number;
  sinPrecio: boolean;
};

type Red = { red: string; nombre: string };

const ABSTRACT = "abstract";

export default function MetaMaskPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cuentaId, setCuentaId] = useState("");
  const [eoa, setEoa] = useState("");
  const [abstract, setAbstract] = useState("");

  const [holdings, setHoldings] = useState<HoldingValuado[]>([]);
  const [redes, setRedes] = useState<Red[]>([]);
  const [incluir, setIncluir] = useState<Record<number, boolean>>({});
  const [mostrarSpam, setMostrarSpam] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Account[]>("/api/accounts")
      .then((a) => {
        const mm = a.filter((x) => x.plataforma === "metamask");
        setAccounts(mm);
        if (mm.length > 0) {
          setCuentaId(String(mm[0].id));
          if (mm[0].identificadorExterno) setEoa(mm[0].identificadorExterno);
        }
      })
      .catch((e) => setError(mensajeDeError(e)));
  }, []);

  const nombreRed = (red: string) => redes.find((r) => r.red === red)?.nombre ?? red;

  async function traer() {
    setError(null);
    setResultado(null);
    if (!eoa.trim()) {
      setError("Ingresá tu dirección EOA (0x…).");
      return;
    }
    // Construir dirección por red: la EOA sirve para todas menos Abstract.
    const addresses: Record<string, string> = {};
    for (const r of ["ethereum", "arbitrum", "polygon"]) addresses[r] = eoa.trim();
    if (abstract.trim()) addresses[ABSTRACT] = abstract.trim();

    setBusy(true);
    try {
      const res = await apiFetch<{ holdings: HoldingValuado[]; redes: Red[] }>(
        "/api/metamask/holdings",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ addresses }),
        }
      );
      setHoldings(res.holdings);
      setRedes(res.redes);
      // Por default: incluir los que tienen precio, no el spam.
      const inc: Record<number, boolean> = {};
      res.holdings.forEach((h, i) => (inc[i] = !h.sinPrecio));
      setIncluir(inc);
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setBusy(false);
    }
  }

  async function guardar() {
    setError(null);
    setResultado(null);
    if (!cuentaId) {
      setError("Elegí la cuenta de MetaMask.");
      return;
    }
    const fecha = hoyIso();
    const aGuardar = holdings.filter((_, i) => incluir[i]);
    let ok = 0;
    setBusy(true);
    try {
      for (const h of aGuardar) {
        await apiFetch("/api/holdings-snapshots", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cuentaId: Number(cuentaId),
            fecha,
            activo: h.activo,
            red: h.red,
            cantidad: h.cantidad,
            valorUsd: h.valorUsd,
            fuente: "onchain_metamask",
          }),
        });
        ok++;
      }
      setResultado(`Guardados ${ok} holdings como snapshot de ${fecha}.`);
      setHoldings([]);
    } catch (e) {
      setError(`${mensajeDeError(e)} (guardados ${ok} antes del error)`);
    } finally {
      setBusy(false);
    }
  }

  const conPrecio = holdings
    .map((h, i) => ({ h, i }))
    .filter((x) => !x.h.sinPrecio)
    .sort((a, b) => b.h.valorUsd - a.h.valorUsd);
  const sinPrecio = holdings.map((h, i) => ({ h, i })).filter((x) => x.h.sinPrecio);
  const totalIncluido = holdings.reduce((s, h, i) => s + (incluir[i] ? h.valorUsd : 0), 0);

  const fmtUsd = (n: number) =>
    `US$ ${n.toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;

  return (
    <main className="app-main">
      <h1 className="page-title">MetaMask</h1>
      <p className="page-lead">
        Trae tus holdings on-chain (multichain) valuados en USD y guardá un snapshot.
        Solo lectura con tu dirección pública. Los tokens sin cotización (spam) se filtran.
      </p>

      {accounts.length === 0 && (
        <div className="alert alert-warn">
          No tenés ninguna cuenta de MetaMask. Creá una en <a href="/accounts">Cuentas</a>{" "}
          (plataforma <strong>metamask</strong>) antes de guardar.
        </div>
      )}

      <div className="card form-grid" style={{ maxWidth: 560, marginBottom: "1.5rem" }}>
        <label>
          Cuenta de MetaMask
          <select value={cuentaId} onChange={(e) => setCuentaId(e.target.value)}>
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
          Dirección EOA (Ethereum / Arbitrum / Polygon)
          <input value={eoa} onChange={(e) => setEoa(e.target.value)} placeholder="0x…" />
        </label>
        <label>
          Dirección Abstract (opcional, suele diferir)
          <input value={abstract} onChange={(e) => setAbstract(e.target.value)} placeholder="0x…" />
        </label>
        <div className="btn-row">
          <button type="button" className="btn" onClick={traer} disabled={busy || !eoa.trim()}>
            {busy && holdings.length === 0 ? "Consultando on-chain…" : "Traer holdings"}
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {resultado && <div className="alert alert-ok">{resultado}</div>}

      {holdings.length > 0 && (
        <>
          <div className="card-grid" style={{ marginBottom: "1.5rem" }}>
            <div className="stat-card">
              <div className="muted">Total a guardar (con precio)</div>
              <div className="page-title" style={{ margin: 0 }}>{fmtUsd(totalIncluido)}</div>
            </div>
          </div>

          <div className="toolbar" style={{ justifyContent: "space-between" }}>
            <p className="muted" style={{ margin: 0 }}>
              <strong>{conPrecio.length}</strong> activos con precio ·{" "}
              <strong>{sinPrecio.length}</strong> sin precio (spam/no cotizan)
            </p>
            <button type="button" className="btn" onClick={guardar} disabled={busy}>
              {busy ? "Guardando…" : "Guardar snapshot"}
            </button>
          </div>

          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th></th>
                  <th>Red</th>
                  <th>Activo</th>
                  <th className="num">Cantidad</th>
                  <th className="num">Precio</th>
                  <th className="num">Valor USD</th>
                </tr>
              </thead>
              <tbody>
                {conPrecio.map(({ h, i }) => (
                  <tr key={i}>
                    <td>
                      <input
                        type="checkbox"
                        checked={!!incluir[i]}
                        onChange={(e) => setIncluir((p) => ({ ...p, [i]: e.target.checked }))}
                      />
                    </td>
                    <td>{nombreRed(h.red)}</td>
                    <td>{h.activo}</td>
                    <td className="num">{h.cantidad.toLocaleString("es-AR", { maximumFractionDigits: 6 })}</td>
                    <td className="num">{fmtUsd(h.precioUsd ?? 0)}</td>
                    <td className="num">{fmtUsd(h.valorUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {sinPrecio.length > 0 && (
            <p style={{ marginTop: "1rem" }}>
              <button type="button" className="btn-link" onClick={() => setMostrarSpam((v) => !v)}>
                {mostrarSpam ? "Ocultar" : "Ver"} {sinPrecio.length} tokens sin precio
              </button>
            </p>
          )}
          {mostrarSpam && (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th></th>
                    <th>Red</th>
                    <th>Activo</th>
                    <th className="num">Cantidad</th>
                  </tr>
                </thead>
                <tbody>
                  {sinPrecio.map(({ h, i }) => (
                    <tr key={i} style={{ opacity: 0.6 }}>
                      <td>
                        <input
                          type="checkbox"
                          checked={!!incluir[i]}
                          onChange={(e) => setIncluir((p) => ({ ...p, [i]: e.target.checked }))}
                        />
                      </td>
                      <td>{nombreRed(h.red)}</td>
                      <td>{h.activo}</td>
                      <td className="num">{h.cantidad.toLocaleString("es-AR", { maximumFractionDigits: 6 })}</td>
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
