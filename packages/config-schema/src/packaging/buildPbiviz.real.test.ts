/**
 * T-04, T-06 e T-08 contra o pacote base REAL, recem-construido por
 * `pbiviz package`.
 *
 * Por que separado dos testes sinteticos: so o bundle de verdade prova o que o
 * minificador fez com o placeholder e com o GUID, e so ele tem tamanho para
 * medir contra os orcamentos do RNF-04/RNF-05. Em troca, depende de um artefato
 * que leva ~1 min para produzir.
 *
 * Localmente, sem o artefato, os testes sao ignorados com um aviso. No CI a
 * variavel VISLOW_REQUIRE_TEMPLATE=1 transforma a ausencia em falha — nao ha
 * cenario em que o CI passe sem verificar o pacote real.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDefaultConfig } from '../defaults.js';
import { buildPbiviz } from './buildPbiviz.js';
import { inspectPbiviz } from './inspectPbiviz.js';

const DIST = new URL('../../../runtime/dist/', import.meta.url).pathname;
const MAX_PACKAGE_BYTES = 2 * 1024 * 1024; // limite rigido do Power BI (RNF-05 / C-04)
const MAX_JS_BYTES = 1024 * 1024; // RNF-04
const REQUIRED = process.env.VISLOW_REQUIRE_TEMPLATE === '1';

async function findTemplate(): Promise<string | null> {
  try {
    const files = (await readdir(DIST)).filter((file) => file.endsWith('.pbiviz'));
    if (files.length !== 1) return null;
    return join(DIST, files[0]!);
  } catch {
    return null;
  }
}

const templatePath = await findTemplate();

if (templatePath === null && REQUIRED) {
  throw new Error(
    'VISLOW_REQUIRE_TEMPLATE=1 mas nao ha exatamente 1 .pbiviz em packages/runtime/dist. ' +
      'Rode `pnpm --filter @vislow/runtime build:runtime` antes dos testes de empacotamento.',
  );
}

if (templatePath === null) {
  console.warn(
    '\n[T-04/T-06/T-08] ignorados: pacote base ausente.\n' +
      '  Para rodar: pnpm --filter @vislow/runtime build:runtime\n',
  );
}

describe.skipIf(templatePath === null)('pacote base real', () => {
  const readTemplate = async () => readFile(templatePath!);

  it('T-04 — o placeholder aparece 1x no template e 0x no pacote gerado', async () => {
    const template = await readTemplate();
    const before = await inspectPbiviz(template);
    expect(before.isBaseTemplate).toBe(true);
    // A assertiva que fecha R-01: o minificador nao duplicou nem alterou o token.
    expect(before.js.split('__VISLOW_CONFIG_B64__')).toHaveLength(2);

    const config = createDefaultConfig('Vendas por Região "2026" 🚀', 'bar');
    const out = await inspectPbiviz((await buildPbiviz(template, config)).bytes);
    expect(out.js).not.toContain('__VISLOW_CONFIG_B64__');
    expect(out.config).toEqual(config);
  });

  it('T-06 — o GUID e o nome do pacote base desaparecem por completo', async () => {
    const template = await readTemplate();
    const base = await inspectPbiviz(template);
    const oldGuid = base.packageIdentity.guid;
    const oldName = base.packageIdentity.name;

    // Se o pacote base mudar de forma a nao mais conter o GUID no bundle, esta
    // assertiva perde sentido em silencio — daí verificar o ponto de partida.
    expect(base.js).toContain(`var ${oldGuid}`);

    const config = createDefaultConfig('Sem Rastro do Base', 'bar');
    const out = await inspectPbiviz((await buildPbiviz(template, config)).bytes);

    expect(out.js).not.toContain(oldGuid);
    expect(out.js).not.toContain(oldName);
    expect(out.js).toContain(`var ${config.project.id}`);
    expect(out.files).not.toContain(`resources/${oldGuid}.pbiviz.json`);
    expect(out.packageIdentity.guid).toBe(config.project.id);
    expect(out.resourcePath).toBe(`resources/${config.project.id}.pbiviz.json`);
    expect(out.declaredResourcePath).toBe(out.resourcePath);
  });

  it('T-08 — pacote < 2 MB e content.js < 1 MB', async () => {
    const template = await readTemplate();
    const pkg = await buildPbiviz(template, createDefaultConfig('Orcamento Real', 'kpi'));
    const out = await inspectPbiviz(pkg.bytes);

    expect(pkg.bytes.byteLength).toBeLessThan(MAX_PACKAGE_BYTES);
    expect(out.jsBytes).toBeLessThan(MAX_JS_BYTES);
  });
});
