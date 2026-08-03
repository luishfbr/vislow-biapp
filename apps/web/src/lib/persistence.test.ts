// @vitest-environment jsdom
import { validateSpec } from '@vislow/component-registry';
import { beforeEach, describe, expect, it } from 'vitest';
import { loadProject } from './persistence';

/**
 * O caminho por onde um projeto salvo se PERDE.
 *
 * `loadProject` descarta em silencio a spec que nao valida, e isso e
 * deliberado: abrir num estado invalido travaria o export sem o usuario saber
 * por que. O preco e que uma migracao quebrada nao da erro na tela — ela apaga
 * o projeto de quem abriu o editor. Este arquivo e a guarda entre as duas
 * coisas.
 *
 * As cargas sao ESCRITAS A MAO, e nao construidas com as funcoes de hoje. Uma
 * carga derivada do codigo atual evoluiria junto com ele e continuaria verde no
 * dia em que o arquivo do usuario deixasse de abrir.
 */

const V3_KEY = 'vislow:project:v3';
const V2_KEY = 'vislow:project:v2';

/** Uma spec v2 real, do formato que antecede a tabela de exemplo. */
const V2_SALVA = {
  schemaVersion: '2.0.0',
  project: {
    id: 'VendasporRegiao7f3a',
    name: 'Vendas por Região',
    packageVersion: '1.0.0.4',
    artboard: { width: 1280, height: 720 },
  },
  dataRoles: [
    { name: 'categoria', displayName: 'Categoria', kind: 'grouping' },
    { name: 'valor', displayName: 'Valor', kind: 'measure' },
  ],
  root: {
    id: 'container-1',
    kind: 'container',
    props: {
      placement: 'canvas',
      direction: 'column',
      gap: 'sm',
      padding: 'md',
      radius: 'lg',
      border: 'none',
      shadow: 'none',
      background: '#ffffff',
      borderColor: '#e2e8f0',
    },
    children: [
      {
        id: 'kpi-2',
        kind: 'kpi',
        props: {
          measureRole: 'valor',
          label: 'Receita',
          valueFontSize: '4xl',
          valueColor: '#3b82f6',
          labelColor: '#64748b',
        },
        rect: { x: 10, y: 10, w: 80, h: 80 },
      },
    ],
  },
};

describe('loadProject', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('sem nada salvo, comeca do zero', () => {
    expect(loadProject()).toBeNull();
  });

  it('um projeto v2 salvo MIGRA — nao abre em branco', () => {
    window.localStorage.setItem(V2_KEY, JSON.stringify(V2_SALVA));

    const spec = loadProject();
    expect(spec).not.toBeNull();
    expect(validateSpec(spec).kind).toBe('valid');
  });

  it('a migracao preserva a identidade — sem ela o Power BI duplica (RF-10)', () => {
    window.localStorage.setItem(V2_KEY, JSON.stringify(V2_SALVA));

    const spec = loadProject();
    expect(spec?.project.id).toBe('VendasporRegiao7f3a');
    expect(spec?.project.packageVersion).toBe('1.0.0.4');
  });

  it('a migracao preserva a composicao e as ligacoes', () => {
    window.localStorage.setItem(V2_KEY, JSON.stringify(V2_SALVA));

    const spec = loadProject();
    expect(spec?.root.children?.[0]?.props.measureRole).toBe('valor');
    expect(spec?.data.columns.map((column) => column.name)).toEqual(['categoria', 'valor']);
    // A tabela nasce preenchida: migrar nao pode esvaziar o preview de quem ja
    // tinha uma composicao na tela.
    expect(spec?.data.rows.length).toBeGreaterThan(0);
  });

  it('a chave v3 tem precedencia sobre a v2 — migrar e so para quem nao migrou', () => {
    window.localStorage.setItem(V2_KEY, JSON.stringify(V2_SALVA));
    window.localStorage.setItem(V3_KEY, JSON.stringify(V2_SALVA)); // v2 na chave v3: invalida

    // Nao cai de volta para a v2: a chave atual existe e mandou. Um fallback
    // aqui ressuscitaria em silencio um projeto que o usuario ja evoluiu.
    expect(loadProject()).toBeNull();
  });

  it('carga adulterada e descartada, nao explode', () => {
    window.localStorage.setItem(V3_KEY, '{ isto nao e json');
    expect(loadProject()).toBeNull();
  });
});
