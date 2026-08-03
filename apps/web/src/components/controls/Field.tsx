'use client';

import { ARTBOARD_MAX, ARTBOARD_MIN, RECT_MIN_SIZE, type Artboard } from '@vislow/component-registry';
import { useEffect, useId, useState } from 'react';
import { ARTBOARD_PRESETS } from '@/lib/artboard';

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

/**
 * Geometria de um no: x, y, largura e altura, em % do pai.
 *
 * NAO usa o `Row` dos demais controles de proposito. Os outros campos sao
 * perguntas independentes; estes quatro sao UM valor com quatro eixos, e quem
 * ajusta olha os quatro ao mesmo tempo — em quatro linhas separadas o painel
 * ficaria com 320px de altura so de geometria e a relacao entre eles sumiria.
 *
 * A caixa de coordenada — rotulo dentro da borda, unidade muda, numeral tabular
 * — e o formato de instrumento de desenho: compacta, e o digito nao dança de
 * posicao quando o numero muda durante um arrasto.
 */
export function RectField({
  value,
  error,
  onChange,
}: {
  value: { x: number; y: number; w: number; h: number };
  error?: string | undefined;
  onChange: (axis: 'x' | 'y' | 'w' | 'h', v: number) => void;
}) {
  const axes = [
    { key: 'x', mark: 'X', label: 'Distancia da esquerda' },
    { key: 'y', mark: 'Y', label: 'Distancia do topo' },
    { key: 'w', mark: 'L', label: 'Largura' },
    { key: 'h', mark: 'A', label: 'Altura' },
  ] as const;

  return (
    <section className="py-2">
      <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        Posicao e tamanho
      </h3>

      <div className="grid grid-cols-2 gap-1.5">
        {axes.map((axis) => (
          <label
            key={axis.key}
            className="flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1 focus-within:border-sky-500 focus-within:ring-2 focus-within:ring-sky-200 dark:border-slate-600 dark:bg-slate-800 dark:focus-within:ring-sky-900"
          >
            <span
              aria-hidden="true"
              className="w-2.5 shrink-0 text-[10px] font-semibold text-slate-400"
            >
              {axis.mark}
            </span>
            {/* As setas do teclado ajustam de 0,5 em 0,5 — e o caminho preciso e
                tambem o acessivel. O spinner nativo fica escondido: em duas
                colunas de 140px ele come a largura do proprio numero. */}
            <input
              type="number"
              inputMode="decimal"
              name={`rect-${axis.key}`}
              autoComplete="off"
              step={0.5}
              // O piso vem do schema, nao de um 2 escrito aqui: com a constante
              // duplicada, mudar o minimo num lado deixaria o controle oferecendo
              // um valor que a validacao reprova.
              min={axis.key === 'x' || axis.key === 'y' ? 0 : RECT_MIN_SIZE}
              max={100}
              value={value[axis.key]}
              aria-label={`${axis.label}, em porcentagem`}
              onChange={(e) => {
                const parsed = Number(e.target.value);
                if (!Number.isNaN(parsed)) onChange(axis.key, parsed);
              }}
              className="min-w-0 flex-1 bg-transparent text-right text-sm tabular-nums text-slate-900 outline-none [appearance:textfield] dark:text-slate-100 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            <span aria-hidden="true" className="shrink-0 text-[10px] text-slate-400">
              %
            </span>
          </label>
        ))}
      </div>

      {error !== undefined && (
        <div
          role="alert"
          className="mt-1 text-[10px] font-medium text-amber-600 dark:text-amber-400"
        >
          {error}
        </div>
      )}
    </section>
  );
}

