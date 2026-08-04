import type { ValidationIssue } from '@vislow/config-schema';

/**
 * Contrato da API de build — os tipos que atravessam o fio.
 *
 * Existe como pacote proprio porque tem DOIS donos: o servidor (`apps/api`), que
 * os produz, e o editor (`apps/web`), que os consome. Duplicar a uniao de
 * codigos de erro nos dois lados faria o editor mostrar "erro desconhecido" no
 * dia em que o servidor ganhasse um codigo novo — o compilador nao teria como
 * avisar. Aqui, um codigo novo quebra o `switch` do editor em tempo de
 * compilacao, que e onde queremos que quebre.
 *
 * So tipo e constante. Nada que dependa de Node ou de browser entra.
 */

/**
 * Estado de uma build.
 *
 * Discriminante de STRING, como todo o resto do projeto: o cliente faz `switch`
 * sobre `status` e o compilador cobra os casos.
 */
export type BuildStatus = 'queued' | 'running' | 'done' | 'failed';

/**
 * Etapa dentro de um build `running`.
 *
 * O `status` sozinho diz "esta rodando" e cala por doze segundos — indistinguivel
 * de travado. A etapa e o que o servidor SABE e o cliente nao tinha como
 * adivinhar. Cinco nomes, nao os sete passos do pipeline: `copyTemplate` e
 * `generateProject` sao a mesma coisa para quem espera, e `linkDependencies` e
 * `vendorInternalPackages` tambem.
 *
 * Ordem, e nao peso: quanto cada etapa custa e medicao que envelhece, e isso e
 * assunto de quem desenha a barra.
 */
export type BuildStep =
  /** Schema, regras semanticas e template preparado. */
  | 'validating'
  /** Scaffold do template + os tres arquivos do codegen. */
  | 'generating'
  /** `node_modules` por hardlink + os pacotes `@vislow/*`. */
  | 'linking'
  /** `pbiviz package`. E a etapa longa — ~7,5 s dos ~12 s medidos. */
  | 'compiling'
  /** O portao do ADR-11. Nada sai do worker sem passar por ele. */
  | 'inspecting';

/** A ordem em que o pipeline percorre as etapas. O cliente conta a partir dela. */
export const BUILD_STEP_ORDER: readonly BuildStep[] = [
  'validating',
  'generating',
  'linking',
  'compiling',
  'inspecting',
];

/**
 * Codigos de falha. Existem para que o suporte seja possivel: sem eles o
 * usuario so consegue relatar "nao funcionou" (RNF-11).
 */
export type BuildErrorCode =
  /** A spec nao passou no schema ou nas regras semanticas. Culpa do cliente. */
  | 'SPEC_INVALID'
  /** `npm ci` falhou — cache frio, rede ou lockfile fora de sincronia. */
  | 'INSTALL_FAILED'
  /** `pbiviz package` falhou. Quase sempre erro de tipo no fonte gerado. */
  | 'COMPILE_FAILED'
  /** Compilou, mas o artefato nao passou na inspecao. NUNCA e entregue. */
  | 'ARTIFACT_REJECTED'
  /** Estourou o tempo duro. */
  | 'TIMEOUT'
  /** O template nao foi preparado no servidor. Culpa de implantacao. */
  | 'TEMPLATE_NOT_STAGED';

export interface BuildError {
  code: BuildErrorCode;
  message: string;
  /** Preenchido apenas em SPEC_INVALID. */
  issues?: ValidationIssue[];
  /** Ultimas linhas do log da ferramenta que falhou. */
  detail?: string;
}

/** Medidas do artefato. Uteis no editor e no diagnostico. */
export interface BuildMetrics {
  packageBytes: number;
  jsBytes: number;
  durationMs: number;
}

export interface BuildRecord {
  id: string;
  status: BuildStatus;
  /** Nome do arquivo entregue, ex.: `Vendas por Regiao.pbiviz`. */
  fileName: string;
  createdAt: string;
  finishedAt?: string;
  error?: BuildError;
  metrics?: BuildMetrics;
  /** Onde o pipeline esta. So enquanto `status` for `running`. */
  step?: BuildStep;
  /**
   * Quantos builds ha na frente deste. So enquanto `status` for `queued`, e
   * calculado na LEITURA: gravar no registro exigiria reescrever todos os
   * enfileirados a cada vaga que abre, para um numero que ninguem consultou.
   */
  queuePosition?: number;
}

/** Corpo de `POST /builds`. */
export interface CreateBuildRequest {
  spec: unknown;
}

/** Resposta de `POST /builds` — 202, o artefato ainda nao existe. */
export interface CreateBuildResponse {
  buildId: string;
  status: BuildStatus;
}

/** Um `status` terminal nao muda mais: e onde o cliente para de perguntar. */
export function isTerminal(status: BuildStatus): boolean {
  return status === 'done' || status === 'failed';
}
