"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  hoyIso,
  mesActual,
  mesAnterior,
  rangoDeMes,
} from "@/lib/periodo";

type Props = {
  desde: string;
  hasta: string;
  onChange: (desde: string, hasta: string) => void;
};

const DIAS = ["lu", "ma", "mi", "ju", "vi", "sá", "do"] as const;
const MESES_CORTO = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];
const MESES_LARGO = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const DIAS_SEM = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function parseIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(iso: string, n: number): string {
  const d = parseIso(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toIso(d);
}

function startOfWeekMonday(iso: string): string {
  const d = parseIso(iso);
  const dow = d.getUTCDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + offset);
  return toIso(d);
}

function fmtTrigger(desde: string, hasta: string): string {
  const a = parseIso(desde);
  const b = parseIso(hasta);
  const da = a.getUTCDate();
  const db = b.getUTCDate();
  const ma = MESES_CORTO[a.getUTCMonth()];
  const mb = MESES_CORTO[b.getUTCMonth()];
  const ya = a.getUTCFullYear();
  const yb = b.getUTCFullYear();
  if (desde === hasta) return `${da} ${ma} ${ya}`;
  if (ya === yb && a.getUTCMonth() === b.getUTCMonth()) {
    return `${da} – ${db} ${ma} ${ya}`;
  }
  if (ya === yb) return `${da} ${ma} – ${db} ${mb} ${ya}`;
  return `${da} ${ma} ${ya} – ${db} ${mb} ${yb}`;
}

type PresetId =
  | "hoy"
  | "esta-semana"
  | "este-mes"
  | "mes-pasado"
  | "prox-semana"
  | "historico";

function presetRange(id: PresetId): { desde: string; hasta: string } {
  const hoy = hoyIso();
  if (id === "hoy") return { desde: hoy, hasta: hoy };
  if (id === "esta-semana") {
    const ini = startOfWeekMonday(hoy);
    return { desde: ini, hasta: addDays(ini, 6) };
  }
  if (id === "este-mes") return rangoDeMes(mesActual());
  if (id === "mes-pasado") return rangoDeMes(mesAnterior(mesActual()));
  if (id === "prox-semana") {
    const ini = addDays(startOfWeekMonday(hoy), 7);
    return { desde: ini, hasta: addDays(ini, 6) };
  }
  return { desde: "2025-01-01", hasta: hoy };
}

function presetMeta(id: PresetId): { label: string; sub: string } {
  const hoy = hoyIso();
  if (id === "hoy") {
    return { label: "Hoy", sub: DIAS_SEM[parseIso(hoy).getUTCDay()] };
  }
  if (id === "esta-semana") {
    const ini = startOfWeekMonday(hoy);
    return {
      label: "Esta semana",
      sub: `${parseIso(ini).getUTCDate()} ${MESES_CORTO[parseIso(ini).getUTCMonth()]}`,
    };
  }
  if (id === "este-mes") {
    return { label: "Este mes", sub: MESES_LARGO[parseIso(hoy).getUTCMonth()] };
  }
  if (id === "mes-pasado") {
    const m = mesAnterior(mesActual());
    const mo = Number(m.slice(5));
    return { label: "Mes pasado", sub: MESES_LARGO[mo - 1] };
  }
  if (id === "prox-semana") {
    const ini = addDays(startOfWeekMonday(hoy), 7);
    return {
      label: "Próx. semana",
      sub: `${parseIso(ini).getUTCDate()} ${MESES_CORTO[parseIso(ini).getUTCMonth()]}`,
    };
  }
  return { label: "Histórico", sub: "Todo" };
}

function detectPreset(desde: string, hasta: string): PresetId | null {
  const ids: PresetId[] = [
    "hoy",
    "esta-semana",
    "este-mes",
    "mes-pasado",
    "prox-semana",
    "historico",
  ];
  for (const id of ids) {
    const r = presetRange(id);
    if (r.desde === desde && r.hasta === hasta) return id;
  }
  return null;
}

