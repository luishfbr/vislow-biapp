import { describe, expect, it } from 'vitest';
import type powerbi from 'powerbi-visuals-api';
import {
  buildFormattingModel,
  pick,
  readOverrides,
  type ExposedNode,
  type FormattingSpec,
  type Overrides,
} from '../template/src/formatting.js';

/**
 * O painel de formatacao do visual gerado, testado SEM compilar um pacote.
 *
 * O arquivo sob teste vive em `template/src/` porque e fonte do projeto pbiviz —
 * mas depende so de tipos do `powerbi-visuals-api`, entao roda aqui. E o motivo
 * de `packages/*\/test/**` existir no `include` do vitest desde o Sprint 7: um
 * pacote cujo `src/` e compilado por uma toolchain de fora precisa de um lugar
 * para testes.
 *
 * O que este arquivo NAO prova e que o host desenha o painel — isso e do gate,
 * que compila um `.pbiviz` de verdade e chama `getFormattingModel()` no bundle.
 */

/** Um no publicado com um campo de cada tipo que precisa de tratamento proprio. */
function nodeFixture(): ExposedNode {
  return {
    id: 'text-1',
    title: 'Titulo do painel',
    values: {
      content: 'Receita total',
      fontSize: 20,
      fontWeight: 'semibold',
      color: '#1e231c',
      showBackground: false,
      background: '#fafbf8',
    },
    fields: [
      { key: 'content', label: 'Conteudo', kind: 'text', maxLength: 10 },
      { key: 'fontSize', label: 'Tamanho', kind: 'length', min: 8, max: 200 },
      {
        key: 'fontWeight',
        label: 'Peso',
        kind: 'token',
        options: [
          { value: 'normal', label: 'Normal' },
          { value: 'semibold', label: 'Semi-negrito' },
        ],
      },
      { key: 'color', label: 'Cor do texto', kind: 'color' },
      { key: 'showBackground', label: 'Fundo', kind: 'boolean' },
      {
        key: 'background',
        label: 'Cor de fundo',
        kind: 'color',
        showWhen: { key: 'showBackground', equals: 'true' },
      },
    ],
  };
}

const SPEC: FormattingSpec = [nodeFixture()];

/** Um `VisualUpdateOptions` com o que o host teria persistido. */
function optionsWith(objects: Record<string, unknown> | undefined): powerbi.extensibility.visual.VisualUpdateOptions {
  return {
    dataViews: [{ metadata: { columns: [], objects } }],
  } as unknown as powerbi.extensibility.visual.VisualUpdateOptions;
}

/** Acha um slice pelo campo. `undefined` quando o painel nao o mostrou. */
function sliceOf(model: powerbi.visuals.FormattingModel, key: string) {
  const card = model.cards[0] as powerbi.visuals.FormattingCard | undefined;
  const group = card?.groups[0] as powerbi.visuals.FormattingGroup | undefined;
  return (group?.slices ?? []).find(
    (slice) => (slice as powerbi.visuals.SimpleVisualFormattingSlice).uid === `text-1-${key}`,
  ) as powerbi.visuals.SimpleVisualFormattingSlice | undefined;
}

/** O valor que o controle mostra, ja desembrulhado do formato de cada um. */
function shown(model: powerbi.visuals.FormattingModel, key: string): unknown {
  const control = sliceOf(model, key)?.control;
  const value = (control?.properties as { value?: unknown } | undefined)?.value;
  if (value !== null && typeof value === 'object') {
    return (value as { value?: unknown }).value;
  }
  return value;
}

describe('leitura do que o consumidor escolheu', () => {
  it('sem dataView, nao ha override nenhum', () => {
    const semNada = { dataViews: [] } as unknown as powerbi.extensibility.visual.VisualUpdateOptions;
    expect(readOverrides(semNada, SPEC)).toEqual({});
    expect(readOverrides(optionsWith(undefined), SPEC)).toEqual({});
  });

  it('a cor chega embrulhada em fill e sai como hexadecimal', () => {
    const overrides = readOverrides(
      optionsWith({ 'text-1': { color: { solid: { color: '#ff0000' } } } }),
      SPEC,
    );
    expect(overrides['text-1']?.color).toBe('#ff0000');
  });

  it('cor que nao e #rrggbb e RECUSADA', () => {
    // Um valor lixo aqui viraria `color: 'red-ish'` num `style` inline: o
    // navegador ignora, o texto sai com a cor herdada e nao ha erro nenhum.
    const overrides = readOverrides(
      optionsWith({ 'text-1': { color: { solid: { color: 'vermelho' } } } }),
      SPEC,
    );
    expect(overrides['text-1']).toBeUndefined();
  });

  it('opcao fora da lista declarada e RECUSADA', () => {
    const overrides = readOverrides(optionsWith({ 'text-1': { fontWeight: 'ultra' } }), SPEC);
    expect(overrides['text-1']).toBeUndefined();
  });

  it('tipo trocado e RECUSADO', () => {
    const overrides = readOverrides(
      optionsWith({ 'text-1': { fontSize: 'grande', showBackground: 'sim' } }),
      SPEC,
    );
    expect(overrides['text-1']).toBeUndefined();
  });

  it('numero que nao e finito e RECUSADO — nao vira padding NaN', () => {
    const overrides = readOverrides(optionsWith({ 'text-1': { fontSize: Number.NaN } }), SPEC);
    expect(overrides['text-1']).toBeUndefined();
  });

  it('valor do tipo certo fora da faixa e NORMALIZADO, nao descartado', () => {
    // O controle do proprio Power BI ja limita o que da para digitar: um valor
    // assim vem de JSON antigo ou editado a mao. Reverter o texto inteiro por
    // causa do teto se leria como "o campo nao funciona".
    const overrides = readOverrides(
      optionsWith({ 'text-1': { fontSize: 9999, content: 'um texto bem mais longo que o teto' } }),
      SPEC,
    );
    expect(overrides['text-1']?.fontSize).toBe(200);
    expect(overrides['text-1']?.content).toBe('um texto b');
  });

  it('pixel decimal vira inteiro', () => {
    const overrides = readOverrides(optionsWith({ 'text-1': { fontSize: 12.7 } }), SPEC);
    expect(overrides['text-1']?.fontSize).toBe(13);
  });

  it('object de um no que nao existe na tabela e ignorado', () => {
    const overrides = readOverrides(optionsWith({ 'text-99': { fontSize: 40 } }), SPEC);
    expect(overrides).toEqual({});
  });
});

