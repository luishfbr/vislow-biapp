/**
 * Template sintetico de `.pbiviz`.
 *
 * Reproduz a estrutura exata do pacote base do Runtime Core — a mesma que foi
 * importada com sucesso no Power BI Desktop no gate da Fase 1 — para que os
 * testes de empacotamento cubram os caminhos de erro e os casos de borda de
 * identidade sem depender de `pbiviz package`, que leva ~1 min e exige a
 * toolchain instalada.
 *
 * Nao substitui a verificacao contra o pacote real (`buildPbiviz.real.test.ts`):
 * so o bundle de verdade prova o que o minificador faz com o placeholder.
 */
import JSZip from 'jszip';

export const BASE_NAME = 'vislowRuntime';
export const BASE_GUID = 'vislowRuntime7F3A9C2E5D8B4A1F6E0C3B7D9A2E5F81';

/**
 * Imita o `content.js` minificado: o GUID como nome de variavel global (4
 * ocorrencias no pacote real), o nome do visual solto (5 ocorrencias) e o
 * placeholder de config exatamente uma vez, na forma que o terser produziu no
 * spike.
 */
function fakeBundle(name: string, guid: string, placeholder: string): string {
  return [
    `var ${guid};(()=>{"use strict";`,
    `var e={visualName:"${name}",guid:"${guid}"};`,
    `const i="${placeholder}",r=-1===i.indexOf("_");`,
    `powerbi.visuals.plugins.${guid}={name:"${guid}",displayName:"${name}",class:"Visual"};`,
    `console.log("${name}",${guid},e.guid==="${guid}"?"${name}":"${name}");`,
    `})();`,
  ].join('');
}

export interface FixtureOptions {
  name?: string;
  guid?: string;
  /** Sobrescreve o token injetado — usado para simular R-01. */
  placeholder?: string;
  /** Repete o bundle inteiro N vezes, duplicando o placeholder (R-01). */
  bundleRepeats?: number;
}

/** Monta um template em memoria, no formato aceito por `buildPbiviz`. */
export async function makeTemplate(options: FixtureOptions = {}): Promise<Uint8Array> {
  const name = options.name ?? BASE_NAME;
  const guid = options.guid ?? BASE_GUID;
  const placeholder = options.placeholder ?? '__VISLOW_CONFIG_B64__';
  const repeats = options.bundleRepeats ?? 1;

  const resourcePath = `resources/${guid}.pbiviz.json`;
  const zip = new JSZip();

  zip.file(
    resourcePath,
    JSON.stringify({
      resourceId: 'rId0',
      sourceType: 5,
      visual: {
        name,
        displayName: 'Vislow Runtime',
        guid,
        visualClassName: 'Visual',
        version: '1.0.0.0',
        description: 'Pacote base.',
      },
      content: {
        js: Array.from({ length: repeats }, () => fakeBundle(name, guid, placeholder)).join('\n'),
        css: '.pbi\\:p-4{padding:1rem}',
        iconBase64: 'iVBORw0KGgo=',
      },
    }),
  );

  zip.file(
    'package.json',
    JSON.stringify({
      version: '1.0.0.0',
      author: { name: 'Vislow', email: 'contato@vislow.app' },
      resources: [{ resourceId: 'rId0', sourceType: 5, file: resourcePath }],
      visual: {
        name,
        displayName: 'Vislow Runtime',
        guid,
        visualClassName: 'Visual',
        version: '1.0.0.0',
        description: 'Pacote base.',
        supportUrl: 'https://github.com/luishfbr/vislow-biapp',
      },
      metadata: { pbivizjson: { resourceId: 'rId0' } },
    }),
  );

  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}
