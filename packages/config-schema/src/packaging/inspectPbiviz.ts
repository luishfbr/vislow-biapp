/**
 * Leitura de um `.pbiviz` ja empacotado.
 *
 * Existe para verificar pacotes de fora, sem confiar no caminho de escrita:
 * os testes T-03..T-08 abrem o pacote gerado e conferem identidade, config e
 * orcamentos. Tambem serve de ferramenta de diagnostico quando um pacote e
 * recusado no import do Power BI.
 */
import JSZip from 'jszip';
import { fromBase64Utf8 } from './base64.js';
import { CONFIG_PLACEHOLDER, PbivizBuildError } from './buildPbiviz.js';

/**
 * O payload injetado e base64 de `JSON.stringify(config)`, e a config sempre
 * comeca por `{"schemaVersion"` — logo o base64 sempre comeca por `eyJz`. Casar
 * por esse prefixo, com tamanho minimo, distingue o payload de qualquer outro
 * literal de string do bundle minificado sem depender de como o minificador
 * decidiu escrever o codigo em volta.
 */
const PAYLOAD_LITERAL = /"(eyJz[A-Za-z0-9+/]{100,}={0,2})"/g;

export interface PbivizIdentity {
  guid: string;
  name: string;
  displayName: string;
  version: string;
}

export interface PbivizInspection {
  /** Identidade em `package.json` — o que o Power BI le para decidir instalar. */
  packageIdentity: PbivizIdentity;
  /** Identidade dentro do recurso. Precisa bater com a de cima. */
  resourceIdentity: PbivizIdentity;
  /** Caminho do recurso dentro do zip, ex.: `resources/{guid}.pbiviz.json`. */
  resourcePath: string;
  /** Caminho declarado em `package.json.resources[].file`. */
  declaredResourcePath: string;
  /** Todos os caminhos de arquivo do zip. */
  files: string[];
  /** Bundle do visual. Exposto cru para as assertivas de ausencia (T-06). */
  js: string;
  /** Tamanho total do pacote em bytes (RNF-05). */
  packageBytes: number;
  /** Tamanho do `content.js` em bytes (RNF-04). */
  jsBytes: number;
  /** `true` quando o placeholder ainda esta la — ou seja, e o pacote base. */
  isBaseTemplate: boolean;
  /** Base64 da config embutida; `null` no pacote base. */
  configBase64: string | null;
  /** Config embutida ja decodificada e parseada; `null` no pacote base. */
  config: unknown;
}

function toIdentity(visual: {
  guid: string;
  name: string;
  displayName: string;
  version: string;
}): PbivizIdentity {
  return {
    guid: visual.guid,
    name: visual.name,
    displayName: visual.displayName,
    version: visual.version,
  };
}

async function readJson<T>(zip: JSZip, path: string): Promise<T> {
  const entry = zip.file(path);
  if (!entry) {
    throw new PbivizBuildError('TEMPLATE_INCOMPLETE', `O pacote nao contem "${path}".`);
  }
  return JSON.parse(await entry.async('string')) as T;
}

/** Um candidato so conta se realmente decodifica para um VisualConfig. */
function decodesToConfig(base64: string): boolean {
  try {
    const parsed: unknown = JSON.parse(fromBase64Utf8(base64));
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as { schemaVersion?: unknown }).schemaVersion === 'string'
    );
  } catch {
    // Sourcemap inline, dado de icone, qualquer outro base64 do bundle.
    return false;
  }
}

function extractPayload(js: string): string | null {
  const candidates = [...js.matchAll(PAYLOAD_LITERAL)]
    .map((match) => match[1])
    .filter((value): value is string => value !== undefined && decodesToConfig(value));

  if (candidates.length === 0) return null;
  if (candidates.length > 1) {
    throw new PbivizBuildError(
      'PLACEHOLDER_NOT_UNIQUE',
      `Encontrados ${String(candidates.length)} candidatos a config embutida no bundle (esperado 1).`,
    );
  }
  return candidates[0] ?? null;
}

/** Abre um `.pbiviz` e devolve tudo o que os testes e o diagnostico precisam. */
export async function inspectPbiviz(
  bytes: ArrayBuffer | Uint8Array,
): Promise<PbivizInspection> {
  const packageBytes = bytes.byteLength;
  const zip = await JSZip.loadAsync(bytes);

  interface VisualMeta {
    guid: string;
    name: string;
    displayName: string;
    version: string;
  }
  const pkg = await readJson<{
    resources: { file: string }[];
    visual: VisualMeta;
  }>(zip, 'package.json');

  const declared = pkg.resources.find((entry) => entry.file.endsWith('.pbiviz.json'));
  if (!declared) {
    throw new PbivizBuildError(
      'TEMPLATE_INCOMPLETE',
      'O pacote nao declara um recurso .pbiviz.json em package.json.resources.',
    );
  }

  const files = Object.keys(zip.files).filter((path) => !zip.files[path]?.dir);
  const actual = files.find((path) => path.endsWith('.pbiviz.json'));
  if (!actual) {
    throw new PbivizBuildError('TEMPLATE_INCOMPLETE', 'O zip nao contem nenhum .pbiviz.json.');
  }

  const res = await readJson<{ visual: VisualMeta; content: { js: string } }>(zip, actual);
  const js = res.content.js;
  const isBaseTemplate = js.includes(CONFIG_PLACEHOLDER);
  const configBase64 = isBaseTemplate ? null : extractPayload(js);

  return {
    packageIdentity: toIdentity(pkg.visual),
    resourceIdentity: toIdentity(res.visual),
    resourcePath: actual,
    declaredResourcePath: declared.file,
    files,
    js,
    packageBytes,
    jsBytes: new TextEncoder().encode(js).byteLength,
    isBaseTemplate,
    configBase64,
    config: configBase64 === null ? null : (JSON.parse(fromBase64Utf8(configBase64)) as unknown),
  };
}
