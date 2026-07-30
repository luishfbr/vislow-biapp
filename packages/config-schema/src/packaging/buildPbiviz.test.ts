/**
 * Testes de empacotamento T-03 a T-08 (secao 12.3 do doc de MVP).
 *
 * "Os testes mais importantes do projeto": provam que o artefato entregue ao
 * usuario e um pacote que o Power BI aceita. Rodam sobre o template sintetico,
 * que reproduz a estrutura do pacote base; `buildPbiviz.real.test.ts` repete as
 * assertivas que dependem do bundle minificado de verdade.
 */
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { createDefaultConfig } from '../defaults.js';
import { bumpPackageVersion } from '../identity.js';
import { PROJECT_ID_PATTERN } from '../schema.js';
import type { VisualConfig } from '../types.js';
import { buildPbiviz, PbivizBuildError } from './buildPbiviz.js';
import { inspectPbiviz } from './inspectPbiviz.js';
import { BASE_GUID, BASE_NAME, makeTemplate } from './template.fixture.js';

const ID_RE = new RegExp(PROJECT_ID_PATTERN);

/** Nome que exercita RF-03: aspas, acento e emoji ao mesmo tempo. */
const HOSTILE_NAME = 'Vendas por Região "2026" 🚀 — 50% ↑';

async function build(config: VisualConfig, template?: Uint8Array) {
  const bytes = template ?? (await makeTemplate());
  return buildPbiviz(bytes, config);
}

describe('T-03 — estrutura do pacote gerado', () => {
  it('renomeia o recurso e atualiza a referencia em package.json', async () => {
    const config = createDefaultConfig('Vendas por Regiao', 'bar');
    const pkg = await build(config);
    const out = await inspectPbiviz(pkg.bytes);

    // O passo mais silencioso do algoritmo: fazer so metade faz o Power BI
    // recusar o import com uma mensagem generica.
    expect(out.resourcePath).toBe(`resources/${config.project.id}.pbiviz.json`);
    expect(out.declaredResourcePath).toBe(out.resourcePath);

    // O recurso antigo nao pode sobreviver no zip.
    expect(out.files).not.toContain(`resources/${BASE_GUID}.pbiviz.json`);
    expect(out.files).toHaveLength(2);
  });

  it('mantem identidade coerente entre package.json e o recurso', async () => {
    const config = createDefaultConfig('Custos Operacionais', 'bar');
    const out = await inspectPbiviz((await build(config)).bytes);

    for (const identity of [out.packageIdentity, out.resourceIdentity]) {
      expect(identity.guid).toBe(config.project.id);
      // A CLI oficial usa name === guid no pacote gerado.
      expect(identity.name).toBe(config.project.id);
      expect(identity.displayName).toBe('Custos Operacionais');
      expect(identity.version).toBe(config.project.packageVersion);
    }
  });

  it('preserva os campos do pacote base que nao sao reescritos', async () => {
    const out = await inspectPbiviz(
      (await build(createDefaultConfig('Preserva Campos', 'bar'))).bytes,
    );
    // `visualClassName` errado = visual carrega e nao instancia nada.
    expect(out.js).toContain('class:"Visual"');
    expect(out.packageIdentity.displayName).toBe('Preserva Campos');
  });

  it('usa a convencao de nome de arquivo da CLI oficial', async () => {
    const config = createDefaultConfig('Nome do Arquivo', 'bar');
    const pkg = await build(config);
    expect(pkg.filename).toBe(`${config.project.id}.${config.project.packageVersion}.pbiviz`);
  });
});

