"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch, mensajeDeError } from "@/lib/api-client";

type Account = {
  id: number;
  nombre: string;
  plataforma: string;
  identificadorExterno: string | null;
};

type Token = {
  red: string;
  activo: string;
  nombre: string;
  contractAddress: string | null;
  cantidad: number;
  precioUsd: number | null;
  valorUsd: number;
  sinPrecio: boolean;
};

type Nft = {
  red: string;
  contractAddress: string;
  tokenId: string;
  coleccion: string;
  simbolo: string;
  cantidad: number;
};

type Red = { red: string; nombre: string };
type Tracked = { tipo: string; red: string; activo: string; tokenId: string | null };

export default function MetaMaskPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cuentaId, setCuentaId] = useState("");
  const [eoa, setEoa] = useState("");
  const [abstract, setAbstract] = useState("");

  const [tokens, setTokens] = useState<Token[]>([]);
  const [nfts, setNfts] = useState<Nft[]>([]);
  const [redes, setRedes] = useState<Red[]>([]);
  const [incToken, setIncToken] = useState<Record<number, boolean>>({});
  const [incColeccion, setIncColeccion] = useState<Record<string, boolean>>({});
  const [tracked, setTracked] = useState<Tracked[]>([]);

  const [fase, setFase] = useState<"setup" | "curar">("setup");
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

  useEffect(() => {
    if (!cuentaId) return;
    apiFetch<Tracked[]>(`/api/metamask/tracked?cuentaId=${cuentaId}`)
      .then(setTracked)
      .catch(() => setTracked([]));
  }, [cuentaId, resultado]);

  const nombreRed = (red: string) => redes.find((r) => r.red === red)?.nombre ?? red;
  const fmtUsd = (n: number) => `US$ ${n.toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;

  // NFTs agrupados por colección (red + contrato).
  const colecciones = useMemo(() => {
    const map = new Map<string, { key: string; red: string; coleccion: string; items: Nft[] }>();
    for (const n of nfts) {
      const key = `${n.red}|${n.contractAddress}`;
      const g = map.get(key) ?? { key, red: n.red, coleccion: n.coleccion || n.simbolo || "—", items: [] };
      g.items.push(n);
      map.set(key, g);
    }
    return [...map.values()].sort((a, b) => b.items.length - a.items.length);
  }, [nfts]);

  async function descubrir() {
    setError(null);
    setResultado(null);
    if (!eoa.trim()) {
      setError("Ingresá tu dirección EOA (0x…).");
      return;
    }
    const addresses: Record<string, string> = {};
    for (const r of ["ethereum", "arbitrum", "polygon"]) addresses[r] = eoa.trim();
    if (abstract.trim()) addresses.abstract = abstract.trim();

    setBusy(true);
    try {
      const res = await apiFetch<{ tokens: Token[]; nfts: Nft[]; redes: Red[] }>(
        "/api/metamask/discover",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ addresses }),
        }
      );
      setTokens(res.tokens);
      setNfts(res.nfts);
      setRedes(res.redes);
      // Pre-marcar tokens con precio (probablemente reales), NFTs ninguno.
      const it: Record<number, boolean> = {};
      res.tokens.forEach((t, i) => (it[i] = !t.sinPrecio));
      setIncToken(it);
      setIncColeccion({});
      setFase("curar");
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
    const tokensSel = tokens
      .filter((_, i) => incToken[i])
      .map((t) => ({
        red: t.red,
        activo: t.activo,
        nombre: t.nombre,
        contractAddress: t.contractAddress,
        decimals: null,
        cantidad: t.cantidad,
        valorUsd: t.valorUsd,
      }));
    const nftsSel = colecciones
      .filter((c) => incColeccion[c.key])
      .flatMap((c) =>
        c.items.map((n) => ({
          red: n.red,
          contractAddress: n.contractAddress,
          tokenId: n.tokenId,
          coleccion: n.coleccion,
          simbolo: n.simbolo,
        }))
      );

    setBusy(true);
    try {
      const res = await apiFetch<{ trackeados: number; snapshots: number; fecha: string }>(
        "/api/metamask/tracked",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cuentaId: Number(cuentaId), tokens: tokensSel, nfts: nftsSel }),
        }
      );
      setResultado(
        `Watchlist guardada: ${res.trackeados} activos (${res.snapshots} tokens con snapshot de ${res.fecha}).`
      );
      setTokens([]);
      setNfts([]);
      setFase("setup");
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setBusy(false);
    }
  }

  const conPrecio = tokens.map((t, i) => ({ t, i })).filter((x) => !x.t.sinPrecio).sort((a, b) => b.t.valorUsd - a.t.valorUsd);
  const sinPrecio = tokens.map((t, i) => ({ t, i })).filter((x) => x.t.sinPrecio);
  const totalTokens = tokens.reduce((s, t, i) => s + (incToken[i] ? t.valorUsd : 0), 0);
  const nftsElegidos = colecciones.filter((c) => incColeccion[c.key]).reduce((s, c) => s + c.items.length, 0);
  const trackedTokens = tracked.filter((t) => t.tipo === "token").length;
  const trackedNfts = tracked.filter((t) => t.tipo === "nft").length;

  return (
    <main className="app-main">
      <h1 className="page-title">MetaMask</h1>
      <p className="page-lead">
        Escaneá todas las redes, elegí qué tokens y NFTs seguir (curás el spam una sola vez) y
        guardá. Solo lectura con tu dirección pública.
      </p>

      {accounts.length === 0 && (
        <div className="alert alert-warn">
          No tenés ninguna cuenta de MetaMask. Creá una en <a href="/accounts">Cuentas</a>{" "}
          (plataforma <strong>metamask</strong>) antes de configurar.
        </div>
      )}

      {tracked.length > 0 && fase === "setup" && (
        <div className="alert alert-ok">
          Watchlist actual: <strong>{trackedTokens}</strong> tokens · <strong>{trackedNfts}</strong> NFTs.
          Volvé a escanear para actualizarla.
        </div>
      )}

      <div className="card form-grid" style={{ maxWidth: 560, marginBottom: "1.5rem" }}>
        <label>
          Cuenta de MetaMask
          <select value={cuentaId} onChange={(e) => setCuentaId(e.target.value)}>
            <option value="" disabled>Elegir cuenta</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.nombre}</option>
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
          <button type="button" className="btn" onClick={descubrir} disabled={busy || !eoa.trim()}>
            {busy && fase === "setup" ? "Escaneando redes… (puede tardar)" : "Escanear activos"}
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {resultado && <div className="alert alert-ok">{resultado}</div>}

      {fase === "curar" && (
        <>
          <div className="toolbar" style={{ justifyContent: "space-between" }}>
            <p className="muted" style={{ margin: 0 }}>
              Elegidos: <strong>{fmtUsd(totalTokens)}</strong> en tokens ·{" "}
              <strong>{nftsElegidos}</strong> NFTs
            </p>
            <button type="button" className="btn" onClick={guardar} disabled={busy}>
              {busy ? "Guardando…" : "Guardar watchlist"}
            </button>
          </div>

          <h2 className="section-title">Tokens con precio ({conPrecio.length})</h2>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th></th><th>Red</th><th>Activo</th>
                  <th className="num">Cantidad</th><th className="num">Valor USD</th>
                </tr>
              </thead>
              <tbody>
                {conPrecio.map(({ t, i }) => (
                  <tr key={i}>
                    <td><input type="checkbox" checked={!!incToken[i]} onChange={(e) => setIncToken((p) => ({ ...p, [i]: e.target.checked }))} /></td>
                    <td>{nombreRed(t.red)}</td>
                    <td>{t.activo}</td>
                    <td className="num">{t.cantidad.toLocaleString("es-AR", { maximumFractionDigits: 6 })}</td>
                    <td className="num">{fmtUsd(t.valorUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {sinPrecio.length > 0 && (
            <p className="hint">{sinPrecio.length} tokens sin precio (spam/no cotizan) — no se muestran.</p>
          )}

          <h2 className="section-title">NFTs por colección ({colecciones.length})</h2>
          <p className="hint">Elegí las colecciones reales (el resto suelen ser airdrops de spam).</p>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr><th></th><th>Red</th><th>Colección</th><th className="num">Cantidad</th></tr>
              </thead>
              <tbody>
                {colecciones.map((c) => (
                  <tr key={c.key}>
                    <td><input type="checkbox" checked={!!incColeccion[c.key]} onChange={(e) => setIncColeccion((p) => ({ ...p, [c.key]: e.target.checked }))} /></td>
                    <td>{nombreRed(c.red)}</td>
                    <td>{c.coleccion}</td>
                    <td className="num">{c.items.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
