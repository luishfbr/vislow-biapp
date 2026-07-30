/**
 * Empacotamento do `.pbiviz` (secao 8.3 do doc de MVP).
 *
 * Isomorfico: o editor chama isto no browser, os testes T-03..T-08 em Node.
 * Nada aqui toca `fs`, `Buffer` ou `Blob` — a saida e `Uint8Array` e quem
 * precisa de um download embrulha (`toPbivizBlob`).
 *
 * ATENCAO: este modulo NAO e reexportado pelo barril `index.ts`. Ele traz o
 * JSZip consigo, e o Runtime Core importa `@vislow/config-schema` — reexportar
 * daqui arriscaria empurrar ~100 KB de JSZip para dentro do bundle do visual, em
 * silencio, contra o orcamento do RNF-04. Consumidores usam o subcaminho
 * `@vislow/config-schema/packaging`.
 */
import JSZip from 'jszip';
import type { PackageVersion, VisualConfig } from '../types.js';
import { validateConfig } from '../validate.js';
import { toBase64Utf8 } from './base64.js';

/**
 * Token substituido no export. Contrato compartilhado com
 * `packages/runtime/src/embeddedConfig.ts` e com `scripts/assert-package.mjs`;
 * mudar aqui sem mudar la produz um pacote que so falha dentro do Power BI.
 */
export const CONFIG_PLACEHOLDER = '__VISLOW_CONFIG_B64__';

export type PbivizBuildErrorCode =
  /** A config nao passa no schema (RN-03). */
  | 'CONFIG_INVALID'
  /** O template nao e um zip legivel — download truncado, arquivo errado. */
  | 'TEMPLATE_UNREADABLE'
  /** O zip abriu, mas nao tem a estrutura de um pacote do Power BI. */
  | 'TEMPLATE_INCOMPLETE'
  /** O placeholder nao aparece exatamente uma vez (R-01). */
  | 'PLACEHOLDER_NOT_UNIQUE';

export class PbivizBuildError extends Error {
  readonly code: PbivizBuildErrorCode;

  constructor(code: PbivizBuildErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'PbivizBuildError';
    this.code = code;
  }
}

export interface PbivizPackage {
  /**
   * Bytes do `.pbiviz`.
   *
   * `Uint8Array` e nao `Blob`: e o unico formato que o JSZip produz sem
   * deteccao de recursos e que serve aos dois lados da fronteira. O browser
   * embrulha com `toPbivizBlob`; os testes medem `byteLength` direto (T-08).
   *
   * O parametro de tipo e explicito porque `BlobPart` so aceita views sobre
   * `ArrayBuffer`, e a tipagem do JSZip devolve o `ArrayBufferLike` generico.
   */
  bytes: Uint8Array<ArrayBuffer>;
  /** Convencao da CLI oficial do pbiviz: `{guid}.{versao}.pbiviz`. */
  filename: string;
  guid: string;
  version: PackageVersion;
}

// --- Formato do pacote base -------------------------------------------------
// Tipagem minima e local. O pacote tem mais campos (`visualClassName`,
// `supportUrl`, ...) que precisam sobreviver intactos, dai as assinaturas de
// indice: tudo o que nao e reescrito e copiado por espalhamento.

interface ResourceEntry {
  resourceId: string;
  file: string;
  [key: string]: unknown;
}

interface VisualMeta {
  name: string;
  displayName: string;
  guid: string;
  version: string;
  [key: string]: unknown;
}

interface PackageManifest {
  version: string;
  resources: ResourceEntry[];
  visual: VisualMeta;
  [key: string]: unknown;
}

interface ResourceManifest {
  visual: VisualMeta;
  content: { js: string; [key: string]: unknown };
  [key: string]: unknown;
}

