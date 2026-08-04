'use client';

import { useEffect, useRef, useState } from 'react';
import { BUILD_STEP_ORDER } from '@vislow/build-contract';
import type { BuildPhase } from '@/lib/buildApi';
import { baseOf, formatElapsed, progressOf, weightOf } from '@/lib/buildProgress';

import { ImportSteps } from './ImportInstructions';

/**
 * O que a tela inteira faz enquanto o servidor compila.
 *
 * Antes, o export so desabilitava o proprio botao: durante os ~12 s de
 * compilacao dava para continuar arrastando no canvas e trocando propriedades —
 * mudancas que NAO entram no pacote, porque a spec ja subiu. O usuario ficava
 * com um arquivo que nao corresponde ao que ve na tela, sem nada avisando.
 *
 * O bloqueio vem do `showModal()` do `<dialog>` nativo, nao de espalhar
 * `disabled` pelos paineis: o resto da pagina sai do top layer e para de receber
 * clique, foco e Tab de uma vez so. O que precisa ser ADICIONADO e o contrario do
 * padrao — impedir que Esc e o backdrop fechem enquanto a build roda.
 *
 * A barra tem cinco segmentos de larguras diferentes, proporcionais ao custo
 * medido de cada etapa. E uma escolha de mostrar o que costuma ser escondido: a
 * compilacao e ~70% da espera, e um segmento largo diz isso antes de a pessoa
 * comecar a achar que travou.
 */

/** Quadros por segundo do rastejo. 120 ms e suave sem re-renderizar a toa. */
const TICK_MS = 120;
/** Com movimento reduzido a barra so anda a cada segundo — o numero e informacao. */
const TICK_REDUCED_MS = 1000;
/** Beat entre a barra encher e as instrucoes aparecerem. Sem ele, o fim nao e visto. */
const HANDOFF_MS = 600;

export interface BuildProgressDialogProps {
  phase: BuildPhase;
  /** Nome do arquivo em compilacao. Antes do fim e o que o projeto se chama. */
  fileName: string;
  onRetry: () => void;
  onClose: () => void;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  // Em efeito, e nao no render: o `matchMedia` nao existe na pre-renderizacao do
  // Next e a divergencia de hidratacao apareceria como um aviso mudo.
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);
    const listen = (event: MediaQueryListEvent): void => {
      setReduced(event.matches);
    };
    query.addEventListener('change', listen);
    return () => {
      query.removeEventListener('change', listen);
    };
  }, []);

  return reduced;
}

const clamp = (value: number): number => Math.min(1, Math.max(0, value));

