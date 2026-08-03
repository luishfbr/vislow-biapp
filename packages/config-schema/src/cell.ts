/**
 * Tipo de coluna da tabela de exemplo, e a conversao entre o valor GUARDADO e o
 * texto que o usuario le e digita.
 *
 * Mora aqui, e nao no `component-registry`, porque tres pacotes precisam da
 * mesma conversao e nenhum deles pode importar os outros dois: o registry
 * valida a celula, o `visual-kit` formata a coluna do preview (e e folha do
 * grafo) e o editor monta os controles da grade. `config-schema` e a unica
 * folha que os tres ja importam.
 *
 * O tipo NAO e enfeite de tela. Ele decide tres coisas de uma vez:
 *   1. como a celula e formatada no preview;
 *   2. se a coluna nasce agrupamento ou medida (`KIND_FOR_TYPE`, no registry);
 *   3. o `requiredTypes` do `capabilities.json` — o Power BI recusa arrastar
 *      uma coluna de texto para um campo que o visual declarou numerico.
 */

export const COLUMN_TYPES = [
  'text',
  'integer',
  'decimal',
  'percent',
  'currency',
  'date',
  'boolean',
] as const;

export type ColumnType = (typeof COLUMN_TYPES)[number];

/**
 * Valor de uma celula.
 *
 * `null` e a celula VAZIA, em qualquer tipo. Vazio precisa existir: a tabela
 * semente ja carrega um zero de proposito (magnitude que quebra escala de
 * grafico), e "sem valor" e um segundo caso que o layout tem de aguentar sem
 * virar `NaN` na tela.
 */
export type CellValue = string | number | boolean | null;

/** Como uma data e guardada: `YYYY-MM-DD`, o mesmo formato do `input[type=date]`. */
export const ISO_DATE_PATTERN = '^\\d{4}-\\d{2}-\\d{2}$';
const ISO_DATE_REGEX = new RegExp(ISO_DATE_PATTERN);

/** Rotulo do tipo na tela do editor. */
export const COLUMN_TYPE_LABEL: Record<ColumnType, string> = {
  text: 'Texto',
  integer: 'Número inteiro',
  decimal: 'Número decimal',
  percent: 'Percentual',
  currency: 'Moeda',
  date: 'Data',
  boolean: 'Sim/Não',
};

/** Os tipos guardados como `number`. Percentual entra: ele e fracao, nao texto. */
const NUMERIC_TYPES = new Set<ColumnType>(['integer', 'decimal', 'percent', 'currency']);

export function isNumericType(type: ColumnType): boolean {
  return NUMERIC_TYPES.has(type);
}

/**
 * O tipo aceita este valor como esta?
 *
 * E a regra que `validateSpec` aplica celula a celula. JSON Schema so consegue
 * dizer "string, numero, booleano ou nulo" — nao consegue relacionar a celula
 * com o tipo da coluna irma, e sem essa relacao um arquivo importado a mao poe
 * `"abc"` numa coluna de moeda e o grafico desenha `NaN` sem erro nenhum.
 */
export function isValidCell(value: CellValue, type: ColumnType): boolean {
  if (value === null) return true;
  if (type === 'text') return typeof value === 'string';
  if (type === 'boolean') return typeof value === 'boolean';
  if (type === 'date') return typeof value === 'string' && isRealIsoDate(value);
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  return type === 'integer' ? Number.isInteger(value) : true;
}

/**
 * Data ISO que EXISTE no calendario.
 *
 * O padrao sozinho aprova `2026-02-31`, que o `Date` aceita e rola para 3 de
 * marco — a celula validaria, e o preview mostraria um dia que o usuario nunca
 * digitou. Reconstruir a data e comparar e a forma barata de pegar isso.
 */
function isRealIsoDate(value: string): boolean {
  if (!ISO_DATE_REGEX.test(value)) return false;
  const date = utcDateOf(value);
  return date !== null && date.toISOString().slice(0, 10) === value;
}

/**
 * Data ISO em `Date` de MEIA-NOITE UTC.
 *
 * `new Date('2026-08-03')` ja produz meia-noite UTC, mas qualquer formatacao
 * sem `timeZone: 'UTC'` a joga para o fuso local — no Brasil (UTC-3) a data sai
 * um dia antes, e o usuario ve 02/08 na celula em que digitou 03/08. Por isso
 * este par (construir em UTC, formatar em UTC) anda sempre junto.
 */
function utcDateOf(value: string): Date | null {
  const [year, month, day] = value.split('-').map(Number);
  if (year === undefined || month === undefined || day === undefined) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Valor formatado para leitura — e o que alimenta `RoleColumn.formatted` no
 * preview, o mesmo campo que, no visual compilado, vem formatado pelo host.
 *
 * Celula vazia vira string vazia, e nao "null" ou "-": o eixo e o rotulo do
 * grafico ja sabem lidar com texto vazio, e qualquer marcador que inventassemos
 * aqui viraria uma categoria com nome proprio no grafico.
 */
export function formatCell(value: CellValue, type: ColumnType, locale = 'pt-BR'): string {
  if (value === null) return '';

  switch (type) {
    case 'text':
      return String(value);

    case 'boolean':
      return value ? 'Sim' : 'Não';

    case 'date': {
      const date = typeof value === 'string' ? utcDateOf(value) : null;
      if (!date) return String(value);
      return new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeZone: 'UTC' }).format(date);
    }

    case 'integer':
      return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Number(value));

    case 'decimal':
      return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(Number(value));

    case 'percent':
      return new Intl.NumberFormat(locale, {
        style: 'percent',
        maximumFractionDigits: 2,
      }).format(Number(value));

    case 'currency':
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: 'BRL',
        maximumFractionDigits: 2,
      }).format(Number(value));
  }
}

