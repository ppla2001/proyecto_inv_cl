"use client";

import { useEffect, useState } from "react";
import { apiFetch, mensajeDeError } from "@/lib/api-client";

type Account = {
  id: number;
  nombre: string;
  plataforma: string;
  tipoCuenta: string;
  grupo: string;
  monedaDefault: string;
  origen: string;
  identificadorExterno: string | null;
  activa: boolean;
};

const PLATAFORMAS = ["mercado_pago", "binance", "metamask", "balanz"] as const;
const TIPOS_CUENTA = ["activo", "pasivo"] as const;
const GRUPOS = ["uso", "ahorro", "inversion"] as const;
const ORIGENES = [
  "manual",
  "api_binance",
  "api_mercadopago",
  "onchain_metamask",
] as const;

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [nombre, setNombre] = useState("");
  const [plataforma, setPlataforma] = useState<string>(PLATAFORMAS[0]);
  const [tipoCuenta, setTipoCuenta] = useState<string>(TIPOS_CUENTA[0]);
  const [grupo, setGrupo] = useState<string>(GRUPOS[0]);
  const [monedaDefault, setMonedaDefault] = useState("ARS");
  const [origen, setOrigen] = useState<string>(ORIGENES[0]);
  const [identificadorExterno, setIdentificadorExterno] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function cargarCuentas() {
    try {
      setAccounts(await apiFetch<Account[]>("/api/accounts"));
    } catch (e) {
      setError(mensajeDeError(e));
    }
  }

  useEffect(() => {
    cargarCuentas();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre,
          plataforma,
          tipoCuenta,
          grupo,
          monedaDefault,
          origen,
          identificadorExterno: identificadorExterno || undefined,
        }),
      });
    } catch (e) {
      setError(mensajeDeError(e));
      return;
    }
    setNombre("");
    setIdentificadorExterno("");
    await cargarCuentas();
  }

  return (
    <main style={{ fontFamily: "system-ui", padding: "2rem", maxWidth: 600 }}>
      <h1>Cuentas</h1>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: "0.5rem", marginBottom: "2rem" }}>
        <label>
          Nombre
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
        </label>
        <label>
          Plataforma
          <select value={plataforma} onChange={(e) => setPlataforma(e.target.value)}>
            {PLATAFORMAS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </label>
        <label>
          Tipo de cuenta
          <select value={tipoCuenta} onChange={(e) => setTipoCuenta(e.target.value)}>
            {TIPOS_CUENTA.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          Grupo (bloque del dashboard)
          <select value={grupo} onChange={(e) => setGrupo(e.target.value)}>
            {GRUPOS.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </label>
        <label>
          Moneda default
          <input value={monedaDefault} onChange={(e) => setMonedaDefault(e.target.value)} required />
        </label>
        <label>
          Origen
          <select value={origen} onChange={(e) => setOrigen(e.target.value)}>
            {ORIGENES.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </label>
        <label>
          Identificador externo (opcional)
          <input
            value={identificadorExterno}
            onChange={(e) => setIdentificadorExterno(e.target.value)}
            placeholder="ej. address de wallet"
          />
        </label>
        <button type="submit">Agregar cuenta</button>
        {error && <p style={{ color: "red" }}>{error}</p>}
      </form>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th align="left">Nombre</th>
            <th align="left">Plataforma</th>
            <th align="left">Tipo</th>
            <th align="left">Grupo</th>
            <th align="left">Moneda</th>
            <th align="left">Origen</th>
            <th align="left">Activa</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((a) => (
            <tr key={a.id}>
              <td>{a.nombre}</td>
              <td>{a.plataforma}</td>
              <td>{a.tipoCuenta}</td>
              <td>{a.grupo}</td>
              <td>{a.monedaDefault}</td>
              <td>{a.origen}</td>
              <td>{a.activa ? "sí" : "no"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