function daysInMonthGrid(year: number, monthIndex: number): (string | null)[] {
  const first = new Date(Date.UTC(year, monthIndex, 1));
  let startDow = first.getUTCDay();
  startDow = startDow === 0 ? 6 : startDow - 1;
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= lastDay; d++) {
    cells.push(
      `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`
    );
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function normalizeRange(a: string, b: string): { desde: string; hasta: string } {
  return a <= b ? { desde: a, hasta: b } : { desde: b, hasta: a };
}

function CalendarIcon() {
  return (
    <svg
      className="drp-cal-icon"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

export function DateRangePicker({ desde, hasta, onChange }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  // Borrador: solo se confirma con "Aplicar".
  const [draftDesde, setDraftDesde] = useState(desde);
  const [draftHasta, setDraftHasta] = useState(hasta);
  const [pickStart, setPickStart] = useState<string | null>(null);
  const [view, setView] = useState(() => {
    const d = parseIso(desde);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
  });

  function syncDraftFromProps() {
    setDraftDesde(desde);
    setDraftHasta(hasta);
    setPickStart(null);
    const d = parseIso(desde);
    setView({ y: d.getUTCFullYear(), m: d.getUTCMonth() });
  }

  function openPanel() {
    syncDraftFromProps();
    setOpen(true);
  }

  function closeWithoutApply() {
    setOpen(false);
    setPickStart(null);
  }

  function applyAndClose() {
    const r = normalizeRange(draftDesde, draftHasta);
    onChange(r.desde, r.hasta);
    setOpen(false);
    setPickStart(null);
  }

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        closeWithoutApply();
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeWithoutApply();
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const activePreset = detectPreset(draftDesde, draftHasta);
  const cells = useMemo(() => daysInMonthGrid(view.y, view.m), [view.y, view.m]);

  const rangeStart = pickStart ?? draftDesde;
  const rangeEnd = pickStart ?? draftHasta;

  function setDraftRange(a: string, b: string) {
    const r = normalizeRange(a, b);
    setDraftDesde(r.desde);
    setDraftHasta(r.hasta);
    setPickStart(null);
  }

  function onDayClick(iso: string) {
    if (!pickStart) {
      setPickStart(iso);
      setDraftDesde(iso);
      setDraftHasta(iso);
      return;
    }
    setDraftRange(pickStart, iso);
  }

  function onPreset(id: PresetId) {
    const r = presetRange(id);
    setDraftDesde(r.desde);
    setDraftHasta(r.hasta);
    setPickStart(null);
    const d = parseIso(r.desde);
    setView({ y: d.getUTCFullYear(), m: d.getUTCMonth() });
  }

  function shiftMonth(delta: number) {
    const d = new Date(Date.UTC(view.y, view.m + delta, 1));
    setView({ y: d.getUTCFullYear(), m: d.getUTCMonth() });
  }

  function goToday() {
    const d = parseIso(hoyIso());
    setView({ y: d.getUTCFullYear(), m: d.getUTCMonth() });
  }

  function dayClass(iso: string | null): string {
    if (!iso) return "drp-day empty";
    const classes = ["drp-day"];
    const lo = rangeStart <= rangeEnd ? rangeStart : rangeEnd;
    const hi = rangeStart <= rangeEnd ? rangeEnd : rangeStart;
    const inRange = iso >= lo && iso <= hi;
    if (inRange) classes.push("in-range");
    if (iso === lo) classes.push("range-start");
    if (iso === hi) classes.push("range-end");
    if (iso === hoyIso()) classes.push("today");
    if (pickStart && iso === pickStart) classes.push("picking");
    return classes.join(" ");
  }

  const presets: PresetId[] = [
    "hoy",
    "esta-semana",
    "este-mes",
    "mes-pasado",
    "prox-semana",
    "historico",
  ];

  return (
    <div className="drp" ref={rootRef}>
      <button
        type="button"
        className={`drp-trigger${open ? " open" : ""}`}
        onClick={() => (open ? closeWithoutApply() : openPanel())}
        aria-expanded={open}
      >
        <CalendarIcon />
        <span>{fmtTrigger(desde, hasta)}</span>
        <span className="drp-chevron" aria-hidden>
          {open ? "▴" : "▾"}
        </span>
      </button>

      {open && (
        <div className="drp-panel">
          <div className="drp-inputs">
            <label>
              <span>DESDE</span>
              <input
                type="date"
                value={draftDesde}
                max={draftHasta}
                onChange={(e) => setDraftRange(e.target.value, draftHasta)}
              />
            </label>
            <span className="drp-arrow">→</span>
            <label>
              <span>HASTA</span>
              <input
                type="date"
                value={draftHasta}
                min={draftDesde}
                onChange={(e) => setDraftRange(draftDesde, e.target.value)}
              />
            </label>
          </div>

          <div className="drp-body">
            <aside className="drp-presets">
              {presets.map((id) => {
                const meta = presetMeta(id);
                return (
                  <button
                    key={id}
                    type="button"
                    className={`drp-preset${activePreset === id ? " active" : ""}`}
                    onClick={() => onPreset(id)}
                  >
                    <strong>{meta.label}</strong>
                    <span>{meta.sub}</span>
                  </button>
                );
              })}
            </aside>

            <div className="drp-cal">
              <div className="drp-cal-head">
                <strong>
                  {MESES_CORTO[view.m]} {view.y}
                </strong>
                <div className="drp-cal-nav">
                  <button type="button" className="btn-link" onClick={goToday}>
                    Hoy
                  </button>
                  <button
                    type="button"
                    className="btn-icon"
                    aria-label="Mes anterior"
                    onClick={() => shiftMonth(-1)}
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    className="btn-icon"
                    aria-label="Mes siguiente"
                    onClick={() => shiftMonth(1)}
                  >
                    ›
                  </button>
                </div>
              </div>
              <div className="drp-weekdays">
                {DIAS.map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </div>
              <div className="drp-grid">
                {cells.map((iso, i) =>
                  iso ? (
                    <button
                      key={iso}
                      type="button"
                      className={dayClass(iso)}
                      onClick={() => onDayClick(iso)}
                    >
                      {Number(iso.slice(8))}
                    </button>
                  ) : (
                    <span key={`e-${i}`} className="drp-day empty" />
                  )
                )}
              </div>
              {pickStart && (
                <p className="drp-hint">Elegí la fecha de fin del rango</p>
              )}
            </div>
          </div>

          <div className="drp-footer">
            <button type="button" className="btn btn-secondary" onClick={closeWithoutApply}>
              Cancelar
            </button>
            <button type="button" className="btn" onClick={applyAndClose}>
              Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