describe('o valor que chega ao JSX', () => {
  const overrides: Overrides = { 'text-1': { fontSize: 42 } };

  it('o override vence o valor do autor', () => {
    expect(pick(overrides, 'text-1', 'fontSize', 20)).toBe(42);
  });

  it('sem override, vale o valor do autor', () => {
    expect(pick(overrides, 'text-1', 'content', 'Receita total')).toBe('Receita total');
    expect(pick({}, 'text-1', 'fontSize', 20)).toBe(20);
  });

  it('override de outro tipo nao passa — o autor vence', () => {
    const trocado = { 'text-1': { fontSize: 'grande' } } as unknown as Overrides;
    expect(pick(trocado, 'text-1', 'fontSize', 20)).toBe(20);
  });
});

describe('o modelo que o host desenha', () => {
  it('um card por no, com o apelido no titulo', () => {
    const model = buildFormattingModel(SPEC, {});
    expect(model.cards).toHaveLength(1);
    expect((model.cards[0] as powerbi.visuals.FormattingCard).displayName).toBe('Titulo do painel');
  });

  it('cada tipo de campo vira o controle certo', () => {
    const model = buildFormattingModel(SPEC, {});
    expect(sliceOf(model, 'content')?.control.type).toBe('TextInput');
    expect(sliceOf(model, 'fontSize')?.control.type).toBe('NumUpDown');
    expect(sliceOf(model, 'fontWeight')?.control.type).toBe('Dropdown');
    expect(sliceOf(model, 'color')?.control.type).toBe('ColorPicker');
    expect(sliceOf(model, 'showBackground')?.control.type).toBe('ToggleSwitch');
  });

  it('o controle mostra o valor vigente, nao sempre o do autor', () => {
    expect(shown(buildFormattingModel(SPEC, {}), 'fontSize')).toBe(20);
    expect(shown(buildFormattingModel(SPEC, { 'text-1': { fontSize: 42 } }), 'fontSize')).toBe(42);
  });

  it('o numero em pixel leva a unidade e a faixa do descritor', () => {
    const control = sliceOf(buildFormattingModel(SPEC, {}), 'fontSize')?.control;
    const options = (control?.properties as { options?: powerbi.visuals.NumUpDownFormat }).options;

    expect(options?.unitSymbol).toBe('px');
    expect(options?.minValue?.value).toBe(8);
    expect(options?.maxValue?.value).toBe(200);
  });

  it('o dropdown leva os rotulos humanos e seleciona o valor vigente', () => {
    const control = sliceOf(buildFormattingModel(SPEC, {}), 'fontWeight')?.control;
    const properties = control?.properties as {
      items?: powerbi.IEnumMember[];
      value?: powerbi.IEnumMember;
    };

    expect(properties.items?.map((item) => item.displayName)).toEqual(['Normal', 'Semi-negrito']);
    expect(properties.value?.value).toBe('semibold');
  });

  it('o campo escondido pelo showWhen nao vira slice', () => {
    // `showBackground` esta desligado no valor do autor.
    expect(sliceOf(buildFormattingModel(SPEC, {}), 'background')).toBeUndefined();
  });

  it('ligar o governante faz o campo governado aparecer', () => {
    const model = buildFormattingModel(SPEC, { 'text-1': { showBackground: true } });
    expect(sliceOf(model, 'background')?.control.type).toBe('ColorPicker');
  });

  it('o reset alcanca ate o campo escondido', () => {
    // Sem isto, "Redefinir para o padrao" deixaria a cor de fundo com o valor do
    // consumidor — invisivel ate ele ligar o interruptor de novo.
    const card = buildFormattingModel(SPEC, {}).cards[0] as powerbi.visuals.FormattingCard;
    expect(card.revertToDefaultDescriptors?.map((d) => d.propertyName)).toContain('background');
  });

  it('no sem slice visivel nao vira card', () => {
    const escondido: FormattingSpec = [
      {
        id: 'text-2',
        title: 'Nada visivel',
        values: { showBackground: false, background: '#ffffff' },
        fields: [
          {
            key: 'background',
            label: 'Cor de fundo',
            kind: 'color',
            showWhen: { key: 'showBackground', equals: 'true' },
          },
        ],
      },
    ];
    expect(buildFormattingModel(escondido, {}).cards).toHaveLength(0);
  });

  it('sem nada publicado, o painel nao tem card nenhum', () => {
    expect(buildFormattingModel([], {}).cards).toEqual([]);
  });
});

