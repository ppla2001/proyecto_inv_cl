"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch, mensajeDeError } from "@/lib/api-client";
import { parseAddresses } from "@/lib/metamask-addresses";

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
  decimals: number;
  cantidad: number;
  precioUsd: number | null;
  valorUsd: number;
  sinPrecio: boolean;
};
type Nft = { red: string; contractAddress: string; tokenId: string; coleccion: string; simbolo: string; cantidad: number };
type Red = { red: string; nombre: string };
type Snapshot = { red: string; activo: string; cantidad: number; valorUsd: number };
type TrackedNft = { red: string; activo: string; tokenId: string | null };
type Current = { fechaSnapshot: string | null; tokens: Snapshot[]; nfts: TrackedNft[]; total: number };

const REDES_NOMBRE: Record<string, string> = {
  ethereum: "Ethereum", arbitrum: "Arbitrum", polygon: "Polygon", abstract: "Abstract",
};
const fmtUsd = (n: number) => `US$ ${n.toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;

export default function MetaMaskPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cuentaId, setCuentaId] = useState("");
  const [eoa, setEoa] = useState("");
  const [abstract, setAbstract] = useState("");

  const [modo, setModo] = useState<"ver" | "setup">("ver");
  const [current, setCurrent] = useState<Current | null>(null);
  const [tieneWatchlist, setTieneWatchlist] = useState(false);

  // Estado del descubrimiento (setup).
  const [tokens, setTokens] = useState<Token[]>([]);
  const [nfts, setNfts] = useState<Nft[]>([]);
  const [redes, setRedes] = useState<Red[]>([]);
  const [incToken, setIncToken] = useState<Record<number, boolean>>({});
  const [incColeccion, setIncColeccion] = useState<Record<string, boolean>>({});

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Account[]>("/api/accounts")
      .then((a) => {
        const mm = a.filter((x) => x.plataforma === "metamask");
        setAccounts(mm);
        if (mm.length > 0) setCuentaId(String(mm[0].id));
      })
      .catch((e) => setError(mensajeDeError(e)));
  }, []);

  // Al elegir cuenta: cargar direcciones guardadas, watchlist y holdings actuales.
  useEffect(() => {
    if (!cuentaId) return;
    const cuenta = accounts.find((a) => String(a.id) === cuentaId);
    const dir = parseAddresses(cuenta?.identificadorExterno ?? null);
    setEoa(dir.eoa);
    setAbstract(dir.abstract ?? "");
    setResultado(null);
    setError(null);
    Promise.all([
      apiFetch<TrackedNft[]>(`/api/metamask/tracked?cuentaId=${cuentaId}`),
      apiFetch<Current>(`/api/metamask/current?cuentaId=${cuentaId}`),
    ])
      .then(([tr, cur]) => {
        setTieneWatchlist(tr.length > 0);
        setCurrent(cur);
        setModo(tr.length > 0 ? "ver" : "setup");
      })
      .catch(() => {
        setTieneWatchlist(false);
        setModo("setup");
      });
  }, [cuentaId, accounts]);

  const nombreRed = (red: string) => redes.find((r) => r.red === red)?.nombre ?? REDES_NOMBRE[red] ?? red;

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

  // Agrupar NFTs de la watchlist para la vista "ver".
  const nftsView = useMemo(() => {
    const map = new Map<string, { red: string; coleccion: string; count: number }>();
    for (const n of current?.nfts ?? []) {
      const key = `${n.red}|${n.activo}`;
      const g = map.get(key) ?? { red: n.red, coleccion: n.activo, count: 0 };
      g.count++;
      map.set(key, g);
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [current]);

  async function actualizar() {
    setError(null);
    setResultado(null);
    setBusy(true);
    try {
      const res = await apiFetch<{ fecha: string; total: number }>("/api/metamask/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cuentaId: Number(cuentaId) }),
      });
      const cur = await apiFetch<Current>(`/api/metamask/current?cuentaId=${cuentaId}`);
      setCurrent(cur);
      setResultado(`Actualizado al ${res.fecha}: ${fmtUsd(res.total)} en tokens.`);
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setBusy(false);
    }
  }

  async function escanear() {
    setError(null);
    setResultado(null);
    if (!eoa.trim()) { setError("Ingresá tu dirección EOA (0x…)."); return; }
    const addresses: Record<string, string> = {};
    for (const r of ["ethereum", "arbitrum", "polygon"]) addresses[r] = eoa.trim();
    if (abstract.trim()) addresses.abstract = abstract.trim();
    setBusy(true);
    try {
      const res = await apiFetch<{ tokens: Token[]; nfts: Nft[]; redes: Red[] }>("/api/metamask/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addresses }),
      });
      setTokens(res.tokens);
      setNfts(res.nfts);
      setRedes(res.redes);
      const it: Record<number, boolean> = {};
      res.tokens.forEach((t, i) => (it[i] = !t.sinPrecio));
      setIncToken(it);
      setIncColeccion({});
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setBusy(false);
    }
  }

  async function guardar() {
    setError(null);
    setResultado(null);
    if (!cuentaId) { setError("Elegí la cuenta."); return; }
    const tokensSel = tokens.filter((_, i) => incToken[i]).map((t) => ({
      red: t.red, activo: t.activo, nombre: t.nombre, contractAddress: t.contractAddress,
      decimals: t.decimals, cantidad: t.cantidad, valorUsd: t.valorUsd,
    }));
    const nftsSel = colecciones.filter((c) => incColeccion[c.key]).flatMap((c) =>
      c.items.map((n) => ({ red: n.red, contractAddress: n.contractAddress, tokenId: n.tokenId, coleccion: n.coleccion, simbolo: n.simbolo }))
    );
    setBusy(true);
    try {
      await apiFetch("/api/metamask/tracked", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cuentaId: Number(cuentaId), tokens: tokensSel, nfts: nftsSel,
          eoa: eoa.trim(), abstract: abstract.trim() || undefined,
        }),
      });
      setTokens([]); setNfts([]);
      const [tr, cur] = await Promise.all([
        apiFetch<TrackedNft[]>(`/api/metamask/tracked?cuentaId=${cuentaId}`),
        apiFetch<Current>(`/api/metamask/current?cuentaId=${cuentaId}`),
      ]);
      setTieneWatchlist(tr.length > 0);
      setCurrent(cur);
      setModo("ver");
      setResultado("Watchlist guardada y snapshot tomado.");
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setBusy(false);
    }
  }

  const conPrecio = tokens.map((t, i) => ({ t, i })).filter((x) => !x.t.sinPrecio).sort((a, b) => b.t.valorUsd - a.t.valorUsd);
  const sinPrecio = tokens.filter((t) => t.sinPrecio);
  const totalElegido = tokens.reduce((s, t, i) => s + (incToken[i] ? t.valorUsd : 0), 0);
  const nftsElegidos = colecciones.filter((c) => incColeccion[c.key]).reduce((s, c) => s + c.items.length, 0);

  return (
    <main className="app-main">
      <h1 className="page-title">MetaMask</h1>

      {accounts.length === 0 && (
        <div className="alert alert-warn">
          No tenés ninguna cuenta de MetaMask. Creá una en <a href="/accounts">Cuentas</a> (plataforma <strong>metamask</strong>).
        </div>
      )}

      <div className="toolbar" style={{ gap: "1rem", marginBottom: "1rem" }}>
        <label style={{ margin: 0 }}>
          Cuenta{" "}
          <select value={cuentaId} onChange={(e) => setCuentaId(e.target.value)}>
            <option value="" disabled>Elegir cuenta</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
          </select>
        </label>
        {tieneWatchlist && modo === "ver" && (
          <button type="button" className="btn-link" onClick={() => setModo("setup")}>Reconfigurar watchlist</button>
        )}
        {tieneWatchlist && modo === "setup" && (
          <button type="button" className="btn-link" onClick={() => setModo("ver")}>Volver a holdings</button>
        )}
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {resultado && <div className="alert alert-ok">{resultado}</div>}

      {/* ---- VISTA HOLDINGS ---- */}
      {modo === "ver" && (
        <>
          <div className="card-grid" style={{ marginBottom: "1rem" }}>
            <div className="stat-card">
              <div className="muted">Total en tokens</div>
              <div className="page-title" style={{ margin: 0 }}>{fmtUsd(current?.total ?? 0)}</div>
              {current?.fechaSnapshot && <div className="hint">Snapshot del {current.fechaSnapshot}</div>}
            </div>
          </div>
          <div className="toolbar" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn" onClick={actualizar} disabled={busy || !cuentaId}>
              {busy ? "Actualizando on-chain…" : "Actualizar"}
            </button>
          </div>

          <h2 className="section-title">Tokens</h2>
          {(current?.tokens.length ?? 0) === 0 ? (
            <p className="empty">Sin holdings todavía. Apretá Actualizar o configurá la watchlist.</p>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Red</th><th>Activo</th><th className="num">Cantidad</th><th className="num">Valor USD</th></tr></thead>
                <tbody>
                  {[...(current?.tokens ?? [])].sort((a, b) => b.valorUsd - a.valorUsd).map((t, i) => (
                    <tr key={i}>
                      <td>{nombreRed(t.red)}</td><td>{t.activo}</td>
                      <td className="num">{t.cantidad.toLocaleString("es-AR", { maximumFractionDigits: 6 })}</td>
                      <td className="num">{fmtUsd(t.valorUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {nftsView.length > 0 && (
            <>
              <h2 className="section-title">NFTs ({current?.nfts.length ?? 0})</h2>
              <p className="hint">Trackeados sin valuar (el floor price llega con OpenSea).</p>
              <div className="table-wrap">
                <table className="data">
                  <thead><tr><th>Red</th><th>Colección</th><th className="num">Cantidad</th></tr></thead>
                  <tbody>
                    {nftsView.map((c, i) => (
                      <tr key={i}><td>{nombreRed(c.red)}</td><td>{c.coleccion}</td><td className="num">{c.count}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {/* ---- SETUP / CURACIÓN ---- */}
      {modo === "setup" && (
        <>
          <p className="page-lead">
            Escaneá todas las redes, elegí qué tokens y NFTs seguir (curás el spam una vez) y guardá.
          </p>
          <div className="card form-grid" style={{ maxWidth: 560, marginBottom: "1.5rem" }}>
            <label>
              Dirección EOA (Ethereum / Arbitrum / Polygon)
              <input value={eoa} onChange={(e) => setEoa(e.target.value)} placeholder="0x…" />
            </label>
            <label>
              Dirección Abstract (opcional, suele diferir)
              <input value={abstract} onChange={(e) => setAbstract(e.target.value)} placeholder="0x…" />
            </label>
            <div className="btn-row">
              <button type="button" className="btn" onClick={escanear} disabled={busy || !eoa.trim()}>
                {busy && tokens.length === 0 ? "Escaneando redes… (puede tardar)" : "Escanear activos"}
              </button>
            </div>
          </div>

          {tokens.length > 0 && (
            <>
              <div className="toolbar" style={{ justifyContent: "space-between" }}>
                <p className="muted" style={{ margin: 0 }}>
                  Elegidos: <strong>{fmtUsd(totalElegido)}</strong> en tokens · <strong>{nftsElegidos}</strong> NFTs
                </p>
                <button type="button" className="btn" onClick={guardar} disabled={busy}>
                  {busy ? "Guardando…" : "Guardar watchlist"}
                </button>
              </div>

              <h2 className="section-title">Tokens con precio ({conPrecio.length})</h2>
              <div className="table-wrap">
                <table className="data">
                  <thead><tr><th></th><th>Red</th><th>Activo</th><th className="num">Cantidad</th><th className="num">Valor USD</th></tr></thead>
                  <tbody>
                    {conPrecio.map(({ t, i }) => (
                      <tr key={i}>
                        <td><input type="checkbox" checked={!!incToken[i]} onChange={(e) => setIncToken((p) => ({ ...p, [i]: e.target.checked }))} /></td>
                        <td>{nombreRed(t.red)}</td><td>{t.activo}</td>
                        <td className="num">{t.cantidad.toLocaleString("es-AR", { maximumFractionDigits: 6 })}</td>
                        <td className="num">{fmtUsd(t.valorUsd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {sinPrecio.length > 0 && <p className="hint">{sinPrecio.length} tokens sin precio (spam) — no se muestran.</p>}

              <h2 className="section-title">NFTs por colección ({colecciones.length})</h2>
              <p className="hint">Elegí las colecciones reales (el resto suelen ser airdrops de spam).</p>
              <div className="table-wrap">
                <table className="data">
                  <thead><tr><th></th><th>Red</th><th>Colección</th><th className="num">Cantidad</th></tr></thead>
                  <tbody>
                    {colecciones.map((c) => (
                      <tr key={c.key}>
                        <td><input type="checkbox" checked={!!incColeccion[c.key]} onChange={(e) => setIncColeccion((p) => ({ ...p, [c.key]: e.target.checked }))} /></td>
                        <td>{nombreRed(c.red)}</td><td>{c.coleccion}</td><td className="num">{c.items.length}</td>
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
