'use client';

import { ARTBOARD_MAX, ARTBOARD_MIN, type Artboard } from '@vislow/component-registry';
import { useEffect, useId, useState } from 'react';
import { ARTBOARD_PRESETS, scalePercent } from '@/lib/artboard';

/**
 * O trilho da prancheta: em que tamanho o usuario esta desenhando.
 *
 * Substitui os botoes de proporcao 16:9 / 4:3 / 1:1, que diziam a FORMA e
 * calavam a escala. A forma sozinha nao bastava: a geometria dos nos e
 * proporcional, mas a tipografia nao, e um texto de 12px ocupa metade de uma
 * caixa numa prancheta de 640 e um oitavo dela numa de 1920. Duas pranchetas
 * 16:9 desenhavam identico e produziam composicoes diferentes.
 *
 * O trilho tem tres zonas na ordem em que se pensa: atalho (a forma), tamanho (a
 * intencao) e escala (a realidade). A escala fica no mesmo trilho e nao sobre o
 * desenho de proposito — um selo no canto da prancheta cobriria justamente o que
 * o usuario esta julgando, e o preview e o produto.
 *
 * Este tamanho NAO vai para o pacote. O `.pbiviz` continua preenchendo a moldura
 * que o autor do relatorio desenhar; a prancheta e o alvo contra o qual a
 * composicao e julgada aqui dentro.
 */

export function ArtboardBar({
  artboard,
  scale,
  onChange,
}: {
  artboard: Artboard;
  /** Escala aplicada para caber no painel, de 0 a 1. */
  scale: number;
  onChange: (size: Artboard) => void;
}) {
  const groupId = useId();
  const [message, setMessage] = useState('');
  const percent = scalePercent(scale);

  const apply = (size: Artboard): void => {
    setMessage('');
    onChange(size);
  };

  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <div className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-2">
        <span id={groupId} className="text-xs text-slate-500 dark:text-slate-400">
          Prancheta
        </span>

        <div role="group" aria-labelledby={groupId} className="flex items-center gap-1">
          {ARTBOARD_PRESETS.map((preset) => {
            const active =
              artboard.width === preset.size.width && artboard.height === preset.size.height;
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  apply(preset.size);
                }}
                aria-pressed={active}
                // O tamanho vai no nome acessivel porque o rotulo diz a forma:
                // sem ele, "4:3" nao informa se aplica 1440x1080 ou 800x600.
                aria-label={`${preset.label} — ${String(preset.size.width)} por ${String(preset.size.height)} pixels`}
                // O atalho ATIVO tambem responde ao ponteiro. Sem isso ele e o
                // unico botao do trilho que parece morto justamente quando esta
                // sob o cursor, e "ja esta aplicado" fica indistinguivel de
                // "nao clica".
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 ${
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

        <Divider />

        <div className="flex items-center gap-1.5">
          <DimensionField
            label="Largura"
            value={artboard.width}
            min={ARTBOARD_MIN.width}
            max={ARTBOARD_MAX.width}
            onReport={setMessage}
            onCommit={(width) => {
              apply({ width, height: artboard.height });
            }}
          />
          <span aria-hidden="true" className="text-xs text-slate-400">
            ×
          </span>
          <DimensionField
            label="Altura"
            value={artboard.height}
            min={ARTBOARD_MIN.height}
            max={ARTBOARD_MAX.height}
            onReport={setMessage}
            onCommit={(height) => {
              apply({ width: artboard.width, height });
            }}
          />
          <span className="text-xs text-slate-400">px</span>
        </div>

        <Divider />

        {/* A escala e leitura, nao controle: nao ha zoom manual — a prancheta
            sempre ocupa o maximo do painel sem passar de 1:1. Em 100% o numero
            continua aparecendo, porque "voce esta vendo pixel real" e
            informacao, nao ausencia de aviso. */}
        <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
          escala {String(percent)}%
        </span>
      </div>

      {/* Linha de altura reservada: a mensagem entra e sai sem empurrar o trilho
          — um controle que se move enquanto se digita nele e o proprio defeito.
          `polite` porque a correcao acompanha a digitacao, nao interrompe. */}
      <p
        aria-live="polite"
        className="min-h-4 text-center text-[11px] text-amber-700 dark:text-amber-400"
      >
        {message}
      </p>
    </div>
  );
}

function Divider() {
  return <span aria-hidden="true" className="h-4 w-px bg-slate-300 dark:bg-slate-700" />;
}

/**
 * Um eixo da prancheta.
 *
 * Guarda o texto DIGITADO, nao o numero: sem isso, apagar para redigitar
 * reescreveria a prancheta a cada tecla — "1" viraria 100 pelo piso e o campo
 * ficaria impossivel de editar.
 *
 * `type="number"` nativo, e nao teclado proprio, para nao criar um segundo
 * significado de Shift: no canvas ele e o passo FINO (ver `canvasGeometry.ts`), e
 * aqui o passo base ja e o menor que existe — um pixel.
 */
function DimensionField({
  label,
  value,
  min,
  max,
  onCommit,
  onReport,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onCommit: (value: number) => void;
  /** Publica o que ha de errado com o rascunho, para a linha viva do trilho. */
  onReport: (message: string) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(String(value));

  // Preset, importacao e projeto novo mudam o tamanho por fora; sem isto o campo
  // continuaria exibindo o que foi digitado da ultima vez.
  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const parsed = Number(draft.trim());
  const empty = draft.trim() === '';
  const outOfRange = !empty && Number.isFinite(parsed) && (parsed < min || parsed > max);
  const invalid = empty || !Number.isFinite(parsed) || outOfRange;

  const range = `${label} entre ${String(min)} e ${String(max)} px.`;

  const type = (next: string): void => {
    setDraft(next);
    const n = Number(next.trim());
    const bad = next.trim() === '' || !Number.isFinite(n) || n < min || n > max;
    onReport(bad ? range : '');
  };

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
    <>
      <label htmlFor={id} className="text-xs text-slate-500 dark:text-slate-400">
        {label}
      </label>
      <input
        id={id}
        name={`artboard-${label.toLowerCase()}`}
        type="number"
        inputMode="numeric"
        // Sem isto o gerenciador de senhas oferece preenchimento num campo que
        // guarda a largura de uma prancheta.
        autoComplete="off"
        min={min}
        max={max}
        step={1}
        value={draft}
        aria-invalid={invalid}
        aria-describedby={`${id}-range`}
        onChange={(event) => {
          type(event.target.value);
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
        // ninguem tenha pedido — e a prancheta mudaria de tamanho no meio de uma
        // rolagem, sem sintoma nenhum.
        onWheel={(event) => {
          event.currentTarget.blur();
        }}
        className={`w-16 rounded-md border px-2 py-1 text-center text-sm tabular-nums outline-none focus:ring-2 dark:bg-slate-800 dark:text-slate-100 ${
          invalid
            ? 'border-amber-500 focus:ring-amber-200 dark:border-amber-500'
            : 'border-slate-300 focus:border-sky-500 focus:ring-sky-200 dark:border-slate-600'
        }`}
      />
      <span id={`${id}-range`} className="sr-only">
        {range}
      </span>
    </>
  );
}
