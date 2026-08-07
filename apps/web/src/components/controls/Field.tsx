'use client';

import {
  ARTBOARD_MAX,
  ARTBOARD_MIN,
  RECT_MIN_SIZE,
  type Artboard,
  type NodeRect,
} from '@vislow/component-registry';
import { MoveHorizontal, SlidersHorizontal } from 'lucide-react';
import { PanelSectionHeading } from '@/components/PanelSection';
import { useEffect, useId, useRef, useState } from 'react';
import { ARTBOARD_PRESETS } from '@/lib/artboard';
import { axisLimitsPx, pxToPercent, rectToPx } from '@/lib/units';
import { cn } from '@/lib/utils';

const LABEL = 'text-body font-medium text-muted-foreground';
const INPUT =
  'w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-sm text-foreground ' +
  'outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30';

function Row({
  label,
  hint,
  error,
  labelFor,
  publish,
  children,
}: {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  labelFor?: string | undefined;
  publish?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[1.5rem_1fr_9rem] items-center gap-2 py-1">
      <div className="flex justify-center">{publish}</div>
      <div>
        {labelFor === undefined ? (
          <div className={LABEL}>{label}</div>
        ) : (
          <label htmlFor={labelFor} className={`block ${LABEL}`}>
            {label}
          </label>
        )}
        {hint !== undefined && <div className="text-micro text-muted-foreground">{hint}</div>}
        {/* O erro fica JUNTO do campo, nao numa lista no rodape: o painel e
            gerado e pode ter vinte linhas, e um erro longe do controle obriga o
            usuario a adivinhar qual deles esta errado. */}
        {error !== undefined && (
          <div role="alert" className="text-micro font-medium text-warning">
            {error}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

export function PublishToggle({
  label,
  exposed,
  onToggle,
}: {
  label: string;
  exposed: boolean;
  onToggle: (exposed: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={exposed}
      aria-label={`Publicar ${label} no painel do Power BI`}
      title={
        exposed
          ? `${label} aparece no painel do Power BI`
          : `Publicar ${label} no painel do Power BI`
      }
      onClick={() => {
        onToggle(!exposed);
      }}
      className={cn(
        'flex size-6 items-center justify-center rounded transition-colors outline-none',
        'focus-visible:ring-3 focus-visible:ring-ring/50',
        exposed
          ? 'bg-primary/10 text-primary hover:bg-primary/20'
          : 'text-muted-foreground/50 hover:bg-muted hover:text-foreground',
      )}
      style={{ touchAction: 'manipulation' }}
    >
      {/* Fora de um `Button`, ninguem encolhe o lucide: sem `size-*` ele entra
          com os 24px de fabrica e estoura a calha. */}
      <SlidersHorizontal className="size-3" />
    </button>
  );
}

export function SelectField({
  label,
  hint,
  error,
  publish,
  value,
  options,
  placeholder,
  onChange,
}: {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  publish?: React.ReactNode | undefined;
  value: string;
  options: { value: string; label: string }[];
  placeholder?: string | undefined;
  onChange: (v: string) => void;
}) {
  return (
    <Row label={label} hint={hint} error={error} publish={publish}>
      {/* `bg-card` explicito, sobrepondo o `bg-transparent` do INPUT: um
          `<select>` NATIVO com fundo transparente deixa o navegador desenhar a
          lista de opcoes sobre o que estiver atras dela, e o texto fica ilegivel
          em cima do painel. Campo de texto pode ser transparente; select, nao. */}
      <select
        className={
          cn(INPUT, 'bg-card', error !== undefined && 'border-warning')
        }
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

const SCRUB_PX_PER_STEP = 4;

/** Digitavel e ajustavel arrastando o rotulo. Substituiu o slider, que gastava largura e nao dava precisao. */
export function NumberInput({
  label,
  hint,
  error,
  publish,
  value,
  min,
  max,
  unit,
  onChange,
  onGestureStart,
  onGestureEnd,
}: {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  publish?: React.ReactNode | undefined;
  value: number;
  min: number;
  max: number;
  unit?: string | undefined;
  onChange: (v: number) => void;
  onGestureStart?: (() => void) | undefined;
  onGestureEnd?: (() => void) | undefined;
}) {
  const id = useId();
  const [draft, setDraft] = useState(String(value));
  const [scrubbing, setScrubbing] = useState(false);
  const scrub = useRef<{ pointerId: number; x: number; from: number } | null>(null);

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const fit = (n: number): number => Math.min(Math.max(Math.round(n), min), max);
  const range = `${label} entre ${String(min)} e ${String(max)}${unit ? ` ${unit}` : ''}.`;

  const parsed = Number(draft.trim());
  const invalid = draft.trim() === '' || !Number.isFinite(parsed) || parsed < min || parsed > max;

  const commit = (): void => {
    const n = Number(draft.trim());
    if (draft.trim() === '' || !Number.isFinite(n)) {
      setDraft(String(value));
      return;
    }
    const fitted = fit(n);
    setDraft(String(fitted));
    if (fitted !== value) onChange(fitted);
  };

  return (
    <Row label={label} hint={hint} error={error} publish={publish} labelFor={id}>
      <div className="flex items-center gap-1.5">
        {/*
          A ALCA DE ARRASTO. O rotulo visivel da linha e o `<label>` do `Row`,
          que aponta para o input; esta alca so duplica, por ponteiro, o que as
          setas do proprio campo ja fazem. Por isso ela e decorativa: um segundo
          ponto de parada no Tab anunciando a mesma coisa so alonga a travessia
          do painel.
        */}
        <span
          aria-hidden="true"
          role="presentation"
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            scrub.current = { pointerId: event.pointerId, x: event.clientX, from: value };
            setScrubbing(true);
            onGestureStart?.();
          }}
          onPointerMove={(event) => {
            const active = scrub.current;
            if (active?.pointerId !== event.pointerId) return;
            const steps = Math.round((event.clientX - active.x) / SCRUB_PX_PER_STEP);
            const next = fit(active.from + steps * (event.shiftKey ? 10 : 1));
            setDraft(String(next));
            if (next !== value) onChange(next);
          }}
          onPointerUp={(event) => {
            if (scrub.current?.pointerId !== event.pointerId) return;
            scrub.current = null;
            setScrubbing(false);
            onGestureEnd?.();
          }}
          onPointerCancel={() => {
            if (!scrub.current) return;
            scrub.current = null;
            setScrubbing(false);
            onGestureEnd?.();
          }}
          className={`shrink-0 cursor-ew-resize select-none rounded px-1 text-micro font-semibold ${
            scrubbing
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
          style={{ touchAction: 'none' }}
        >
          <MoveHorizontal className="size-3" />
        </span>

        <label
          htmlFor={id}
          className={`flex min-w-0 flex-1 items-center gap-1 rounded-md border bg-transparent px-2 py-1 focus-within:ring-3 dark:bg-input/30 ${
            invalid
              ? 'border-warning focus-within:border-warning focus-within:ring-warning/50'
              : 'border-input focus-within:border-ring focus-within:ring-ring/50'
          }`}
        >
          {/* O spinner nativo fica escondido pelo mesmo motivo do `RectField`:
              numa coluna de 9rem ele come a largura do proprio numero. As setas
              do teclado continuam funcionando, de 1 em 1. */}
          <input
            id={id}
            type="number"
            inputMode="numeric"
            name={`prop-${label.toLowerCase().replace(/\s+/gu, '-')}`}
            autoComplete="off"
            step={1}
            min={min}
            max={max}
            value={draft}
            aria-invalid={invalid}
            aria-describedby={`${id}-range`}
            onChange={(event) => {
              setDraft(event.target.value);
            }}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commit();
              }
              if (event.key === 'Escape') setDraft(String(value));
            }}
            onWheel={(event) => {
              event.currentTarget.blur();
            }}
            className="min-w-0 flex-1 bg-transparent text-right font-mono text-ui tabular-nums text-foreground outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          {unit !== undefined && (
            <span aria-hidden="true" className="shrink-0 text-micro text-muted-foreground">
              {unit}
            </span>
          )}
        </label>
      </div>
      <span id={`${id}-range`} className="sr-only">
        {range} Arraste o rotulo na horizontal para ajustar.
      </span>
    </Row>
  );
}

/** FALA PIXEL, guarda percentual: a spec e proporcional porque o visual nao escolhe o proprio tamanho. */
export function RectField({
  value,
  parent,
  error,
  onChange,
}: {
  value: NodeRect;
  parent?: { width: number; height: number } | undefined;
  error?: string | undefined;
  onChange: (axis: 'x' | 'y' | 'w' | 'h', v: number) => void;
}) {
  const axes = [
    { key: 'x', mark: 'X', label: 'Distancia da esquerda' },
    { key: 'y', mark: 'Y', label: 'Distancia do topo' },
    { key: 'w', mark: 'L', label: 'Largura' },
    { key: 'h', mark: 'A', label: 'Altura' },
  ] as const;

  const px = rectToPx(value, parent);

  return (
    <section className="py-2">
      <PanelSectionHeading className="mb-1.5">Posicao e tamanho</PanelSectionHeading>

      <div className="grid grid-cols-2 gap-1.5">
        {axes.map((axis) => {
          const limits = px && axisLimitsPx(axis.key, value, parent);
          const unit = px ? 'px' : '%';

          return (
            <label
              key={axis.key}
              className="flex items-center gap-1.5 rounded-md border border-input bg-transparent px-2 py-1 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30"
            >
              <span
                aria-hidden="true"
                className="w-2.5 shrink-0 text-micro font-semibold text-muted-foreground"
              >
                {axis.mark}
              </span>
              {/* Em pixel as setas do teclado andam de 1 em 1 — o passo que a
                  palavra "pixel" promete. Sem medida, volta ao meio ponto
                  percentual. O spinner nativo fica escondido: em duas colunas de
                  140px ele come a largura do proprio numero. */}
              <input
                type="number"
                inputMode="decimal"
                name={`rect-${axis.key}`}
                autoComplete="off"
                step={px ? 1 : 0.5}
                min={limits ? limits.min : axis.key === 'x' || axis.key === 'y' ? 0 : RECT_MIN_SIZE}
                max={limits ? limits.max : 100}
                value={px ? px[axis.key] : value[axis.key]}
                aria-label={`${axis.label}, em ${px ? 'pixels' : 'porcentagem'}`}
                onChange={(e) => {
                  const parsed = Number(e.target.value);
                  if (Number.isNaN(parsed)) return;
                  if (!px) {
                    onChange(axis.key, parsed);
                    return;
                  }
                  const size =
                    axis.key === 'x' || axis.key === 'w' ? parent?.width : parent?.height;
                  const percent = pxToPercent(parsed, size);
                  if (percent !== undefined) onChange(axis.key, percent);
                }}
                className="min-w-0 flex-1 bg-transparent text-right font-mono text-ui tabular-nums text-foreground outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <span aria-hidden="true" className="shrink-0 text-micro text-muted-foreground">
                {unit}
              </span>
            </label>
          );
        })}
      </div>

      {error !== undefined && (
        <div
          role="alert"
          className="mt-1 text-micro font-medium text-warning"
        >
          {error}
        </div>
      )}
    </section>
  );
}

export function ArtboardField({
  value,
  onChange,
}: {
  value: Artboard;
  onChange: (size: Artboard) => void;
}) {
  const [message, setMessage] = useState('');

  const apply = (size: Artboard): void => {
    setMessage('');
    onChange(size);
  };

  return (
    <section className="py-2">
      <PanelSectionHeading className="mb-1.5">Prancheta</PanelSectionHeading>

      <div className="grid grid-cols-2 gap-1.5">
        <ArtboardAxis
          mark="L"
          label="Largura"
          value={value.width}
          min={ARTBOARD_MIN.width}
          max={ARTBOARD_MAX.width}
          onReport={setMessage}
          onCommit={(width) => {
            apply({ width, height: value.height });
          }}
        />
        <ArtboardAxis
          mark="A"
          label="Altura"
          value={value.height}
          min={ARTBOARD_MIN.height}
          max={ARTBOARD_MAX.height}
          onReport={setMessage}
          onCommit={(height) => {
            apply({ width: value.width, height });
          }}
        />
      </div>

      <div role="group" aria-label="Proporcoes comuns" className="mt-1.5 flex items-center gap-1">
        {ARTBOARD_PRESETS.map((preset) => {
          const active = value.width === preset.size.width && value.height === preset.size.height;
          return (
            <button
              key={preset.label}
              type="button"
              onClick={() => {
                apply(preset.size);
              }}
              aria-pressed={active}
              aria-label={`${preset.label} — ${String(preset.size.width)} por ${String(preset.size.height)} pixels`}
              className={`flex-1 rounded-md px-1.5 py-1 text-label font-medium tabular-nums transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${
                active
                  ? 'bg-foreground text-background hover:bg-foreground/90'
                  : 'bg-card text-muted-foreground ring-1 ring-border hover:bg-muted'
              }`}
              style={{ touchAction: 'manipulation' }}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      {/* Altura reservada: a mensagem entra e sai sem empurrar os campos abaixo
          dela — um painel que se move enquanto se digita nele e o proprio
          defeito. `polite` porque a correcao acompanha a digitacao; ela nao
          interrompe o que o leitor de tela estiver dizendo. */}
      <p
        aria-live="polite"
        className="mt-1 min-h-3.5 text-micro font-medium text-warning"
      >
        {message}
      </p>
    </section>
  );
}

/** Guarda o texto DIGITADO, nao o numero — ao contrario do `RectField`, que escreve a cada tecla. */
function ArtboardAxis({
  mark,
  label,
  value,
  min,
  max,
  onCommit,
  onReport,
}: {
  mark: string;
  label: string;
  value: number;
  min: number;
  max: number;
  onCommit: (value: number) => void;
  onReport: (message: string) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const parsed = Number(draft.trim());
  const invalid =
    draft.trim() === '' || !Number.isFinite(parsed) || parsed < min || parsed > max;
  const range = `${label} entre ${String(min)} e ${String(max)} px.`;

  const commit = (): void => {
    const n = Number(draft.trim());
    if (draft.trim() === '' || !Number.isFinite(n)) {
      setDraft(String(value));
      onReport('');
      return;
    }
    const fitted = Math.min(Math.max(Math.round(n), min), max);
    setDraft(String(fitted));
    onReport('');
    onCommit(fitted);
  };

  return (
    <label
      htmlFor={id}
      className={`flex items-center gap-1.5 rounded-md border bg-transparent px-2 py-1 focus-within:ring-3 dark:bg-input/30 ${
        invalid
          ? 'border-warning focus-within:border-warning focus-within:ring-warning/50'
          : 'border-input focus-within:border-ring focus-within:ring-ring/50'
      }`}
    >
      <span aria-hidden="true" className="w-2.5 shrink-0 text-micro font-semibold text-muted-foreground">
        {mark}
      </span>
      {/* O spinner nativo fica escondido pelo mesmo motivo do `RectField`: em
          duas colunas estreitas ele come a largura do proprio numero. As setas do
          teclado continuam funcionando. */}
      <input
        id={id}
        type="number"
        inputMode="numeric"
        name={`artboard-${mark.toLowerCase()}`}
        autoComplete="off"
        step={1}
        min={min}
        max={max}
        value={draft}
        aria-label={`${label} da prancheta, em pixels`}
        aria-invalid={invalid}
        aria-describedby={`${id}-range`}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          const n = Number(next.trim());
          const bad = next.trim() === '' || !Number.isFinite(n) || n < min || n > max;
          onReport(bad ? range : '');
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
          }
          if (event.key === 'Escape') {
            setDraft(String(value));
            onReport('');
          }
        }}
        onWheel={(event) => {
          event.currentTarget.blur();
        }}
        className="min-w-0 flex-1 bg-transparent text-right font-mono text-ui tabular-nums text-foreground outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <span aria-hidden="true" className="shrink-0 text-micro text-muted-foreground">
        px
      </span>
      <span id={`${id}-range`} className="sr-only">
        {range}
      </span>
    </label>
  );
}

export function ColorField({
  label,
  hint,
  error,
  publish,
  value,
  onChange,
}: {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  publish?: React.ReactNode | undefined;
  value: string;
  onChange: (v: string) => void;
}) {
  const id = useId();
  return (
    <Row label={label} hint={hint} error={error} publish={publish}>
      <div className="flex items-center gap-1.5">
        <input
          id={id}
          type="color"
          className="h-8 w-8 shrink-0 cursor-pointer rounded border border-input bg-transparent"
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
  publish,
  value,
  onChange,
}: {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  publish?: React.ReactNode | undefined;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Row label={label} hint={hint} error={error} publish={publish}>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={label}
        onClick={() => {
          onChange(!value);
        }}
        className={`relative h-6 w-11 rounded-full transition-colors ${
          value ? 'bg-primary' : 'bg-input'
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
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
  publish,
  value,
  maxLength,
  placeholder,
  onChange,
}: {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  publish?: React.ReactNode | undefined;
  value: string;
  maxLength?: number | undefined;
  placeholder?: string | undefined;
  onChange: (v: string) => void;
}) {
  return (
    <Row label={label} hint={hint} error={error} publish={publish}>
      <input
        type="text"
        className={cn(INPUT, error !== undefined && 'border-warning')}
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        name={`prop-${label.toLowerCase().replace(/\s+/gu, '-')}`}
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value);
        }}
        aria-label={label}
      />
    </Row>
  );
}
