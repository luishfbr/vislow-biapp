import type { VisualConfig } from '@vislow/config-schema';
import { buildPbiviz, PbivizBuildError, toPbivizBlob } from '@vislow/config-schema/packaging';
import { triggerDownload } from './persistence';

/**
 * Export do `.pbiviz` no browser (RF-11).
 *
 * O editor nao tem backend (ADR-05): o pacote base e um estatico servido junto
 * com a aplicacao, e o empacotamento roda no cliente. O caminho e fixo porque o
 * nome em `packages/runtime/dist/` carrega o GUID e a versao do pacote base —
 * `scripts/stage-template.mjs` normaliza na copia.
 */
const TEMPLATE_URL = '/templates/base-runtime.pbiviz';

const MISSING_TEMPLATE_HINT =
  'Rode `pnpm --filter @vislow/runtime build:runtime` e depois `pnpm stage:template`.';

export type ExportResult =
  /** Discriminante de string, como no resto do projeto. */
  | { kind: 'ok'; filename: string }
  | { kind: 'error'; message: string; hint: string | null };

class TemplateFetchError extends Error {
  constructor(
    readonly status: number | null,
    options?: ErrorOptions,
  ) {
    const cause = status === null ? 'falha de rede' : `HTTP ${String(status)}`;
    super(`Falha ao carregar o pacote base (${cause}).`, options);
    this.name = 'TemplateFetchError';
  }
}

let cached: Promise<ArrayBuffer> | undefined;

/**
 * Busca o template uma vez por sessao. Falha NAO e cacheada: quem esta em
 * desenvolvimento pode rodar o build do runtime e tentar de novo sem recarregar
 * a pagina.
 */
function loadTemplate(): Promise<ArrayBuffer> {
  cached ??= (async () => {
    let response: Response;
    try {
      response = await fetch(TEMPLATE_URL);
    } catch (cause) {
      throw new TemplateFetchError(null, { cause });
    }
    if (!response.ok) throw new TemplateFetchError(response.status);
    return response.arrayBuffer();
  })().catch((error: unknown) => {
    cached = undefined;
    throw error;
  });
  return cached;
}

function describeFailure(error: unknown): { message: string; hint: string | null } {
  if (error instanceof TemplateFetchError) {
    return {
      message: 'O pacote base do Vislow nao esta disponivel.',
      hint: MISSING_TEMPLATE_HINT,
    };
  }

  if (error instanceof PbivizBuildError) {
    switch (error.code) {
      case 'CONFIG_INVALID':
        return {
          message: 'A configuracao atual nao e valida e o pacote nao foi gerado.',
          hint: error.message,
        };
      case 'TEMPLATE_UNREADABLE':
      case 'TEMPLATE_INCOMPLETE':
        return {
          message: 'O pacote base esta corrompido ou incompleto.',
          hint: MISSING_TEMPLATE_HINT,
        };
      case 'PLACEHOLDER_NOT_UNIQUE':
        return {
          message: 'O pacote base nao aceita injecao de configuracao.',
          hint: 'Reconstrua o Runtime Core: as guardas de build detectam esse caso.',
        };
    }
  }

  return {
    message: 'Nao foi possivel gerar o pacote.',
    hint: error instanceof Error ? error.message : null,
  };
}

/**
 * Gera e baixa o `.pbiviz`.
 *
 * Nao lanca: devolve o erro descrito para a interface mostrar. Um export que
 * falha em silencio deixaria o usuario sem saber se o download aconteceu.
 */
export async function exportPbiviz(config: VisualConfig): Promise<ExportResult> {
  try {
    const template = await loadTemplate();
    const pkg = await buildPbiviz(template, config);
    triggerDownload(toPbivizBlob(pkg), pkg.filename);
    return { kind: 'ok', filename: pkg.filename };
  } catch (error) {
    return { kind: 'error', ...describeFailure(error) };
  }
}
