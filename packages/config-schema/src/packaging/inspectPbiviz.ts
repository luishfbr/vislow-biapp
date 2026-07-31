/**
 * Leitura de um `.pbiviz` ja empacotado.
 *
 * E o portao da ADR-11: nada sai do worker de build sem passar por aqui. Existe
 * para verificar o pacote de FORA, sem confiar em quem o escreveu — o `pbiviz`
 * ja reportou sucesso produzindo pacote quebrado tres vezes. Tambem serve de
 * ferramenta de diagnostico quando um pacote e recusado no import do Power BI.
 *
 * O que ele NAO faz mais: procurar config embutida em base64. Isso pertencia ao
 * Runtime Core, um visual pre-compilado que lia a escolha do usuario de um
 * payload injetado no bundle. Desde a ADR-08 o visual e compilado por usuario e
 * a spec vira codigo — nao ha payload a extrair.
 */
import JSZip from 'jszip';

/** O zip abriu, mas nao tem a estrutura de um pacote do Power BI. */
export class PbivizInspectionError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'PbivizInspectionError';
  }
}

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
  /** Bundle do visual. Exposto cru para as assertivas de conteudo. */
  js: string;
  /** Tamanho total do pacote em bytes (RNF-05). */
  packageBytes: number;
  /** Tamanho do `content.js` em bytes (RNF-04). */
  jsBytes: number;
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
    throw new PbivizInspectionError(`O pacote nao contem "${path}".`);
  }
  return JSON.parse(await entry.async('string')) as T;
}

/** Abre um `.pbiviz` e devolve tudo o que o portao e o diagnostico precisam. */
export async function inspectPbiviz(bytes: ArrayBuffer | Uint8Array): Promise<PbivizInspection> {
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
    throw new PbivizInspectionError(
      'O pacote nao declara um recurso .pbiviz.json em package.json.resources.',
    );
  }

  const files = Object.keys(zip.files).filter((path) => !zip.files[path]?.dir);
  const actual = files.find((path) => path.endsWith('.pbiviz.json'));
  if (!actual) {
    throw new PbivizInspectionError('O zip nao contem nenhum .pbiviz.json.');
  }

  const res = await readJson<{ visual: VisualMeta; content: { js: string } }>(zip, actual);
  const js = res.content.js;

  return {
    packageIdentity: toIdentity(pkg.visual),
    resourceIdentity: toIdentity(res.visual),
    resourcePath: actual,
    declaredResourcePath: declared.file,
    files,
    js,
    packageBytes,
    jsBytes: new TextEncoder().encode(js).byteLength,
  };
}
