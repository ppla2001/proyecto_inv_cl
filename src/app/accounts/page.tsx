"use client";

import { useEffect, useState } from "react";
import { apiFetch, mensajeDeError } from "@/lib/api-client";
import { Modal } from "@/components/Modal";

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

type FormState = {
  nombre: string;
  plataforma: string;
  tipoCuenta: string;
  grupo: string;
  monedaDefault: string;
  origen: string;
  identificadorExterno: string;
  activa: boolean;
};

const emptyForm: FormState = {
  nombre: "",
  plataforma: PLATAFORMAS[0],
  tipoCuenta: TIPOS_CUENTA[0],
  grupo: GRUPOS[0],
  monedaDefault: "ARS",
  origen: ORIGENES[0],
  identificadorExterno: "",
  activa: true,
};

function AccountFormFields({
  form,
  setField,
  showActiva,
}: {
  form: FormState;
  setField: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  showActiva?: boolean;
}) {
  return (
    <div className="form-grid">
      <label>
        Nombre
        <input
          value={form.nombre}
          onChange={(e) => setField("nombre", e.target.value)}
          required
        />
      </label>
      <label>
        Plataforma
        <select
          value={form.plataforma}
          onChange={(e) => setField("plataforma", e.target.value)}
        >
          {PLATAFORMAS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>
      <label>
        Tipo de cuenta
        <select
          value={form.tipoCuenta}
          onChange={(e) => setField("tipoCuenta", e.target.value)}
        >
          {TIPOS_CUENTA.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label>
        Grupo
        <select value={form.grupo} onChange={(e) => setField("grupo", e.target.value)}>
          {GRUPOS.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </label>
      <label>
        Moneda default
        <input
          value={form.monedaDefault}
          onChange={(e) => setField("monedaDefault", e.target.value)}
          required
        />
      </label>
      <label>
        Origen
        <select value={form.origen} onChange={(e) => setField("origen", e.target.value)}>
          {ORIGENES.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </label>
      <label>
        Identificador externo (opcional)
        <input
          value={form.identificadorExterno}
          onChange={(e) => setField("identificadorExterno", e.target.value)}
          placeholder="ej. address de wallet"
        />
      </label>
      {showActiva && (
        <label>
          Activa
          <select
            value={form.activa ? "si" : "no"}
            onChange={(e) => setField("activa", e.target.value === "si")}
          >
            <option value="si">sí</option>
            <option value="no">no</option>
          </select>
        </label>
      )}
    </div>
  );
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [createForm, setCreateForm] = useState(emptyForm);
  const [editForm, setEditForm] = useState(emptyForm);
  const [editId, setEditId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);

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

  function setCreateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setCreateForm((f) => ({ ...f, [key]: value }));
  }
  function setEditField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setEditForm((f) => ({ ...f, [key]: value }));
  }

  function abrirEdicion(a: Account) {
    setEditId(a.id);
    setEditForm({
      nombre: a.nombre,
      plataforma: a.plataforma,
      tipoCuenta: a.tipoCuenta,
      grupo: a.grupo,
      monedaDefault: a.monedaDefault,
      origen: a.origen,
      identificadorExterno: a.identificadorExterno ?? "",
      activa: a.activa,
    });
    setModalError(null);
  }

  function cerrarModal() {
    setEditId(null);
    setModalError(null);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: createForm.nombre,
          plataforma: createForm.plataforma,
          tipoCuenta: createForm.tipoCuenta,
          grupo: createForm.grupo,
          monedaDefault: createForm.monedaDefault,
          origen: createForm.origen,
          identificadorExterno: createForm.identificadorExterno || undefined,
        }),
      });
    } catch (err) {
      setError(mensajeDeError(err));
      return;
    }
    setCreateForm(emptyForm);
    await cargarCuentas();
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (editId == null) return;
    setModalError(null);
    try {
      await apiFetch(`/api/accounts/${editId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: editForm.nombre,
          plataforma: editForm.plataforma,
          tipoCuenta: editForm.tipoCuenta,
          grupo: editForm.grupo,
          monedaDefault: editForm.monedaDefault,
          origen: editForm.origen,
          identificadorExterno: editForm.identificadorExterno || null,
          activa: editForm.activa,
        }),
      });
    } catch (err) {
      setModalError(mensajeDeError(err));
      return;
    }
    cerrarModal();
    await cargarCuentas();
  }

  async function eliminar(a: Account) {
    if (
      !confirm(
        `¿Eliminar la cuenta “${a.nombre}”? Solo se puede si no tiene movimientos asociados.`
      )
    ) {
      return;
    }
    setError(null);
    try {
      await apiFetch(`/api/accounts/${a.id}`, { method: "DELETE" });
      if (editId === a.id) cerrarModal();
      await cargarCuentas();
    } catch (err) {
      setError(
        `${mensajeDeError(err)} Si tiene movimientos, borrá o reasigná esos movimientos primero.`
      );
    }
  }

  return (
    <main className="app-main narrow">
      <h1 className="page-title">Cuentas</h1>
      <p className="page-lead">Plataformas propias y pasivos (ej. tarjeta).</p>

      <form onSubmit={handleCreate} className="card form-grid">
        <h2 className="section-title" style={{ marginBottom: 0 }}>
          Nueva cuenta
        </h2>
        <AccountFormFields form={createForm} setField={setCreateField} />
        <div className="btn-row">
          <button type="submit" className="btn">
            Agregar cuenta
          </button>
        </div>
        {error && <div className="alert alert-error">{error}</div>}
      </form>

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Plataforma</th>
              <th>Tipo</th>
              <th>Grupo</th>
              <th>Moneda</th>
              <th>Activa</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id} className={a.activa ? undefined : "dim"}>
                <td>{a.nombre}</td>
                <td>{a.plataforma}</td>
                <td>{a.tipoCuenta}</td>
                <td>{a.grupo}</td>
                <td>{a.monedaDefault}</td>
                <td>{a.activa ? "sí" : "no"}</td>
                <td className="actions-cell">
                  <button
                    type="button"
                    className="btn-sm"
                    onClick={() => abrirEdicion(a)}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="btn-sm danger"
                    onClick={() => eliminar(a)}
                  >
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        title="Editar cuenta"
        open={editId != null}
        onClose={cerrarModal}
      >
        <form onSubmit={handleSaveEdit} className="form-grid">
          <AccountFormFields form={editForm} setField={setEditField} showActiva />
          {modalError && <div className="alert alert-error">{modalError}</div>}
          <div className="btn-row">
            <button type="submit" className="btn">
              Guardar
            </button>
            <button type="button" className="btn btn-secondary" onClick={cerrarModal}>
              Cancelar
            </button>
          </div>
        </form>
      </Modal>
    </main>
  );
}