interface Identity {
  guid: string;
  name: string;
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Reescreve a identidade dentro do bundle em UMA passada (ADR-03).
 *
 * O GUID nao e metadado: ele e o nome de uma variavel JavaScript no bundle
 * (`var vislowRuntime7F3A...;(()=>{`), por isso precisa ser trocado no texto do
 * JS e nao apenas nos manifestos.
 *
 * Por que uma passada so, e nao duas sequenciais como no spike: `guid` comeca
 * pelo `name` do pacote base. Depois de trocar o GUID, todo GUID novo comeca
 * pelo slug do usuario — e se esse slug for exatamente igual ao `name` base
 * (`vislowRuntime`), a segunda passada casaria com o prefixo dos GUIDs que
 * acabaram de ser escritos e duplicaria o sufixo hex dentro deles. Corrupcao
 * silenciosa, pacote recusado no import. Uma alternacao unica com `/g` nunca
 * reexamina o texto inserido; a ordem das alternativas garante que o GUID
 * (mais longo) vence nas posicoes em que ambos casariam.
 */
function rewriteIdentity(js: string, from: Identity, to: Identity): string {
  const pattern = new RegExp(`${escapeRegExp(from.guid)}|${escapeRegExp(from.name)}`, 'g');
  return js.replace(pattern, (match) => (match === from.guid ? to.guid : to.name));
}

/** Le uma entrada JSON do zip preservando a data — ver nota de reprodutibilidade. */
async function readJsonEntry(
  zip: JSZip,
  path: string,
): Promise<{ value: unknown; date: Date }> {
  const entry = zip.file(path);
  if (!entry) {
    throw new PbivizBuildError(
      'TEMPLATE_INCOMPLETE',
      `O pacote base do Vislow nao contem "${path}".`,
    );
  }
  const raw = await entry.async('string');
  try {
    return { value: JSON.parse(raw) as unknown, date: entry.date };
  } catch (cause) {
    throw new PbivizBuildError('TEMPLATE_INCOMPLETE', `"${path}" nao e um JSON valido.`, { cause });
  }
}

/**
 * Gera um `.pbiviz` a partir do pacote base do Runtime Core e de um
 * `VisualConfig`.
 *
 * Reexportar o mesmo projeto reusa `config.project.id` como GUID e apenas sobe
 * `packageVersion`: e isso que faz o Power BI *atualizar* o visual em vez de
 * duplica-lo (RF-10 / RN-01).
 */
export async function buildPbiviz(
  template: ArrayBuffer | Uint8Array,
  config: VisualConfig,
): Promise<PbivizPackage> {
  // Defesa em profundidade (secao 13). O editor ja bloqueia o botao com config
  // invalida (RN-03), mas a config tambem pode chegar aqui por import de
  // arquivo — e um pacote invalido so falharia lá dentro do Power BI, onde o
  // usuario nao tem como diagnosticar.
  const validation = validateConfig(config);
  if (validation.kind === 'invalid') {
    const detail = validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ');
    throw new PbivizBuildError('CONFIG_INVALID', `Configuracao invalida — ${detail}`);
  }
  const valid = validation.config;

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(template);
  } catch (cause) {
    throw new PbivizBuildError(
      'TEMPLATE_UNREADABLE',
      'O pacote base do Vislow nao pode ser lido como .pbiviz.',
      { cause },
    );
  }

  // 1. Identidade atual do pacote base.
  const { value: pkgJson, date: pkgDate } = await readJsonEntry(zip, 'package.json');
  const pkg = pkgJson as PackageManifest;
  const from: Identity = { guid: pkg.visual.guid, name: pkg.visual.name };

  // 2. Nova identidade, derivada do projeto (RN-01 / RN-06). O `id` foi gerado
  //    na criacao do projeto e o schema garante que casa com
  //    `^[A-Za-z][A-Za-z0-9]{7,63}$` — identificador JS valido.
  const to: Identity = { guid: valid.project.id, name: valid.project.id };
  const version = valid.project.packageVersion;
  const displayName = valid.project.name;

