/**
 * A LINGUAGEM VISUAL DO VISLOW — os valores que um componente assume quando o
 * autor ainda nao escolheu nada.
 *
 * ============================== A TESE: PAPEL, NAO TINTA =====================
 * Nenhum valor deste arquivo e cromatico. Nao ha cor de acento, nao ha azul de
 * marca, nao ha paleta de serie. Numa ferramenta de COMPOSICAO isso e uma
 * posicao, e nao uma omissao: a cor pertence ao autor do relatorio, que tem uma
 * marca e um tema de Power BI para respeitar. O que e nosso e o NEUTRO em que
 * ele poe a cor dele — e um neutro exato vale mais do que um acento chutado.
 *
 * Ate a spec 4.0.0 os defaults eram `#3b82f6`, `#1e293b` e `#e2e8f0`: o
 * slate/blue do Tailwind, escolhido por estar a mao. Todo visual gerado nascia
 * com a mesma cara de painel de SaaS.
 * =============================================================================
 *
 * ============================== POR QUE MORA AQUI ============================
 * `config-schema` e o unico pacote que TANTO o `component-registry` (que precisa
 * dos valores para os `default` dos descritores) QUANTO o `visual-kit` (que
 * precisa deles ao desenhar) ja consomem. Posto no kit, o registro nao alcanca;
 * posto no registro, o kit passaria a depender dele e deixaria de ser folha.
 *
 * O que NAO esta aqui: sombra, familia tipografica e peso. Sao escolha entre
 * alternativas, viram CLASSE, e classe mora em `visual-kit/src/styles.css` —
 * onde valores e estrutura nao se sobrepoem e por isso nao podem divergir.
 * =============================================================================
 */

/**
 * A rampa neutra. Cast levemente VERDE, e nao azul.
 *
 * O azul-acinzentado e o neutro padrao de toda ferramenta de tela, e um visual
 * desenhado nele desaparece dentro do Power BI, que ja e azul-acinzentado. O
 * cast verde le como PAPEL sob luz, que e o que um relatorio de fato vira: ele e
 * impresso, exportado em PDF e colado em apresentacao.
 *
 * `PAPER` e de proposito NAO branco. Um visual nativo do Power BI se separa da
 * tela do relatorio sendo branco com sombra; o nosso se separa por TOM. Tom
 * sobrevive a impressao e a exportacao, onde sombra some ou suja.
 */
export const INK = '#1e231c';
export const INK_MUTED = '#656b60';
export const PAPER = '#fafbf8';
export const PAPER_SUNK = '#eff1ec';
export const RULE = '#d3d7cd';

/**
 * Tamanhos de tipo por PAPEL, nao por camiseta.
 *
 * `fontSize` e pixel livre desde a spec 4.0.0 — esta escala nao restringe nada,
 * ela ANCORA: e daqui que saem os `default` dos descritores, e e a ela que se
 * volta quando a duvida e "que tamanho isto deveria ter".
 *
 * Os degraus sao irregulares de proposito. Na ponta pequena a diferenca entre 11
 * e 13 muda a leitura de uma nota de rodape; na ponta grande, 32 e 44 sao
 * decisoes de composicao. Uma razao constante daria degraus inuteis embaixo e
 * degraus grandes demais em cima.
 */
export const TYPE_SCALE = {
  /** Nota de rodape, fonte do dado, unidade. */
  caption: 11,
  /** Rotulo de campo, sobrancelha. */
  label: 13,
  /** Texto corrido. */
  body: 15,
  /** Titulo de uma caixa. */
  title: 20,
  /** A manchete de uma composicao. */
  display: 32,
  /** Um numero sozinho, que e para ser lido do outro lado da sala. */
  figure: 44,
} as const;

/**
 * Ritmo de espacamento, base 4.
 *
 * Pula degraus em cima pelo mesmo motivo da escala de tipo: entre 24 e 32 ha uma
 * decisao, entre 24 e 28 nao ha.
 */
export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

/**
 * Raio.
 *
 * `md` (4) e o default de superficie. Nao e o 8 de cartao de SaaS nem o 0 de
 * cartaz: e o raio de uma FICHA — presente o bastante para nao parecer um corte
 * acidental, discreto o bastante para nao competir com o conteudo.
 */
export const RADIUS = { none: 0, sm: 2, md: 4, lg: 8, xl: 12 } as const;

/**
 * Espessura de fio.
 *
 * `hairline` (1) e o default de superficie, e e a outra metade da separacao por
 * tom: sem sombra, o que declara a borda de um componente e o fio.
 */
export const STROKE = { none: 0, hairline: 1, thick: 2 } as const;