/**
 * Valor no texto que vai DENTRO do campo de edicao.
 *
 * Diferente do `formatCell` de proposito: o campo de edicao nao pode trazer
 * `R$` nem separador de milhar, senao o usuario apaga um caractere no meio e o
 * que sobra nao volta a ser numero. Aqui sai o numero cru — com virgula, que e
 * o separador decimal que ele vai digitar de volta.
 *
 * Percentual e o unico com troca de unidade: guarda-se a fracao (`0.184`, como
 * o Power BI), edita-se a unidade que se le (`18,4`).
 */
export function cellToInput(value: CellValue, type: ColumnType): string {
  if (value === null) return '';
  if (type === 'date' || type === 'text') return String(value);
  if (type === 'boolean') return value ? 'true' : 'false';

  const numeric = type === 'percent' ? Number(value) * 100 : Number(value);
  // `toFixed` nao serve: fixaria casas que o usuario nao digitou. O truncamento
  // em 10 casas mata o lixo de ponto flutuante que a multiplicacao por 100
  // produz (0.184 * 100 = 18.400000000000002).
  return String(Number(numeric.toFixed(10))).replace('.', ',');
}

/**
 * Texto digitado de volta para valor guardado. Vazio vira `null`.
 *
 * Aceita as duas convencoes de separador porque as duas chegam: `1.234,56` sai
 * do `formatCell` em pt-BR e volta por copiar e colar, e `1234.56` sai de
 * qualquer planilha em ingles. A regra e a que resolve as duas sem ambiguidade:
 * havendo virgula, ela e o decimal e todo ponto e milhar; nao havendo, um ponto
 * so e decimal e varios pontos sao milhar.
 */
export function parseCell(input: string, type: ColumnType): CellValue {
  const trimmed = input.trim();
  if (trimmed === '') return null;

  switch (type) {
    case 'text':
      return trimmed;

    case 'boolean': {
      const lowered = trimmed.toLowerCase();
      if (['true', 'sim', 's', '1', 'verdadeiro'].includes(lowered)) return true;
      if (['false', 'nao', 'não', 'n', '0', 'falso'].includes(lowered)) return false;
      return null;
    }

    case 'date':
      return isRealIsoDate(trimmed) ? trimmed : null;

    case 'integer':
    case 'decimal':
    case 'percent':
    case 'currency': {
      const numeric = parseNumber(trimmed);
      if (numeric === null) return null;
      if (type === 'percent') return roundFloat(numeric / 100);
      if (type === 'integer') return Math.round(numeric);
      return roundFloat(numeric);
    }
  }
}

function parseNumber(input: string): number | null {
  // `\s` cobre o espaco comum, o fino e o inquebravel — os tres aparecem
  // como separador de milhar, conforme o locale que produziu o texto colado.
  const cleaned = input.replace(/\s/g, '');

  const normalized = cleaned.includes(',')
    ? cleaned.replace(/\./g, '').replace(',', '.')
    : (cleaned.match(/\./g) ?? []).length > 1
      ? cleaned.replace(/\./g, '')
      : cleaned;

  const value = Number(normalized);
  return normalized !== '' && Number.isFinite(value) ? value : null;
}

/**
 * Corta o lixo de ponto flutuante da divisao por 100 (`18.4 / 100` da
 * `0.18400000000000002`). Dez casas e mais precisao do que qualquer dado de
 * exemplo precisa e menos do que o erro do `double`.
 */
function roundFloat(value: number): number {
  return Number(value.toFixed(10));
}

/**
 * Valor de uma celula quando a coluna TROCA de tipo.
 *
 * Converte quando da e devolve `null` quando nao da — perder o valor e melhor
 * do que guardar um `"abc"` numa coluna de moeda, que reprovaria a spec inteira
 * na proxima validacao e travaria o export com um erro que nao aponta para a
 * celula. Quem chama avisa o usuario antes; ver `setColumnType`.
 */
export function coerceCell(value: CellValue, to: ColumnType): CellValue {
  if (value === null) return null;
  if (isValidCell(value, to)) return value;

  // Qualquer coisa vira texto legivel — e a unica conversao que nunca perde.
  if (to === 'text') return formatCell(value, typeOf(value));

  // Numero indo para tipo numerico: `isValidCell` so recusou por ser inteiro
  // com casas, entao arredondar preserva a intencao.
  if (typeof value === 'number' && isNumericType(to)) return Math.round(value);

  if (typeof value === 'string') return parseCell(value, to);

  // Sobra numero indo para data/booleano e booleano indo para qualquer outra
  // coisa. Nao ha leitura obvia: "0 e falso, 1 e verdadeiro" seria uma
  // convencao inventada aqui e em lugar nenhum do produto.
  return null;
}

/** Tipo mais provavel de um valor solto. So serve ao `coerceCell` acima. */
function typeOf(value: CellValue): ColumnType {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'decimal';
  return 'text';
}