describe('T-04 — placeholder de config (R-01)', () => {
  it('aparece exatamente uma vez no template e zero vezes no pacote gerado', async () => {
    const template = await makeTemplate();
    const before = await inspectPbiviz(template);
    expect(before.isBaseTemplate).toBe(true);
    expect(before.js.split('__VISLOW_CONFIG_B64__')).toHaveLength(2); // 1 ocorrencia

    const out = await inspectPbiviz(
      (await build(createDefaultConfig('Placeholder', 'bar'), template)).bytes,
    );
    expect(out.js).not.toContain('__VISLOW_CONFIG_B64__');
    expect(out.isBaseTemplate).toBe(false);
  });

  it('aborta quando o placeholder aparece mais de uma vez', async () => {
    const template = await makeTemplate({ bundleRepeats: 2 });
    const error = await build(createDefaultConfig('Duplicado', 'bar'), template).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(PbivizBuildError);
    expect((error as PbivizBuildError).code).toBe('PLACEHOLDER_NOT_UNIQUE');
    expect((error as PbivizBuildError).message).toContain('2x');
  });

  it('aborta quando o placeholder desapareceu do bundle', async () => {
    const template = await makeTemplate({ placeholder: 'JA_PATCHEADO_AAAA' });
    const error = await build(createDefaultConfig('Ausente', 'bar'), template).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(PbivizBuildError);
    expect((error as PbivizBuildError).code).toBe('PLACEHOLDER_NOT_UNIQUE');
  });
});

describe('T-05 — round-trip da config (ADR-07)', () => {
  it('decodifica deep-equal a config de entrada, com aspas, acentos e emoji', async () => {
    const config = createDefaultConfig(HOSTILE_NAME, 'bar');
    config.header.text = 'Título "com aspas" — 100% 🚀';
    config.labels.categoryAxis = 'Região';

    const out = await inspectPbiviz((await build(config)).bytes);
    expect(out.config).toEqual(config);
  });

  it('sobrevive ao chartType kpi', async () => {
    const config = createDefaultConfig('Receita Total', 'kpi');
    const out = await inspectPbiviz((await build(config)).bytes);
    expect(out.config).toEqual(config);
  });

  it('rejeita config invalida antes de gerar qualquer byte (RN-03)', async () => {
    const config = createDefaultConfig('Config Invalida', 'bar');
    // Cor fora do padrao #RRGGBB.
    config.layout.surfaceColor = 'red';

    const error = await build(config).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PbivizBuildError);
    expect((error as PbivizBuildError).code).toBe('CONFIG_INVALID');
    expect((error as PbivizBuildError).message).toContain('layout.surfaceColor');
  });
});

describe('T-06 — reescrita de identidade (ADR-03 / R-02)', () => {
  it('elimina o GUID antigo do bundle, do recurso e do package.json', async () => {
    const config = createDefaultConfig('Sem Guid Antigo', 'bar');
    const out = await inspectPbiviz((await build(config)).bytes);

    expect(out.js).not.toContain(BASE_GUID);
    expect(out.js).not.toContain(BASE_NAME);
    expect(JSON.stringify(out.packageIdentity)).not.toContain(BASE_GUID);
    expect(JSON.stringify(out.resourceIdentity)).not.toContain(BASE_GUID);
  });

  it('declara o GUID novo como variavel no bundle', async () => {
    const config = createDefaultConfig('Var No Bundle', 'bar');
    const out = await inspectPbiviz((await build(config)).bytes);
    expect(out.js).toContain(`var ${config.project.id};`);
  });

  it('T-06d — o GUID e um identificador JavaScript valido', async () => {
    for (const name of [HOSTILE_NAME, '123 Vendas', '   ', 'Ação & Reação']) {
      const config = createDefaultConfig(name, 'bar');
      expect(config.project.id).toMatch(ID_RE);
      expect(config.project.id).toMatch(/^[A-Za-z][A-Za-z0-9]*$/);

      const out = await inspectPbiviz((await build(config)).bytes);
      expect(out.js).toContain(`var ${config.project.id};`);
    }
  });

  it('nao corrompe o GUID quando o slug do projeto e igual ao nome do pacote base', async () => {
    // Caso de borda que duas passadas sequenciais (GUID, depois nome) quebram:
    // apos trocar o GUID, todo GUID novo comeca pelo slug do usuario; se esse
    // slug for exatamente "vislowRuntime", a segunda passada casa com o prefixo
    // dos GUIDs recem-escritos e duplica o sufixo hex dentro deles.
    //
    // E alcancavel com um nome natural: slugify("vislow Runtime") remove o
    // espaco e preserva o caixa, produzindo exatamente o nome do pacote base.
    const config = createDefaultConfig('vislow Runtime', 'bar');
    expect(config.project.id.startsWith(BASE_NAME)).toBe(true);

    const out = await inspectPbiviz((await build(config)).bytes);
    expect(out.js).toContain(`var ${config.project.id};`);
    // Nenhuma ocorrencia do id seguida de mais alfanumerico — seria sufixo duplicado.
    expect(out.js).not.toMatch(new RegExp(`${config.project.id}[A-Za-z0-9]`));
    expect(out.packageIdentity.guid).toBe(config.project.id);
    expect(out.config).toEqual(config);
  });
});