/**
 * As secoes dentro do card (spec 5.2.0).
 *
 * Nasceram com o KPI Card: vinte e sete controles num card so sao um paredao, e
 * `groups[]` existe na API do host exatamente para isso. Ate a 5.1.0 emitiamos
 * sempre UM grupo, com `displayName: ''`.
 */
describe('secoes dentro do card', () => {
  /** Um no com campos em duas secoes, mais um campo sem secao nenhuma. */
  const AGRUPADO: FormattingSpec = [
    {
      id: 'kpi-1',
      title: 'Receita',
      values: { polarity: 'higher', valueColor: '#1e231c', labelColor: '#656b60', gap: 4 },
      fields: [
        { key: 'gap', label: 'Espaco entre linhas', kind: 'length', min: 0, max: 200 },
        { key: 'polarity', label: 'Sentido', kind: 'select', group: 'Dados', options: [
          { value: 'higher', label: 'Subir e melhor' },
          { value: 'lower', label: 'Cair e melhor' },
        ] },
        { key: 'valueColor', label: 'Cor', kind: 'color', group: 'Valor' },
        { key: 'labelColor', label: 'Cor', kind: 'color', group: 'Rotulo' },
      ],
    },
  ];

  const groupsOf = (spec: FormattingSpec) => {
    const card = buildFormattingModel(spec, {}).cards[0] as powerbi.visuals.FormattingCard;
    return card.groups as powerbi.visuals.FormattingGroup[];
  };

  it('um grupo por secao, na ordem do descritor', () => {
    // A ordem e a da PRIMEIRA aparicao de cada secao nos campos — nao alfabetica,
    // que poria "Dados" depois de nada e "Valor" antes de "Rotulo".
    expect(groupsOf(AGRUPADO).map((group) => group.displayName)).toEqual([
      '',
      'Dados',
      'Valor',
      'Rotulo',
    ]);
  });

  it('o campo sem secao cai no bloco inicial, sem titulo', () => {
    const [primeiro] = groupsOf(AGRUPADO);
    expect(primeiro?.displayName).toBe('');
    expect(primeiro?.suppressDisplayName).toBe(true);
    expect(primeiro?.slices).toHaveLength(1);
  });

  it('a secao nomeada MOSTRA o titulo — e a razao de existir', () => {
    const dados = groupsOf(AGRUPADO).find((group) => group.displayName === 'Dados');
    expect(dados?.suppressDisplayName).toBe(false);
    expect(dados?.slices).toHaveLength(1);
  });

  it('um no SEM secao nenhuma gera o mesmo card de antes da 5.2.0', () => {
    // A garantia de que `container` e `text` nao mudaram: um grupo so, sem
    // titulo, com o `uid` de sempre. E o que mantem o pacote de um projeto que
    // so compoe texto identico ao que o Sprint B entregou.
    const groups = groupsOf(SPEC);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.uid).toBe('text-1-group');
    expect(groups[0]?.displayName).toBe('');
    expect(groups[0]?.suppressDisplayName).toBe(true);
  });

  it('o reset continua alcancando todo campo publicado, em qualquer secao', () => {
    const card = buildFormattingModel(AGRUPADO, {}).cards[0] as powerbi.visuals.FormattingCard;
    expect(card.revertToDefaultDescriptors?.map((d) => d.propertyName)).toEqual([
      'gap',
      'polarity',
      'valueColor',
      'labelColor',
    ]);
  });

  it('secao que fica sem slice visivel nao vira grupo vazio', () => {
    // Um grupo com cabecalho e nada embaixo parece um painel quebrado.
    const comEscondido: FormattingSpec = [
      {
        id: 'kpi-2',
        title: 'Custo',
        values: { showRule: false, borderColor: '#d3d7cd', valueColor: '#1e231c' },
        fields: [
          { key: 'valueColor', label: 'Cor', kind: 'color', group: 'Valor' },
          {
            key: 'borderColor',
            label: 'Cor do fio',
            kind: 'color',
            group: 'Variacao',
            showWhen: { key: 'showRule', equals: 'true' },
          },
        ],
      },
    ];

    expect(groupsOf(comEscondido).map((group) => group.displayName)).toEqual(['Valor']);
  });
});
