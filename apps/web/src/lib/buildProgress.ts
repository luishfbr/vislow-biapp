import { BUILD_STEP_ORDER, type BuildStep } from '@vislow/build-contract';
import type { BuildPhase } from './buildApi';

/**
 * A matematica da barra de progresso do export.
 *
 * Mora fora do React pelo mesmo motivo que `canvasGeometry.ts`: e aritmetica com
 * invariantes que valem a pena provar, e prova-las dentro de um componente
 * custaria montar uma arvore para conferir um numero.
 *
 * O problema que ela resolve: o servidor reporta a ETAPA, nao o percentual. Cinco
 * etapas de custo muito diferente — `pbiviz package` sozinho e ~70% da espera —,
 * entao uma barra de fatias iguais andaria aos trancos e depois congelaria por
 * sete segundos. Aqui cada etapa ganha uma fatia proporcional ao custo medido, e
 * DENTRO da fatia a razao rasteja com o relogio.
 *
 * O rastejo e o unico numero inventado deste arquivo, e ele e inventado com
 * limite: uma curva que satura, nunca alcanca o fim da propria fatia, e por isso
 * a chegada da etapa seguinte e sempre um avanco. A barra nao anda para tras
 * nunca — nem quando o poll traz uma etapa fora de ordem.
 */

/**
 * Quanto cada etapa costuma levar, em ms. Medicao, nao meta.
 *
 * Os pesos da barra saem DAQUI por divisao, e nao de uma segunda tabela: duas
 * listas de numeros com a mesma origem sao duas listas que divergem no dia em
 * que a medicao for refeita.
 */
export const STEP_EXPECTED_MS: Record<BuildStep, number> = {
  validating: 150,
  generating: 400,
  linking: 1_800,
  compiling: 7_500,
  inspecting: 900,
};

/**
 * O que o usuario le. Voz do resto do editor: gerundio, sem jargao de build.
 *
 * As reticencias sao o caractere `…`, nao tres pontos: e uma coisa em andamento,
 * e o leitor de tela le um caractere em vez de soletrar tres.
 */
export const STEP_LABEL: Record<BuildStep, string> = {
  validating: 'Conferindo a composição…',
  generating: 'Gerando o código do visual…',
  linking: 'Montando as dependências…',
  compiling: 'Compilando o pacote…',
  inspecting: 'Inspecionando o artefato…',
};

const TOTAL_EXPECTED_MS = BUILD_STEP_ORDER.reduce((sum, step) => sum + STEP_EXPECTED_MS[step], 0);

/** Fatia da barra que cabe a cada etapa. Soma 1 por construcao. */
export function weightOf(step: BuildStep): number {
  return STEP_EXPECTED_MS[step] / TOTAL_EXPECTED_MS;
}

/** Onde a fatia da etapa comeca — a soma das que vieram antes. */
export function baseOf(step: BuildStep): number {
  let base = 0;
  for (const previous of BUILD_STEP_ORDER) {
    if (previous === step) break;
    base += weightOf(previous);
  }
  return base;
}

/**
 * Teto do rastejo dentro da fatia.
 *
 * Menor que 1 de proposito: a fatia precisa terminar com uma sobra visivel, para
 * que a troca de etapa apareca como movimento. Com 1 exato, uma etapa que
 * demorasse o dobro do previsto encostaria na fronteira e a etapa seguinte
 * comecaria sem nada acontecer na tela.
 */
const CREEP_CEILING = 0.97;

/**
 * Quanto da fatia o relogio ja consumiu, em [0, CREEP_CEILING).
 *
 * Curva que satura: em `expectedMs` esta em ~61% da fatia, no dobro em ~84%, e
 * nunca chega ao fim. Uma build tres vezes mais lenta que o previsto continua
 * mostrando movimento em vez de uma barra travada.
 */
function creepWithin(elapsedMs: number, expectedMs: number): number {
  if (elapsedMs <= 0) return 0;
  if (expectedMs <= 0) return CREEP_CEILING;
  return CREEP_CEILING * (1 - Math.exp(-elapsedMs / expectedMs));
}

function queueDetail(position: number): string {
  if (position <= 0) return 'A sua é a próxima assim que uma vaga abrir.';
  if (position === 1) return 'Há 1 build na sua frente.';
  return `Há ${String(position)} builds na sua frente.`;
}

export interface ProgressView {
  /** Razao de 0 a 1 para a largura da barra e para o `aria-valuenow`. */
  ratio: number;
  /** A frase grande: o que esta acontecendo agora. */
  label: string;
  /** A frase pequena, quando ha o que acrescentar. */
  detail: string | null;
  /** Indice em `BUILD_STEP_ORDER`, ou -1 antes de o pipeline comecar. */
  stepIndex: number;
}

export interface ProgressInput {
  phase: BuildPhase;
  /** Ha quanto tempo esta ETAPA comecou. Zero em qualquer fase sem etapa. */
  elapsedInStepMs: number;
  /** A razao do quadro anterior. E o que garante que a barra nao volte. */
  previousRatio: number;
}

/**
 * Traduz uma fase da build no que a barra deve mostrar.
 *
 * Pura e monotonica: dado o mesmo `previousRatio`, a razao devolvida nunca e
 * menor que ele. E o que torna irrelevante a ordem em que as respostas do poll
 * chegam — e o poll e de 1 s, entao elas chegam fora de ordem de vez em quando.
 */
export function progressOf({ phase, elapsedInStepMs, previousRatio }: ProgressInput): ProgressView {
  const view = describe(phase, elapsedInStepMs);
  return { ...view, ratio: Math.max(previousRatio, view.ratio) };
}

function describe(phase: BuildPhase, elapsedInStepMs: number): ProgressView {
  switch (phase.kind) {
    case 'idle':
      return { ratio: 0, label: '', detail: null, stepIndex: -1 };

    case 'uploading':
      return {
        ratio: 0,
        label: 'Enviando a composição…',
        detail: 'O pacote é compilado no servidor, não aqui.',
        stepIndex: -1,
      };

    case 'queued':
      // A fila e ANTES da barra, nao um pedaco dela: o tempo de espera por uma
      // vaga nao tem relacao com o quanto falta para o pacote ficar pronto.
      return {
        ratio: 0,
        label: 'Na fila…',
        detail: queueDetail(phase.position),
        stepIndex: -1,
      };

    case 'running': {
      const slice = weightOf(phase.step);
      const ratio = baseOf(phase.step) + slice * creepWithin(elapsedInStepMs, STEP_EXPECTED_MS[phase.step]);
      return {
        ratio,
        label: STEP_LABEL[phase.step],
        detail: null,
        stepIndex: BUILD_STEP_ORDER.indexOf(phase.step),
      };
    }

    case 'done':
      return {
        ratio: 1,
        label: 'Pacote pronto',
        detail: null,
        stepIndex: BUILD_STEP_ORDER.length,
      };

    case 'error':
      // Congela onde parou. Zerar apagaria a unica pista visual de ATE ONDE a
      // build chegou antes de falhar.
      return { ratio: 0, label: phase.message, detail: phase.hint, stepIndex: -1 };
  }
}

/**
 * Segundos decorridos, na forma curta que ja aparece nas metricas do export.
 *
 * O espaco e insecavel (`\u00a0`): o numero e a unidade sao uma coisa so, e a
 * quebra entre eles no fim de uma linha estreita deixaria um "12" orfao.
 */
export function formatElapsed(ms: number): string {
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}\u00a0s`;
}
