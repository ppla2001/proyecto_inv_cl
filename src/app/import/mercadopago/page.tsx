"use client";

import { useEffect, useState } from "react";

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
  ignorarPorDefecto: boolean;
};

type Row = Candidate & {
  incluir: boolean;
  tipo: "gasto_real" | "ingreso_real" | "transferencia_interna";
  categoriaId: string;
  cuentaDestinoId: string;
};

const TIPOS = ["gasto_real", "ingreso_real", "transferencia_interna"] as const;

export default function ImportMpPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [cuentaOrigenId, setCuentaOrigenId] = useState("");
  const [moneda, setMoneda] = useState("ARS");
  const [selfNames, setSelfNames] = useState("PLA PEDRO, Pedro Pla");
  const [csvText, setCsvText] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/accounts").then((r) => r.json()),
      fetch("/api/categories").then((r) => r.json()),
    ]).then(([a, c]) => {
      setAccounts(a);
      setCategories(c);
    });
  }, []);

  function matchCategoria(nombre?: string): string {
    if (!nombre) return "";
    const found = categories.find((c) => c.nombre === nombre);
    return found ? String(found.id) : "";
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

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvText(await file.text());
  }

  async function parsear() {
    setError(null);
    setResultado(null);
    const res = await fetch("/api/import/mercadopago", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        csv: csvText,
        selfNames: selfNames.split(",").map((s) => s.trim()).filter(Boolean),
      }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(JSON.stringify(data.error));
      return;
    }
    const { candidates }: { candidates: Candidate[] } = await res.json();
    setRows(
      candidates.map((c) => ({
        ...c,
        incluir: !c.ignorarPorDefecto,
        tipo: c.tipoSugerido,
        categoriaId: matchCategoria(c.categoriaSugerida),
        cuentaDestinoId: destinoSugerido(c),
      }))
    );
  }

  function updateRow(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function confirmar() {
    setError(null);
    if (!cuentaOrigenId) {
      setError("Elegí la cuenta de Mercado Pago de origen.");
      return;
    }
    const aImportar = rows.filter((r) => r.incluir);
    let ok = 0;
    let fallidas = 0;

    for (const r of aImportar) {
      const payload = {
        fecha: r.fecha,
        monto: r.monto,
        moneda,
        cuentaId: Number(cuentaOrigenId),
        categoriaId:
          r.tipo !== "transferencia_interna" && r.categoriaId
            ? Number(r.categoriaId)
            : undefined,
        tipo: r.tipo,
        descripcion: r.descripcion,
        cuentaDestinoId:
          r.tipo === "transferencia_interna" && r.cuentaDestinoId
            ? Number(r.cuentaDestinoId)
            : undefined,
      };
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) ok++;
      else fallidas++;
    }

    setResultado(`Importadas: ${ok}. Fallidas: ${fallidas}.`);
    if (fallidas === 0) setRows([]);
  }

  const incluidas = rows.filter((r) => r.incluir).length;

  return (
    <main style={{ fontFamily: "system-ui", padding: "2rem", maxWidth: 1000 }}>
      <h1>Importar Mercado Pago</h1>
      <p>Subí el CSV de &quot;Resumen de cuenta&quot;. Revisá la clasificación sugerida antes de confirmar.</p>

      <div style={{ display: "grid", gap: "0.5rem", marginBottom: "1rem", maxWidth: 500 }}>
        <label>
          Cuenta de origen (Mercado Pago)
          <select value={cuentaOrigenId} onChange={(e) => setCuentaOrigenId(e.target.value)} required>
            <option value="" disabled>Elegir cuenta</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.nombre}</option>
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
          Tus nombres (para detectar transferencias entre cuentas propias)
          <input value={selfNames} onChange={(e) => setSelfNames(e.target.value)} />
        </label>
        <label>
          Archivo CSV
          <input type="file" accept=".csv" onChange={handleFile} />
        </label>
        <button type="button" onClick={parsear} disabled={!csvText}>Parsear</button>
      </div>

      {error && <p style={{ color: "red" }}>{error}</p>}
      {resultado && <p style={{ color: "green" }}>{resultado}</p>}

      {rows.length > 0 && (
        <>
          <p>
            {incluidas} de {rows.length} movimientos seleccionados.{" "}
            <button type="button" onClick={confirmar}>Confirmar importación</button>
          </p>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr>
                <th></th>
                <th align="left">Fecha</th>
                <th align="left">Descripción</th>
                <th align="right">Monto</th>
                <th align="left">Tipo</th>
                <th align="left">Categoría / Destino</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.referenceId} style={{ opacity: r.incluir ? 1 : 0.4 }}>
                  <td>
                    <input
                      type="checkbox"
                      checked={r.incluir}
                      onChange={(e) => updateRow(i, { incluir: e.target.checked })}
                    />
                  </td>
                  <td>{r.fecha}</td>
                  <td>{r.descripcion}</td>
                  <td align="right">{r.monto.toLocaleString("es-AR")}</td>
                  <td>
                    <select value={r.tipo} onChange={(e) => updateRow(i, { tipo: e.target.value as Row["tipo"] })}>
                      {TIPOS.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {r.tipo === "transferencia_interna" ? (
                      <select
                        value={r.cuentaDestinoId}
                        onChange={(e) => updateRow(i, { cuentaDestinoId: e.target.value })}
                      >
                        <option value="">Cuenta destino...</option>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>{a.nombre}</option>
                        ))}
                      </select>
                    ) : (
                      <select
                        value={r.categoriaId}
                        onChange={(e) => updateRow(i, { categoriaId: e.target.value })}
                      >
                        <option value="">Sin categoría</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>{c.nombre} ({c.tipo})</option>
                        ))}
                      </select>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </main>
  );
}
