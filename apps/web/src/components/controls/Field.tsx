'use client';

import { useId } from 'react';

const LABEL = 'text-xs font-medium text-slate-600 dark:text-slate-300';
const INPUT =
  'w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 ' +
  'outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 ' +
  'dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:ring-sky-900';

function Row({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[1fr_9rem] items-center gap-2 py-1">
      <div>
        <div className={LABEL}>{label}</div>
        {hint !== undefined && <div className="text-[10px] text-slate-400">{hint}</div>}
        {/* O erro fica JUNTO do campo, nao numa lista no rodape: o painel e
            gerado e pode ter vinte linhas, e um erro longe do controle obriga o
            usuario a adivinhar qual deles esta errado. */}
        {error !== undefined && (
          <div role="alert" className="text-[10px] font-medium text-amber-600 dark:text-amber-400">
            {error}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

export function SelectField({
  label,
  hint,
  error,
  value,
  options,
  placeholder,
  onChange,
}: {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  value: string;
  options: { value: string; label: string }[];
  /** Opcao vazia inicial. Usada quando "nao escolhido" e um estado legitimo. */
  placeholder?: string | undefined;
  onChange: (v: string) => void;
}) {
  return (
    <Row label={label} hint={hint} error={error}>
      <select
        className={error === undefined ? INPUT : `${INPUT} border-amber-400`}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        aria-label={label}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Row>
  );
}

export function NumberField({
  label,
  hint,
  error,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <Row label={label} hint={hint} error={error}>
      <div className="flex items-center gap-2">
        <input
          type="range"
          className="min-w-0 flex-1 accent-sky-600"
          value={value}
          min={min}
          max={max}
          onChange={(e) => {
            onChange(Number(e.target.value));
          }}
          aria-label={label}
        />
        {/* O numero ao lado do slider nao e decorativo: o registro tem campos em
            que o valor exato importa (espessura, opacidade) e um slider sozinho
            nao permite reproduzir um valor. */}
        <span className="w-8 shrink-0 text-right text-xs tabular-nums text-slate-500">{value}</span>
      </div>
    </Row>
  );
}

export function ColorField({
  label,
  hint,
  error,
  value,
  onChange,
}: {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  value: string;
  onChange: (v: string) => void;
}) {
  const id = useId();
  return (
    <Row label={label} hint={hint} error={error}>
      <div className="flex items-center gap-1.5">
        <input
          id={id}
          type="color"
          className="h-8 w-8 shrink-0 cursor-pointer rounded border border-slate-300 bg-transparent dark:border-slate-600"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
          }}
          aria-label={label}
        />
        {/* Campo de texto tambem: o seletor nativo nao permite colar um hex de
            manual de marca, que e como um designer trabalha. */}
        <input
          type="text"
          className={INPUT}
          value={value}
          spellCheck={false}
          onChange={(e) => {
            onChange(e.target.value);
          }}
          aria-label={`${label} (hexadecimal)`}
        />
      </div>
    </Row>
  );
}

export function ToggleField({
  label,
  hint,
  error,
  value,
  onChange,
}: {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Row label={label} hint={hint} error={error}>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={label}
        onClick={() => {
          onChange(!value);
        }}
        className={`relative h-6 w-11 rounded-full transition-colors ${
          value ? 'bg-sky-500' : 'bg-slate-300 dark:bg-slate-600'
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
            value ? 'left-[1.375rem]' : 'left-0.5'
          }`}
        />
      </button>
    </Row>
  );
}

export function TextField({
  label,
  hint,
  error,
  value,
  maxLength,
  onChange,
}: {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  value: string;
  maxLength?: number | undefined;
  onChange: (v: string) => void;
}) {
  return (
    <Row label={label} hint={hint} error={error}>
      <input
        type="text"
        className={error === undefined ? INPUT : `${INPUT} border-amber-400`}
        value={value}
        maxLength={maxLength}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        aria-label={label}
      />
    </Row>
  );
}
