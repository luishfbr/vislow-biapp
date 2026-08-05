// @vitest-environment jsdom
import { createEmptySpec, validateSpec } from '@vislow/component-registry';
import { beforeEach, describe, expect, it } from 'vitest';
import { loadProject, saveProjectDebounced } from './persistence';

/**
 * O caminho por onde um projeto salvo se PERDE.
 *
 * `loadProject` descarta em silencio a spec que nao valida, e isso e
 * deliberado: abrir num estado invalido travaria o export sem o usuario saber
 * por que.
 *
 * ================= O QUE MUDOU, E POR QUE O ARQUIVO ENCOLHEU ================
 * Ate a spec 4.0.0 este arquivo tinha seis testes de MIGRACAO — uma spec v2 e
 * uma v3 escritas a mao, com token no lugar de pixel, e assercoes sobre o que a
 * conversao tinha de preservar (a identidade do projeto, RF-10; as ligacoes; a
 * tabela nao esvaziar). Eram a guarda entre "o schema evoluiu" e "o projeto do
 * usuario sumiu".
 *
 * A 5.0.0 removeu tipos de no e NAO tem migracao. Em vez de converter, a chave
 * mudou para `vislow:project:v5`: o projeto antigo continua no navegador e
 * simplesmente nunca e procurado. Nao ha conversao para dar errado, e por isso
 * nao ha mais o que essas seis assercoes protegessem.
 *
 * O que sobra e a guarda que continua valendo: a chave certa, a carga
 * adulterada, e — a mais importante — a prova de que a chave NOVA nao le a
 * antiga. Se ela lesse, todo projeto salvo seria reprovado pelo schema 5.0.0 e
 * apagado em silencio, que e exatamente o modo de falha que a troca de chave
 * existe para evitar.
 * ============================================================================
 *
 * As cargas continuam ESCRITAS A MAO onde importa. Uma carga derivada do codigo
 * atual evoluiria junto com ele e continuaria verde no dia em que o arquivo do
 * usuario deixasse de abrir.
 */

const KEY = 'vislow:project:v5';
const V3_KEY = 'vislow:project:v3';

/** Uma spec 4.0.0 real, do formato que a 5.0.0 nao le mais. */
const V4_SALVA = {
  schemaVersion: '4.0.0',
  project: {
    id: 'PainelSalvo4b8e',
    name: 'Painel salvo',
    packageVersion: '1.0.0.2',
    artboard: { width: 1280, height: 720 },
  },
  data: {
    columns: [{ name: 'valor', displayName: 'Valor', kind: 'measure', type: 'decimal' }],
    rows: [[1200]],
  },
  root: {
    id: 'container-1',
    kind: 'container',
    props: {
      placement: 'canvas',
      direction: 'column',
      gap: 8,
      padding: 16,
      radius: 8,
      borderWidth: 1,
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
          valueFontSize: 36,
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

  it('le uma spec 5.0.0 da chave atual', () => {
    const spec = createEmptySpec('Painel');
    window.localStorage.setItem(KEY, JSON.stringify(spec));

    const carregada = loadProject();
    expect(validateSpec(carregada).kind).toBe('valid');
    expect(carregada?.project.id).toBe(spec.project.id);
  });

  it('NAO olha a chave antiga — e o que impede o apagamento em silencio', () => {
    // A guarda central da troca de chave. Se `loadProject` lesse `:v3`, esta
    // carga 4.0.0 seria lida, reprovada pelo schema (o tipo `kpi` nao existe
    // mais) e DESCARTADA sem dizer nada — o usuario abriria o editor e o
    // projeto dele teria sumido. Comecar em branco tambem perde o projeto, mas
    // sem ter mexido no que estava guardado: a carga antiga continua la.
    window.localStorage.setItem(V3_KEY, JSON.stringify(V4_SALVA));

    expect(loadProject()).toBeNull();
    expect(window.localStorage.getItem(V3_KEY)).not.toBeNull();
  });

  it('spec de major antigo na chave ATUAL e descartada, nao aceita pela metade', () => {
    // Cenario de storage adulterado, ou de um downgrade do app. O schema 5.0.0
    // nao conhece `kpi`: aceitar isto abriria o editor com um no que nenhum
    // componente sabe desenhar.
    window.localStorage.setItem(KEY, JSON.stringify(V4_SALVA));
    expect(loadProject()).toBeNull();
  });

  it('carga adulterada e descartada, nao explode', () => {
    window.localStorage.setItem(KEY, '{ isto nao e json');
    expect(loadProject()).toBeNull();
  });
});

describe('saveProjectDebounced', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('grava na chave nova, e o que foi gravado volta a abrir', async () => {
    // O par de ida e volta: gravar e ler tem de usar a MESMA chave. Com as duas
    // divergindo, o autosave funcionaria e o editor abriria em branco toda vez —
    // sem erro em lugar nenhum.
    const spec = createEmptySpec('Ida e volta');
    saveProjectDebounced(spec);
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(window.localStorage.getItem(KEY)).not.toBeNull();
    expect(loadProject()?.project.id).toBe(spec.project.id);
  });
});