/**
 * Tamanho da prancheta: a moldura em que a composicao inteira e desenhada.
 *
 * Irma do `RectField`, e nao mais um `Row`, porque e o mesmo tipo de coisa — um
 * valor com dois eixos que se ajusta olhando os dois juntos, no formato de
 * instrumento de desenho. A diferenca com o `RectField` esta na unidade (pixel
 * declarado, nao % do pai) e no fato de haver atalhos: proporcao e como se pensa
 * enquadramento, e digitar 1080 duas vezes para chegar num quadrado e trabalho
 * que a maquina faz.
 *
 * So aparece na RAIZ. Um container aninhado tem `rect`; prancheta e o tamanho do
 * visual inteiro, e oferece-la em cada container mostraria um unico valor em
 * varios lugares — a copia paralela que este painel existe para nao ter.
 *
 * Ela NAO vai para o pacote: o `.pbiviz` preenche a moldura que o autor do
 * relatorio desenhar. E o alvo contra o qual a composicao e julgada aqui dentro.
 */
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
      <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        Prancheta
      </h3>

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
              // O tamanho vai no nome acessivel porque o rotulo diz a forma: sem
              // ele, "4:3" nao informa se aplica 1440x1080 ou 800x600.
              aria-label={`${preset.label} — ${String(preset.size.width)} por ${String(preset.size.height)} pixels`}
              className={`flex-1 rounded-md px-1.5 py-1 text-[11px] font-medium tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 ${
                active
                  ? 'bg-slate-800 text-white hover:bg-slate-700 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-white'
                  : 'bg-white text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-600 dark:hover:bg-slate-700'
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
        className="mt-1 min-h-3.5 text-[10px] font-medium text-amber-600 dark:text-amber-400"
      >
        {message}
      </p>
    </section>
  );
}

/**
 * Um eixo da prancheta.
 *
 * Guarda o texto DIGITADO, e nao o numero — ao contrario do `RectField`, que
 * escreve a cada tecla. La os valores tem dois digitos e o piso e 2; aqui o piso
 * e 100, entao apagar "1280" para redigitar transformaria o "1" em 100 e o campo
 * ficaria impossivel de terminar.
 */
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
  /** Publica o que ha de errado com o rascunho, para a linha viva da secao. */
  onReport: (message: string) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(String(value));

  // Atalho, importacao e projeto novo mudam o tamanho por fora; sem isto o campo
  // continuaria exibindo o que foi digitado da ultima vez.
  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const parsed = Number(draft.trim());
  const invalid =
    draft.trim() === '' || !Number.isFinite(parsed) || parsed < min || parsed > max;
  const range = `${label} entre ${String(min)} e ${String(max)} px.`;

  /**
   * PRENDE na faixa, nao rejeita. Quem digitou 5000 quis "o maior que der" — a
   * mesma divisao de trabalho do `clampRect`: o gesto do usuario prende, a spec
   * que chega de fora e que reprova. O store prende de novo, com a mesma faixa.
   */
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
      className={`flex items-center gap-1.5 rounded-md border bg-white px-2 py-1 focus-within:ring-2 dark:bg-slate-800 ${
        invalid
          ? 'border-amber-400 focus-within:border-amber-500 focus-within:ring-amber-200 dark:focus-within:ring-amber-900'
          : 'border-slate-300 focus-within:border-sky-500 focus-within:ring-sky-200 dark:border-slate-600 dark:focus-within:ring-sky-900'
      }`}
    >
      <span aria-hidden="true" className="w-2.5 shrink-0 text-[10px] font-semibold text-slate-400">
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
        // Roda do mouse sobre campo numerico com foco troca o valor sem que
        // ninguem tenha pedido — e o painel rola, entao aqui isso aconteceria de
        // verdade, mudando a prancheta no meio de uma rolagem e sem sintoma.
        onWheel={(event) => {
          event.currentTarget.blur();
        }}
        className="min-w-0 flex-1 bg-transparent text-right text-sm tabular-nums text-slate-900 outline-none [appearance:textfield] dark:text-slate-100 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <span aria-hidden="true" className="shrink-0 text-[10px] text-slate-400">
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
