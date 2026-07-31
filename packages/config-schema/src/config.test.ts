import { describe, expect, it } from 'vitest';
import { createDefaultConfig, DEFAULT_BAR, withChartType } from './defaults.js';
import { bumpPackageVersion, createProjectId, slugify } from './identity.js';
import { checkCompatibility } from './migrations.js';
import { PROJECT_ID_PATTERN, SCHEMA_VERSION } from './schema.js';
import { TOKEN_CATALOG } from './tokens.js';
import { assertValidConfig, isValidConfig, validateConfig } from './validate.js';
import type { VisualConfig } from './types.js';

const ID_RE = new RegExp(PROJECT_ID_PATTERN);

describe('T-01 identidade do visual', () => {
  it('remove diacriticos e caracteres invalidos', () => {
    expect(slugify('Vendas por Região "2026" 🚀')).toBe('VendasporRegiao2026');
  });

  it('prefixa quando o nome comeca por digito', () => {
    expect(slugify('2026 Vendas')).toMatch(/^v2026/);
  });

  it('usa fallback quando nao sobra nada', () => {
    expect(slugify('🚀🚀🚀')).toBe('vislow');
  });

  it('gera identificador JS valido — o GUID e nome de variavel no bundle', () => {
    for (const name of ['Vendas', 'Custos Operacionais', '2026', 'á é í ó ú']) {
      const id = createProjectId(name);
      expect(id).toMatch(/^[A-Za-z][A-Za-z0-9]*$/);
      expect(id).toMatch(ID_RE);
    }
  });

  it('T-07 gera ids distintos para o mesmo nome', () => {
    const ids = new Set(Array.from({ length: 200 }, () => createProjectId('Vendas')));
    expect(ids.size).toBe(200);
  });

  it('incrementa o componente de build da versao', () => {
    expect(bumpPackageVersion('1.0.0.0')).toBe('1.0.0.1');
    expect(bumpPackageVersion('2.3.4.9')).toBe('2.3.4.10');
  });
});

describe('T-01 defaults e validacao', () => {
  it('config default de barras e valido', () => {
    const cfg = createDefaultConfig('Meu Visual', 'bar');
    expect(isValidConfig(cfg)).toBe(true);
    expect(cfg.bar).toBeDefined();
    expect(cfg.kpi).toBeUndefined();
  });

  it('config default de KPI e valido', () => {
    const cfg = createDefaultConfig('Meu KPI', 'kpi');
    expect(isValidConfig(cfg)).toBe(true);
    expect(cfg.kpi).toBeDefined();
  });

  it('troca de tipo preserva tokens comuns e preenche o bloco novo (RF-01)', () => {
    const bar = createDefaultConfig('Visual', 'bar');
    bar.layout.padding = 'xl';
    const kpi = withChartType(bar, 'kpi');
    expect(kpi.layout.padding).toBe('xl');
    expect(kpi.kpi).toBeDefined();
    expect(isValidConfig(kpi)).toBe(true);
  });
});

describe('RN-03/RN-05 fronteira de validacao', () => {
  const base = () => createDefaultConfig('Visual valido', 'bar');

  it('rejeita token fora do catalogo', () => {
    const cfg = { ...base(), layout: { ...base().layout, padding: 'gigante' } };
    const r = validateConfig(cfg);
    expect(r.kind).toBe('invalid');
    if (r.kind === 'invalid') expect(r.issues.some((i) => i.path === 'layout.padding')).toBe(true);
  });

  it('rejeita cor fora do formato hex', () => {
    const cfg = base();
    cfg.layout.surfaceColor = 'white';
    expect(isValidConfig(cfg)).toBe(false);
  });

  it('rejeita propriedade desconhecida (additionalProperties: false)', () => {
    const cfg = { ...base(), truque: 'malicioso' };
    const r = validateConfig(cfg);
    expect(r.kind).toBe('invalid');
    if (r.kind === 'invalid') expect(r.issues[0]?.message).toContain('truque');
  });

  it('rejeita nome de projeto fora de 3-50 chars (RN-06)', () => {
    const cfg = base();
    cfg.project.name = 'ab';
    expect(isValidConfig(cfg)).toBe(false);
  });

  it('rejeita chartType bar sem o bloco bar', () => {
    const cfg = base();
    delete (cfg as Partial<VisualConfig>).bar;
    expect(isValidConfig(cfg)).toBe(false);
  });

  it('rejeita versao de pacote fora do formato de 4 componentes (RN-07)', () => {
    const cfg = base();
    (cfg.project as { packageVersion: string }).packageVersion = '1.0.0';
    expect(isValidConfig(cfg)).toBe(false);
  });

  it('aceita todos os valores do catalogo de tokens', () => {
    for (const padding of TOKEN_CATALOG.spacing) {
      for (const radius of TOKEN_CATALOG.radius) {
        const cfg = base();
        cfg.layout.padding = padding;
        cfg.layout.radius = radius;
        expect(isValidConfig(cfg), `${padding}/${radius}`).toBe(true);
      }
    }
  });

  it('assertValidConfig lanca com detalhe do campo', () => {
    expect(() => assertValidConfig({ schemaVersion: 'x' })).toThrow(/VisualConfig invalido/);
  });
});

describe('RN-09 compatibilidade de schema', () => {
  it('mesma versao e ok', () => {
    expect(checkCompatibility(SCHEMA_VERSION).kind).toBe('ok');
  });

  it('major diferente e incompativel', () => {
    expect(checkCompatibility('2.0.0', '1.0.0').kind).toBe('incompatible');
  });

  it('minor a frente renderiza com defaults', () => {
    expect(checkCompatibility('1.2.0', '1.0.0').kind).toBe('forward');
  });

  it('minor atras e ok', () => {
    expect(checkCompatibility('1.0.0', '1.2.0').kind).toBe('ok');
  });

  it('versao malformada e incompativel', () => {
    expect(checkCompatibility('abc').kind).toBe('incompatible');
  });
});

describe('round-trip JSON (contrato editor <-> runtime)', () => {
  it('sobrevive a serializacao com aspas, acento e emoji', () => {
    const cfg = createDefaultConfig('Vendas por Região "2026" 🚀', 'bar');
    const back: unknown = JSON.parse(JSON.stringify(cfg));
    expect(back).toEqual(cfg);
    expect(isValidConfig(back)).toBe(true);
  });

  it('sobrevive ao transporte em base64 (ADR-07)', () => {
    const cfg = createDefaultConfig('Título com acento — e emoji 🚀', 'bar');
    const b64 = Buffer.from(JSON.stringify(cfg), 'utf8').toString('base64');
    expect(b64).not.toMatch(/_/); // base64 padrao nunca tem "_": base da deteccao em 8.2
    const back: unknown = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
    expect(back).toEqual(cfg);
  });
});

describe('defaults nao regridem sem intencao', () => {
  it('bar mantem o acento azul padrao', () => {
    expect(DEFAULT_BAR.accentColor).toBe('#3b82f6');
  });
});