  // 3. Recurso principal localizado pelo `package.json`, nunca por caminho
  //    montado a mao: o nome do arquivo depende do GUID do pacote base.
  const resourceEntry = pkg.resources.find((entry) => entry.file.endsWith('.pbiviz.json'));
  if (!resourceEntry) {
    throw new PbivizBuildError(
      'TEMPLATE_INCOMPLETE',
      'O pacote base nao declara um recurso .pbiviz.json em package.json.resources.',
    );
  }
  const { value: resJson, date: resDate } = await readJsonEntry(zip, resourceEntry.file);
  const res = resJson as ResourceManifest;

  // 4. Guarda de R-01 antes de qualquer escrita: se o minificador duplicou ou
  //    alterou o placeholder, abortar aqui e melhor que gerar um pacote que
  //    ignora a config do usuario.
  const occurrences = countOccurrences(res.content.js, CONFIG_PLACEHOLDER);
  if (occurrences !== 1) {
    throw new PbivizBuildError(
      'PLACEHOLDER_NOT_UNIQUE',
      `O placeholder de configuracao aparece ${String(occurrences)}x no pacote base (esperado exatamente 1).`,
    );
  }

  // 5. Identidade ANTES da injecao do payload.
  //
  //    A secao 8.3 documentava a ordem inversa "para o caso de o GUID antigo
  //    aparecer dentro do payload base64" — mas esse raciocinio esta invertido:
  //    injetar primeiro e o que expoe o payload a reescrita. Trocando a ordem, o
  //    base64 entra depois e nenhuma substituicao pode toca-lo. O placeholder
  //    nao contem o GUID nem o nome, entao a etapa de identidade nao tem como
  //    danifica-lo. Ver Anexo A, achado 24.
  let js = rewriteIdentity(res.content.js, from, to);

  // 6. Injeta a config (ADR-01/ADR-07). Callback em vez de string literal para
  //    que `$&` e afins jamais sejam interpretados como padrao de substituicao.
  const payload = toBase64Utf8(JSON.stringify(valid));
  js = js.replace(CONFIG_PLACEHOLDER, () => payload);

  // 7. Metadados do recurso. No pacote gerado `name === guid`, como faz a CLI.
  const newRes: ResourceManifest = {
    ...res,
    visual: { ...res.visual, guid: to.guid, name: to.name, displayName, version },
    content: { ...res.content, js },
  };

  // 8. Renomeia o recurso E atualiza a referencia. Passo mais facil de esquecer
  //    e o mais silencioso: fazer so metade faz o Power BI recusar o import com
  //    uma mensagem generica (T-03).
  const newResourcePath = `resources/${to.guid}.pbiviz.json`;
  zip.remove(resourceEntry.file);
  zip.file(newResourcePath, JSON.stringify(newRes), { date: resDate });

  // 9. `metadata.pbivizjson.resourceId` aponta para o `resourceId` ("rId0"), nao
  //    para o caminho — por isso so o campo `file` muda aqui.
  const newPkg: PackageManifest = {
    ...pkg,
    version,
    visual: { ...pkg.visual, guid: to.guid, name: to.name, displayName, version },
    resources: pkg.resources.map((entry) =>
      entry.file === resourceEntry.file ? { ...entry, file: newResourcePath } : entry,
    ),
  };
  zip.file('package.json', JSON.stringify(newPkg), { date: pkgDate });

  // Datas herdadas do template mantem o zip reproduzivel: reexportar a mesma
  // config duas vezes produz bytes identicos.
  // O JSZip aloca um ArrayBuffer comum; a assercao apenas fecha o generico
  // `ArrayBufferLike` da tipagem dele, que incluiria SharedArrayBuffer.
  const bytes = (await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
  })) as Uint8Array<ArrayBuffer>;

  return { bytes, filename: `${to.guid}.${version}.pbiviz`, guid: to.guid, version };
}

/** Embrulha o resultado para download no browser. */
export function toPbivizBlob(pkg: PbivizPackage): Blob {
  // `.pbiviz` e um zip; o Power BI nao inspeciona o MIME type.
  return new Blob([pkg.bytes], { type: 'application/zip' });
}
