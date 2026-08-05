/**
 * Contraste WCAG a partir de `oklch`, sem React e sem DOM.
 *
 * Existe por causa do achado 60: a rampa anterior reprovava em contraste nos dois
 * papeis mais visiveis do produto e ninguem percebeu, porque conferir cor era
 * trabalho de olho. Aqui vira aritmetica, e `tokens.contrast.test.ts` a aplica
 * sobre o `globals.css` de verdade.
 *
 * O navegador tem `color-mix` e `oklch()` nativos, mas o teste roda em Node: a
 * conversao precisa existir em codigo. As matrizes sao as da especificacao do
 * Oklab (Bjorn Ottosson) e as da sRGB.
 */

/** Componentes sRGB nao lineares, cada um de 0 a 1. */
export type Rgb = readonly [number, number, number];

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * `oklch(L C H)` para sRGB. `lightness` de 0 a 1, `chroma` absoluto, `hue` em
 * graus. O resultado e GRAMPEADO em cada canal: uma cor fora do gamut sRGB nao
 * tem representacao, e grampear e o que o navegador tambem faz.
 */
export function oklchToRgb(lightness: number, chroma: number, hue: number): Rgb {
  const radians = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(radians);
  const b = chroma * Math.sin(radians);

  const lRoot = lightness + 0.3963377774 * a + 0.2158037573 * b;
  const mRoot = lightness - 0.1055613458 * a - 0.0638541728 * b;
  const sRoot = lightness - 0.0894841775 * a - 1.291485548 * b;

  const l = lRoot ** 3;
  const m = mRoot ** 3;
  const s = sRoot ** 3;

  const linear: Rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];

  const encode = (channel: number): number =>
    clamp01(channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055);

  return [encode(linear[0]), encode(linear[1]), encode(linear[2])];
}

/**
 * Le a forma que o Tailwind v4 escreve: `oklch(96.7% 0.001 286.375)`. O matiz
 * pode ser `none` — e o que o v4 emite para cinza puro (`zinc-50`), onde o angulo
 * nao tem significado. Sem esse caso o `zinc-50` viraria `NaN` e o teste passaria
 * comparando com `NaN`, que e o pior desfecho possivel para uma guarda.
 */
export function parseOklch(declaration: string): Rgb {
  const match = /oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+(none|[\d.]+)\s*\)/.exec(declaration);
  if (!match) {
    throw new Error(`nao e uma cor oklch: ${declaration}`);
  }
  const [, rawLightness, percent, rawChroma, rawHue] = match;
  const lightness = Number(rawLightness) / (percent === '%' ? 100 : 1);
  const hue = rawHue === 'none' ? 0 : Number(rawHue);
  return oklchToRgb(lightness, Number(rawChroma), hue);
}

/** Luminancia relativa da WCAG 2.x. */
export function relativeLuminance([r, g, b]: Rgb): number {
  const linearize = (channel: number): number =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/** Razao de contraste da WCAG 2.x, de 1 a 21. A ordem dos argumentos nao importa. */
export function contrastRatio(first: Rgb, second: Rgb): number {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * Extrai `--token: <valor>` de um bloco CSS. Recebe o corpo do bloco, nao o
 * arquivo inteiro — quem separa `:root` de `.dark` e quem chama.
 */
export function readCustomProperties(block: string): Map<string, string> {
  const found = new Map<string, string>();
  const pattern = /(--[\w-]+)\s*:\s*([^;]+);/g;
  let match = pattern.exec(block);
  while (match !== null) {
    const [, name, value] = match;
    if (name !== undefined && value !== undefined) {
      found.set(name, value.trim());
    }
    match = pattern.exec(block);
  }
  return found;
}