export function BuildProgressDialog({ phase, fileName, onRetry, onClose }: BuildProgressDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const reducedMotion = usePrefersReducedMotion();

  const open = phase.kind !== 'idle';
  const busy = phase.kind === 'uploading' || phase.kind === 'queued' || phase.kind === 'running';

  const [now, setNow] = useState(() => Date.now());
  const [stepsVisible, setStepsVisible] = useState(false);

  // A chave da etapa: e a troca dela que reinicia o relogio do rastejo.
  const stepKey = phase.kind === 'running' ? phase.step : phase.kind;
  const mark = useRef({ key: stepKey, since: now });
  const startedAt = useRef(now);

  const previousKey = mark.current.key;
  if (previousKey !== stepKey) mark.current = { key: stepKey, since: Date.now() };
  // `uploading` e o comeco de um export, inclusive do segundo: e onde o relogio
  // total zera, e nao na montagem do componente, que acontece uma vez so.
  if (phase.kind === 'uploading' && previousKey !== 'uploading') startedAt.current = Date.now();

  // A razao do quadro anterior mora num ref porque ela nao decide o que
  // renderizar — ela apenas IMPEDE a barra de voltar. `Math.max` e idempotente,
  // entao o render duplo do modo estrito chega no mesmo numero.
  const ratio = useRef(0);
  if (phase.kind === 'uploading') ratio.current = 0;

  const view = progressOf({
    phase,
    elapsedInStepMs: Math.max(0, now - mark.current.since),
    previousRatio: ratio.current,
  });
  ratio.current = view.ratio;

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);

  useEffect(() => {
    if (!busy) return;
    const timer = window.setInterval(
      () => {
        setNow(Date.now());
      },
      reducedMotion ? TICK_REDUCED_MS : TICK_MS,
    );
    return () => {
      window.clearInterval(timer);
    };
  }, [busy, reducedMotion]);

  /**
   * Enquanto a build roda nao ha nada focavel, entao o foco fica no proprio
   * dialogo. Quando ela termina, os botoes aparecem — e sem isto o teclado
   * precisaria de um Tab as cegas para descobrir que agora ha o que fazer.
   */
  useEffect(() => {
    if (busy || !open) return;
    dialog.current?.querySelector('button')?.focus();
  }, [busy, open]);

  useEffect(() => {
    if (phase.kind !== 'done') {
      setStepsVisible(false);
      return;
    }
    if (reducedMotion) {
      setStepsVisible(true);
      return;
    }
    const timer = window.setTimeout(() => {
      setStepsVisible(true);
    }, HANDOFF_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [phase.kind, reducedMotion]);

  const failed = phase.kind === 'error';
  const elapsed = formatElapsed(Math.max(0, now - startedAt.current));

  return (
    <dialog
      ref={dialog}
      aria-labelledby="build-progress-title"
      onCancel={(event) => {
        // Esc so vale quando ha o que decidir. No meio da build nao ha: o
        // servidor continua compilando de qualquer jeito, e liberar a tela
        // convidaria a editar uma composicao que ja subiu.
        if (busy) event.preventDefault();
        else onClose();
      }}
      onClick={(event) => {
        if (!busy && event.target === dialog.current) onClose();
      }}
      // O teto de altura e a rolagem contida sao pelo estado de sucesso: ele
      // cresce com as instrucoes de importacao, e numa janela baixa o rodape
      // sairia da tela — com o `<dialog>` modal, sem barra de rolagem da pagina
      // por tras para salvar.
      className="m-auto max-h-[calc(100vh-2rem)] w-[30rem] max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain rounded-lg bg-white p-0 text-slate-800 shadow-xl backdrop:bg-slate-900/50 dark:bg-slate-900 dark:text-slate-100"
    >
      <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-700">
        <h2 id="build-progress-title" className="text-sm font-semibold">
          {failed ? 'A build falhou' : phase.kind === 'done' ? 'Pacote gerado' : 'Compilando o visual'}
        </h2>
        <p className="mt-1 break-all font-mono text-[11px] text-slate-500">{fileName}</p>
      </div>

      <div className="px-5 py-4">
        <div className="flex items-baseline justify-between gap-3">
          {/* `min-w-0` + `break-words`: a mensagem de erro do servidor pode
              trazer um caminho de arquivo sem espaco, que sem isto empurraria o
              contador para fora do dialogo. */}
          <p
            aria-live="polite"
            className={`min-w-0 wrap-break-word text-sm font-medium ${
              failed ? 'text-red-600 dark:text-red-400' : ''
            }`}
          >
            {view.label}
          </p>
          <span className="shrink-0 text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
            {phase.kind === 'running' && (
              <span className="mr-2">
                etapa {String(view.stepIndex + 1)} de {String(BUILD_STEP_ORDER.length)}
              </span>
            )}
            {phase.kind === 'done' ? null : elapsed}
          </span>
        </div>

        {/* Um progressbar so, partido em segmentos: para quem le com leitor de
            tela o que existe e a razao unica; os segmentos sao desenho. */}
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(view.ratio * 100)}
          aria-label="Progresso da compilação"
          className="mt-3 flex gap-0.75"
        >
          {BUILD_STEP_ORDER.map((step) => (
            <div
              key={step}
              style={{ width: `${String(weightOf(step) * 100)}%` }}
              className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
            >
              {/* `scaleX`, e nao `width`: a animacao fica na composicao, sem
                  recalcular layout doze vezes por segundo. O arredondamento da
                  ponta nao se deforma porque quem arredonda e o trilho, que
                  recorta — a barra interna e um retangulo cru. */}
              <div
                style={{
                  transform: `scaleX(${String(clamp((view.ratio - baseOf(step)) / weightOf(step)))})`,
                }}
                className={`h-full w-full origin-left ${failed ? 'bg-red-500' : 'bg-sky-600'} ${
                  reducedMotion ? '' : 'transition-transform duration-200 ease-out'
                }`}
              />
            </div>
          ))}
        </div>

        {view.detail !== null && (
          <p className="mt-3 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
            {view.detail}
          </p>
        )}

        {busy && (
          <p className="mt-3 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
            O editor fica travado até o pacote ficar pronto. A composição já subiu — o que for
            mudado agora não entra neste arquivo.
          </p>
        )}

        {phase.kind === 'done' && phase.metrics && (
          // As medidas ficam a vista porque o orcamento e duro (1 MB de JS, 2 MB
          // de pacote): quem esta compondo precisa ver o custo subir antes de a
          // build ser reprovada.
          <p className="mt-3 text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
            {(phase.metrics.packageBytes / 1024).toFixed(0)} KB · {formatElapsed(phase.metrics.durationMs)}{' '}
            de compilação
          </p>
        )}
      </div>

      {phase.kind === 'done' && stepsVisible && (
        <div className="border-t border-slate-200 dark:border-slate-700">
          <ImportSteps />
        </div>
      )}

      {!busy && (
        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-700">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {failed ? 'Fechar' : 'Entendi'}
          </button>
          {failed && (
            <button
              type="button"
              onClick={onRetry}
              className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
            >
              Tentar de novo
            </button>
          )}
        </div>
      )}
    </dialog>
  );
}