describe('T-07 — unicidade e estabilidade do GUID (RN-01 / RF-10)', () => {
  it('projetos distintos produzem GUIDs distintos', async () => {
    const a = createDefaultConfig('Mesmo Nome', 'bar');
    const b = createDefaultConfig('Mesmo Nome', 'bar');

    const [pa, pb] = await Promise.all([build(a), build(b)]);
    expect(pa.guid).not.toBe(pb.guid);
    // Mesmo nome => mesmo slug; a entropia esta nos 32 hex.
    expect(pa.guid.slice(0, -32)).toBe(pb.guid.slice(0, -32));
  });

  it('reexportar o mesmo projeto reusa o GUID e sobe a versao', async () => {
    const first = createDefaultConfig('Reexportado', 'bar');
    const second: VisualConfig = {
      ...first,
      project: { ...first.project, packageVersion: bumpPackageVersion(first.project.packageVersion) },
    };

    const [p1, p2] = await Promise.all([build(first), build(second)]);

    // GUID igual => o Power BI atualiza o visual em vez de duplicar (MT-04).
    expect(p2.guid).toBe(p1.guid);
    expect(p1.version).toBe('1.0.0.0');
    expect(p2.version).toBe('1.0.0.1');
    expect(p2.filename).not.toBe(p1.filename);
  });

  it('e reproduzivel: a mesma config gera bytes identicos', async () => {
    const template = await makeTemplate();
    const config = createDefaultConfig('Reproduzivel', 'bar');
    const [a, b] = await Promise.all([build(config, template), build(config, template)]);
    expect(a.bytes).toEqual(b.bytes);
  });
});

describe('T-08 — orcamentos de tamanho (RNF-04 / RNF-05)', () => {
  it('o overhead do empacotamento e desprezivel frente ao template', async () => {
    const template = await makeTemplate();
    const pkg = await build(createDefaultConfig('Orcamento', 'bar'), template);
    const payloadBytes = JSON.stringify(createDefaultConfig('Orcamento', 'bar')).length;

    // A config comprimida nao pode dominar o pacote. O limite absoluto de 2 MB
    // e verificado contra o pacote real em buildPbiviz.real.test.ts.
    expect(pkg.bytes.byteLength).toBeLessThan(template.byteLength + payloadBytes * 2);
  });
});

describe('template invalido', () => {
  it('reporta TEMPLATE_UNREADABLE quando os bytes nao sao um zip', async () => {
    const garbage = new TextEncoder().encode('nao sou um zip');
    const error = await buildPbiviz(garbage, createDefaultConfig('Lixo', 'bar')).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(PbivizBuildError);
    expect((error as PbivizBuildError).code).toBe('TEMPLATE_UNREADABLE');
  });

  it('reporta TEMPLATE_INCOMPLETE quando o recurso nao esta declarado', async () => {
    const zip = new JSZip();
    zip.file('package.json', JSON.stringify({ version: '1.0.0.0', resources: [], visual: {} }));
    const bytes = await zip.generateAsync({ type: 'uint8array' });

    const error = await buildPbiviz(bytes, createDefaultConfig('Sem Recurso', 'bar')).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(PbivizBuildError);
    expect((error as PbivizBuildError).code).toBe('TEMPLATE_INCOMPLETE');
  });
});
