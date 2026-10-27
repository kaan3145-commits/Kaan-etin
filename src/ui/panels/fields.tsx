import { type ReactNode, useEffect, useState } from 'react';
import type { Material, Provenance } from '../../core/model/types';

interface NumberFieldProps {
  label: string;
  value: number | null;
  onCommit: (v: number | null) => void;
  unit?: string;
  step?: number;
  min?: number;
  disabled?: boolean;
  /** Allows clearing the field to commit `null` (e.g. "fill"). */
  nullable?: string;
  provenance?: Provenance;
  onProvenance?: (p: Provenance) => void;
  testId?: string;
}

/** Numeric input that commits on Enter/blur, so each edit is one undo step. */
export function NumberField(p: NumberFieldProps) {
  const [text, setText] = useState(p.value === null ? '' : String(p.value));
  useEffect(() => setText(p.value === null ? '' : String(p.value)), [p.value]);

  const commit = () => {
    const t = text.trim().replace(',', '.');
    if (t === '' && p.nullable) {
      if (p.value !== null) p.onCommit(null);
      return;
    }
    const v = Number(t);
    if (!Number.isFinite(v)) {
      setText(p.value === null ? '' : String(p.value));
      return;
    }
    if (v !== p.value) p.onCommit(v);
  };

  return (
    <label className="field">
      <span className="field-label">
        {p.label}
        {p.provenance && (
          <button
            type="button"
            className={`prov prov-${p.provenance}`}
            title="Value provenance — click to toggle measured / assumed"
            onClick={(e) => {
              e.preventDefault();
              p.onProvenance?.(p.provenance === 'measured' ? 'assumed' : 'measured');
            }}
          >
            {p.provenance}
          </button>
        )}
      </span>
      <span className="field-input">
        <input
          data-testid={p.testId}
          type="text"
          inputMode="decimal"
          value={text}
          placeholder={p.nullable}
          disabled={p.disabled}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') setText(p.value === null ? '' : String(p.value));
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault();
              const step = (p.step ?? 1) * (e.shiftKey ? 10 : 1) * (e.key === 'ArrowUp' ? 1 : -1);
              const v = Math.max(p.min ?? -Infinity, (Number(text) || 0) + step);
              setText(String(v));
              p.onCommit(v);
            }
          }}
        />
        {p.unit && <span className="unit">{p.unit}</span>}
      </span>
    </label>
  );
}

export function TextField(p: { label: string; value: string; onCommit: (v: string) => void }) {
  const [text, setText] = useState(p.value);
  useEffect(() => setText(p.value), [p.value]);
  return (
    <label className="field">
      <span className="field-label">{p.label}</span>
      <span className="field-input">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => text.trim() && text !== p.value && p.onCommit(text.trim())}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      </span>
    </label>
  );
}

export function SelectField<T extends string>(p: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
  testId?: string;
}) {
  return (
    <label className="field">
      <span className="field-label">{p.label}</span>
      <span className="field-input">
        <select data-testid={p.testId} value={p.value} onChange={(e) => p.onChange(e.target.value as T)}>
          {p.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </span>
    </label>
  );
}

export function MaterialField(p: { label?: string; value: string; materials: Material[]; onChange: (id: string) => void; allowInherit?: boolean }) {
  const mat = p.materials.find((m) => m.id === p.value);
  return (
    <label className="field">
      <span className="field-label">{p.label ?? 'Material'}</span>
      <span className="field-input">
        <span className="swatch" style={{ background: mat?.color ?? 'transparent' }} />
        <select value={p.value} onChange={(e) => p.onChange(e.target.value)}>
          {p.allowInherit && <option value="">— inherit from region —</option>}
          {p.materials.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </span>
    </label>
  );
}

export function Toggle(p: { label: string; checked: boolean; onChange: (v: boolean) => void; testId?: string }) {
  return (
    <label className="toggle">
      <input data-testid={p.testId} type="checkbox" checked={p.checked} onChange={(e) => p.onChange(e.target.checked)} />
      <span>{p.label}</span>
    </label>
  );
}

export function Section(p: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="panel-section">
      <header>
        <h3>{p.title}</h3>
        {p.actions}
      </header>
      <div className="panel-section-body">{p.children}</div>
    </section>
  );
}

export function ReadOnly(p: { label: string; value: ReactNode; testId?: string }) {
  return (
    <div className="field readonly">
      <span className="field-label">{p.label}</span>
      <span className="field-value" data-testid={p.testId}>
        {p.value}
      </span>
    </div>
  );
}
