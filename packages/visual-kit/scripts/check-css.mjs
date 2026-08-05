/**
 * Guarda do ADR-02: o CSS pre-compilado e a UNICA fonte de estilo do visual.
 *
 * PORQUE ISTO EXISTE. Uma classe construida por interpolacao some do CSS sem
 * erro nenhum: o CLI do Tailwind so enxerga o fonte do `visual-kit`, nao a spec
 * do usuario, e o que ele nao reconhece ele simplesmente nao gera. O resultado e
 * um visual sem estilo dentro do Power BI, e nada na saida do build reclama.
 *
 * E gate, nao teste — o mesmo principio do `inspectPbiviz` (ADR-11): build que
 * produz artefato quebrado tem de FALHAR, e nao produzir confiando que alguem
 * inspecione depois. Por isso roda dentro do `build`, e nao so na CI.
 *
 * ATENCAO AO ESCAPE. As classes aparecem escapadas no arquivo — o texto e
 * literalmente `.pbi\:p-4{...}`, com a barra invertida. Procurar `pbi:p-4` nao
 * casa nada, e a checagem passaria vazia.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CSS = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'styles.css');

/**
 * ESTE ARQUIVO E ESCANEADO PELO TAILWIND. Nao escreva um nome de classe inteiro
 * aqui.
 *
 * A deteccao automatica de conteudo do v4 varre o pacote, e nao apenas o
 * `@source` declarado no CSS. Enquanto a lista abaixo continha as classes por
 * extenso, o proprio arquivo servia de fonte: o Tailwind lia `pbi:p-4` DAQUI e
 * gerava a regra, entao a guarda passava mesmo com o `tokens.ts` inteiro
 * quebrado. Uma guarda que nao tem como falhar nao e guarda — descoberto
 * tentando quebra-la de proposito, que ate hoje ninguem tinha feito.
 *
 * Por isso o prefixo e a utilidade viajam separados e so se juntam em runtime.
 * `p-4` sozinho nao gera `pbi:p-4` (o prefixo e obrigatorio no candidato), e
 * `pbi\:` sozinho nao e utilidade nenhuma.
 *
 * Escolha utilidades com UMA origem no fonte. `absolute`, por exemplo, nao serve
 * para conferir o `CanvasSlot`: a sobreposicao de teclado dos graficos tambem a
 * produz, e a regra sobreviveria a perda dela no slot.
 *
 * A LISTA MUDOU NA SPEC 4.0.0. Ela conferia raio, tamanho de fonte e
 * espacamento, que eram mapas de token — na 4.0.0 essas tres viraram medida
 * livre em pixel, aplicada por `style`, e nao existe mais classe para conferir.
 * As que ficaram cobrem uma origem cada, e juntas cobrem todo mapa restante:
 *
 *   flex-row        -> DIRECTION_CLASS
 *   text-right      -> ALIGN_CLASS
 *   font-medium     -> FONT_WEIGHT_CLASS
 *   shadow-sm       -> SHADOW_CLASS
 *   overflow-hidden -> CanvasSlot
 *   p-4             -> states.tsx (a moldura dos estados vazio e de erro)
 */
const PREFIX = 'pbi\\:';
const UTILITIES = [
  'flex-row',
  'text-right',
  'font-medium',
  'shadow-sm',
  'overflow-hidden',
  'p-4',
];
const REQUIRED = UTILITIES.map((utility) => PREFIX + utility);

/**
 * O preflight do Tailwind reseta `html`/`body` globais — dentro do Power BI isso
 * vazaria para o relatorio inteiro, nao so para o visual. A ancora e o fim da
 * regra anterior, e nao o inicio da linha: o CSS sai minificado numa linha so.
 */
const PREFLIGHT = /(^|[{}])\s*(html|body)\s*\{/;

const css = await readFile(CSS, 'utf8');

if (css.trim() === '') {
  throw new Error('dist/styles.css vazio. O CLI do Tailwind rodou sem encontrar fonte?');
}

const missing = REQUIRED.filter((cls) => !css.includes(cls));
if (missing.length > 0) {
  throw new Error(
    `classes ausentes no CSS: ${missing.join(', ')}. ` +
      'Provavel classe construida por interpolacao, em src/tokens.ts ou num componente — ' +
      'o Tailwind so gera o que consegue ler como string literal completa.',
  );
}

if (PREFLIGHT.test(css)) {
  throw new Error('preflight vazou para o CSS do runtime: ha regra global de html/body.');
}

console.log(`CSS verificado: ${css.length} bytes, ${REQUIRED.length} classes conferidas.`);
