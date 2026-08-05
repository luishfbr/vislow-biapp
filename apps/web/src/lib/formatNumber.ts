/**
 * Formatacao de numero e de data do editor, sem React.
 *
 * Existe por causa do achado 62: ate 2026-08-04 o editor nao usava `Intl` em
 * lugar nenhum. `toFixed` escreve o separador decimal do CODIGO, nao o do leitor,
 * entao a interface — que e toda em portugues — dizia "221.1 KB" para quem
 * escreve "221,1". Formato fixo em codigo tambem e anti-padrao declarado nas Web
 * Interface Guidelines.
 *
 * O locale NAO e lido do navegador. A interface e pt-BR por inteiro: deixar o
 * numero seguir o SO produziria uma tela metade em portugues com pontuacao
 * inglesa, que e pior do que qualquer uma das duas coisas coerentes. Quando o
 * editor for traduzido, este arquivo e o unico ponto a mudar.
 *
 * Os formatadores sao construidos UMA vez no modulo. `new Intl.NumberFormat` e
 * caro e estes rodam dentro de render — o do tempo decorrido, a cada tique da
 * barra de progresso.
 */

const LOCALE = 'pt-BR';

const inteiro = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });

const umaCasa = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const horaCurta = new Intl.DateTimeFormat(LOCALE, {
  hour: '2-digit',
  minute: '2-digit',
});

/**
 * O espaco antes da unidade e INSECAVEL em todas as funcoes daqui: o
 * numero e a unidade sao uma coisa so, e a quebra entre eles no fim de uma linha
 * estreita deixaria um "221" orfao numa linha e "KB" na seguinte.
 *
 * Escrito como escape, e nao como o caractere: U+00A0 e indistinguivel de um
 * espaco comum no editor, e o `no-irregular-whitespace` do ESLint reprova o
 * literal justamente porque ele passa despercebido na revisao.
 */
const NBSP = '\u00a0';

/** Tamanho de arquivo em KB, sem casa decimal — a precisao nao muda decisao nenhuma. */
export function formatKilobytes(bytes: number): string {
  return `${inteiro.format(bytes / 1024)}${NBSP}KB`;
}

/**
 * Segundos decorridos. Uma casa decimal ate 10 s, nenhuma depois: abaixo de 10 o
 * decimo e a unica coisa que se mexe e a barra pareceria travada sem ele; acima,
 * ele so pisca.
 */
export function formatSeconds(ms: number): string {
  const segundos = ms / 1000;
  const texto = ms < 10_000 ? umaCasa.format(segundos) : inteiro.format(segundos);
  return `${texto}${NBSP}s`;
}

/** Hora do relogio, para "exportado as 14:32". */
export function formatClockTime(date: Date): string {
  return horaCurta.format(date);
}
