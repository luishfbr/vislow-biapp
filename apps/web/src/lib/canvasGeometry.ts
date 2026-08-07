import { RECT_MIN_SIZE, type NodeRect } from '@vislow/component-registry';

/**
 * A matematica do canvas: encaixe, arrasto, redimensionamento e teclado.
 *
 * Fora do componente de proposito. E aqui que mora a diferenca entre um canvas
 * que parece profissional e um em que nada se alinha — e nada disso precisa de
 * React para ser conferido. No componente sobra o encanamento do gesto, que
 * jsdom mal consegue exercitar; aqui ficam as regras, que se testam direto.
 *
 * Tudo em PERCENTUAL do container. Pixel entra so como MEDIDA do container
 * (`BoxPx`), para converter tolerancia e passo de tecla — ver abaixo.
 *
 * ===================== NAO EXISTE MAIS GRADE OBRIGATORIA =====================
 * Ate 2026-08-04 todo gesto era arredondado numa grade de 24x16 celulas do pai.
 * Numa prancheta de 1280x720 isso queria dizer que um componente so podia pousar
 * de 53 em 53 pixels na horizontal e de 45 em 45 na vertical: nao havia como
 * encostar uma caixa na outra, nem alinhar em 10px, e o Alt — que soltava — era
 * o inverso do que um editor de desenho faz. O valor livre passou a ser o
 * PADRAO, e o encaixe passou a ser o que ele e no Figma: uma atracao curta por
 * aresta de vizinho, que so acontece quando a caixa chega perto.
 * =============================================================================
 */

/**
 * Distancia de atracao do encaixe, em PIXEL DE TELA.
 *
 * Em pixel, e nao em percentual, porque quem julga "esta perto" e o olho, e o
 * olho mede na tela. Uma tolerancia fixa em % do pai gruda com forca diferente
 * conforme o tamanho do container — num container estreito, 2% e um fio; num
 * largo, e meio dedo. Seis pixels e a folga que o cursor tem sem esforco.
 */
export const SNAP_PX = 6;

/** Passo da seta, em pixel da prancheta. Shift multiplica. */
export const KEY_STEP_PX = 1;
export const KEY_STEP_COARSE_PX = 10;

/**
 * Tolerancia usada quando o tamanho do container ainda nao foi medido.
 *
 * Nao e zero de proposito: sem medida, "encaixe desligado" seria uma degradacao
 * silenciosa, e o usuario descobriria pela composicao desalinhada. Um valor
 * conservador mantem a funcao viva ate a primeira medicao chegar.
 */
const FALLBACK_TOLERANCE = 1;

/** Tamanho do container em pixel. E o unico pixel que este modulo enxerga. */
export interface BoxPx {
  width: number;
  height: number;
}

export interface PlacedChild {
  id: string;
  rect: NodeRect;
}

export type HandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

/** Linha de alinhamento a desenhar durante o gesto. */
export interface Guide {
  axis: 'x' | 'y';
  at: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Converte uma distancia em pixel para percentual do container, num eixo.
 *
 * Container de tamanho desconhecido ou zerado devolve o fallback: dividir por
 * zero produziria `Infinity`, e uma tolerancia infinita gruda a caixa na
 * primeira aresta que existir e nunca mais a solta.
 */
export function percentPerPx(box: BoxPx | undefined, axis: 'x' | 'y'): number | undefined {
  const size = axis === 'x' ? box?.width : box?.height;
  if (size === undefined || size <= 0) return undefined;
  return 100 / size;
}

function toleranceOf(box: BoxPx | undefined, axis: 'x' | 'y'): number {
  const perPx = percentPerPx(box, axis);
  return perPx === undefined ? FALLBACK_TOLERANCE : SNAP_PX * perPx;
}

/**
 * Arestas de encaixe num eixo: as do container e as dos irmaos.
 *
 * Inclui o CENTRO de cada irmao, alem das bordas. Centralizar um titulo sobre um
 * grafico e o alinhamento que mais aparece numa composicao, e sem o centro na
 * lista ele so sairia certo por sorte.
 */
export function edgesOf(
  children: readonly PlacedChild[],
  skip: ReadonlySet<string>,
  axis: 'x' | 'y',
): number[] {
  const edges = [0, 50, 100];
  for (const child of children) {
    // TODOS os que se movem saem, e nao so o que esta sob o ponteiro: num arrasto
    // de grupo, deixar os companheiros na lista os transforma em candidatos de
    // encaixe do proprio grupo, e a caixa envolvente gruda na parte dela mesma.
    if (skip.has(child.id)) continue;
    const start = axis === 'x' ? child.rect.x : child.rect.y;
    const size = axis === 'x' ? child.rect.w : child.rect.h;
    edges.push(start, start + size, start + size / 2);
  }
  return edges;
}

/**
 * A caixa que envolve todas as caixas dadas.
 *
 * Devolve `null` para a lista vazia em vez de uma caixa em zero: "nao ha o que
 * envolver" e "envolve nada no canto superior esquerdo" sao coisas diferentes, e
 * a segunda desenharia uma moldura fantasma na origem.
 */
export function unionRect(rects: readonly NodeRect[]): NodeRect | null {
  const first = rects[0];
  if (!first) return null;

  let left = first.x;
  let top = first.y;
  let right = first.x + first.w;
  let bottom = first.y + first.h;

  for (const rect of rects) {
    left = Math.min(left, rect.x);
    top = Math.min(top, rect.y);
    right = Math.max(right, rect.x + rect.w);
    bottom = Math.max(bottom, rect.y + rect.h);
  }

  return { x: round2(left), y: round2(top), w: round2(right - left), h: round2(bottom - top) };
}


/** Retangulo em pixel de tela. O marquee e o unico lugar do modulo que fala tela. */
export interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Quem a banda do marquee captura.
 *
 * Por INTERSECCAO, e nao por continencia: basta a banda cruzar qualquer parte do
 * no. Exigir envolvimento total num canvas cujas caixas nascem com 40% x 30% da
 * prancheta obrigaria a arrastar quase a prancheta inteira para pegar dois
 * componentes.
 *
 * Em PIXEL DE TELA nos dois lados, de proposito: as caixas dos nos sao lidas do
 * DOM ja transformadas pela camera, e a banda vem do ponteiro. Convertidas para
 * a mesma unidade sem ninguem converter nada, o zoom e o deslocamento se
 * cancelam sozinhos.
 */
export function marqueeHits(
  boxes: readonly { id: string; box: ScreenRect }[],
  band: ScreenRect,
): string[] {
  return boxes
    .filter(
      ({ box }) =>
        box.left < band.right &&
        box.right > band.left &&
        box.top < band.bottom &&
        box.bottom > band.top,
    )
    .map(({ id }) => id);
}

/** Normaliza dois pontos de tela numa banda, em qualquer direcao de arrasto. */
export function bandOf(
  from: { x: number; y: number },
  to: { x: number; y: number },
): ScreenRect {
  return {
    left: Math.min(from.x, to.x),
    top: Math.min(from.y, to.y),
    right: Math.max(from.x, to.x),
    bottom: Math.max(from.y, to.y),
  };
}

/**
 * Atrai um valor para a aresta mais proxima, se houver uma dentro da tolerancia.
 *
 * Fora da tolerancia o valor passa INTACTO — e essa a diferenca em relacao ao
 * modelo anterior, em que ele era arredondado numa celula de grade. Todo encaixe
 * produz guia agora, porque todo encaixe passou a ser um alinhamento com algo
 * que existe na tela: nao ha mais o caso silencioso da grade.
 */
export function snapValue(
  value: number,
  tolerance: number,
  candidates: readonly number[],
): { value: number; guide: number | undefined } {
  let best: number | undefined;
  let bestDistance = tolerance;

  for (const candidate of candidates) {
    const distance = Math.abs(candidate - value);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }

  return best === undefined ? { value, guide: undefined } : { value: best, guide: best };
}

/**
 * Aplica o deslocamento de um gesto a caixa de origem.
 *
 * Sempre a partir da caixa do INICIO do gesto, nunca acumulando sobre a anterior:
 * acumular soma o erro de arredondamento a cada evento de ponteiro, e um arrasto
 * longo termina longe de onde o cursor esta.
 */
export function applyGesture({
  from,
  handle,
  deltaX,
  deltaY,
  siblings,
  skip,
  freeform,
  axisLock = false,
  proportional = false,
  boxPx,
}: {
  from: NodeRect;
  handle: HandleId | 'move';
  deltaX: number;
  deltaY: number;
  siblings: readonly PlacedChild[];
  /** Quem NAO entra como candidato de encaixe: o proprio sujeito do gesto. */
  skip: ReadonlySet<string>;
  /** Ctrl/Cmd pressionado: solta do encaixe. */
  freeform: boolean;
  /** Shift ao MOVER: tranca no eixo em que o gesto ja andou mais. */
  axisLock?: boolean;
  /** Shift ao REDIMENSIONAR: preserva a proporcao original. */
  proportional?: boolean;
  /** Caixa do container, para converter a tolerancia de pixel para %. */
  boxPx?: BoxPx | undefined;
}): { rect: NodeRect; guides: Guide[] } {
  const guides: Guide[] = [];
  const xEdges = freeform ? [] : edgesOf(siblings, skip, 'x');
  const yEdges = freeform ? [] : edgesOf(siblings, skip, 'y');

  const fit = (value: number, axis: 'x' | 'y'): number => {
    if (freeform) return value;
    const snapped = snapValue(
      value,
      toleranceOf(boxPx, axis),
      axis === 'x' ? xEdges : yEdges,
    );
    if (snapped.guide !== undefined) guides.push({ axis, at: snapped.guide });
    return snapped.value;
  };

  if (handle === 'move') {
    // O eixo trancado e o que ja andou mais quando o Shift entrou. Decidir pelo
    // maior deslocamento, e nao pelo primeiro movimento, deixa o usuario
    // corrigir a direcao sem soltar o botao.
    const dx = axisLock && Math.abs(deltaX) < Math.abs(deltaY) ? 0 : deltaX;
    const dy = axisLock && Math.abs(deltaY) <= Math.abs(deltaX) ? 0 : deltaY;

    return {
      rect: {
        x: round2(clamp(fit(from.x + dx, 'x'), 0, 100 - from.w)),
        y: round2(clamp(fit(from.y + dy, 'y'), 0, 100 - from.h)),
        w: from.w,
        h: from.h,
      },
      guides,
    };
  }

  let { x, y, w, h } = from;
  const right = from.x + from.w;
  const bottom = from.y + from.h;

  const movesW = handle.includes('w');
  const movesE = handle.includes('e');
  const movesN = handle.includes('n');
  const movesS = handle.includes('s');

  // Cada borda e presa contra a OPOSTA, e nao contra o container: sem isso,
  // arrastar a alca esquerda para alem da direita inverte a caixa e o no
  // desaparece — largura negativa nao desenha nada, e sem erro nenhum.
  if (movesW) {
    x = clamp(fit(from.x + deltaX, 'x'), 0, right - RECT_MIN_SIZE);
    w = right - x;
  }
  if (movesE) {
    w = clamp(fit(right + deltaX, 'x'), from.x + RECT_MIN_SIZE, 100) - from.x;
  }
  if (movesN) {
    y = clamp(fit(from.y + deltaY, 'y'), 0, bottom - RECT_MIN_SIZE);
    h = bottom - y;
  }
  if (movesS) {
    h = clamp(fit(bottom + deltaY, 'y'), from.y + RECT_MIN_SIZE, 100) - from.y;
  }

  if (proportional && from.w > 0 && from.h > 0) {
    const ratio = from.w / from.h;
    // Quem manda e o eixo que mudou MAIS em proporcao. Pela diferenca absoluta,
    // um retangulo largo e baixo seria sempre governado pela largura, e o Shift
    // pareceria ignorar a alca de baixo.
    const changedX = Math.abs(w / from.w - 1);
    const changedY = Math.abs(h / from.h - 1);
    const driveByX = (movesW || movesE) && (!(movesN || movesS) || changedX >= changedY);

    if (driveByX) h = w / ratio;
    else w = h * ratio;

    // Reancorar: a borda OPOSTA a que esta sendo arrastada nao pode andar.
    if (movesW) x = right - w;
    if (movesN) y = bottom - h;
  }

  // Fecho unico, e nao por ramo: a proporcao acima deriva uma dimensao que
  // nenhum `clamp` do ramo tocou, e sem este fecho ela sai do container.
  w = clamp(w, RECT_MIN_SIZE, 100);
  h = clamp(h, RECT_MIN_SIZE, 100);
  x = clamp(x, 0, 100 - w);
  y = clamp(y, 0, 100 - h);

  return { rect: { x: round2(x), y: round2(y), w: round2(w), h: round2(h) }, guides };
}

/**
 * Desloca VARIOS nos por um unico delta.
 *
 * O sujeito do encaixe e a CAIXA ENVOLVENTE, e nao cada no: com N sujeitos, cada
 * um encontraria a sua propria aresta mais proxima e o grupo se deformaria — o
 * que o usuario arrastou como um bloco chegaria espalhado. Pelo mesmo motivo o
 * `clamp` prende a uniao, e nao cada caixa: preso um a um, o primeiro no a
 * encostar na borda pararia enquanto os outros continuariam andando.
 *
 * Devolve o DELTA, e nao as caixas. Quem soma e o chamador, sempre sobre as
 * caixas do inicio do gesto — acumular sobre a posicao anterior soma o erro de
 * arredondamento a cada evento de ponteiro.
 */
export function applyGroupMove({
  union,
  deltaX,
  deltaY,
  siblings,
  movingIds,
  freeform,
  axisLock = false,
  boxPx,
}: {
  union: NodeRect;
  deltaX: number;
  deltaY: number;
  siblings: readonly PlacedChild[];
  movingIds: ReadonlySet<string>;
  freeform: boolean;
  axisLock?: boolean;
  boxPx?: BoxPx | undefined;
}): { delta: { dx: number; dy: number }; guides: Guide[] } {
  const resolved = applyGesture({
    from: union,
    handle: 'move',
    deltaX,
    deltaY,
    siblings,
    skip: movingIds,
    freeform,
    axisLock,
    boxPx,
  });

  // Arredondado como toda caixa deste modulo: os dois lados da subtracao ja tem
  // duas casas, e a diferenca crua sai com o lixo binario de sempre
  // (`10.3 - 10 = 0.30000000000000071`). Sem isto o lixo entra em CADA caixa do
  // bloco, e um bloco de tres nos acumula tres versoes dele.
  return {
    delta: { dx: round2(resolved.rect.x - union.x), dy: round2(resolved.rect.y - union.y) },
    guides: resolved.guides,
  };
}

/**
 * Move ou redimensiona pelo teclado.
 *
 * Nao e alternativa de cortesia: um editor em que so o mouse posiciona exclui do
 * produto inteiro quem nao usa mouse. E o passo em pixel e mais exato que o
 * arrasto, entao acaba sendo o caminho de quem quer precisao.
 *
 * O passo e em PIXEL da prancheta, convertido para % pelo tamanho do container —
 * "uma seta anda um pixel" e uma promessa que o usuario consegue conferir; "uma
 * seta anda 4,17% do pai" nao e promessa nenhuma.
 */
export function byKeyboard(
  rect: NodeRect,
  key: string,
  options: { coarse: boolean; resizing: boolean; boxPx?: BoxPx | undefined },
): NodeRect | null {
  const px = options.coarse ? KEY_STEP_COARSE_PX : KEY_STEP_PX;
  // Sem medida, o passo cai para meio ponto percentual: pequeno o bastante para
  // ser ajuste fino em qualquer container plausivel, e nunca zero — uma seta que
  // nao anda nada e indistinguivel de um atalho quebrado.
  const stepX = px * (percentPerPx(options.boxPx, 'x') ?? 0.5);
  const stepY = px * (percentPerPx(options.boxPx, 'y') ?? 0.5);

  const dx = key === 'ArrowLeft' ? -stepX : key === 'ArrowRight' ? stepX : 0;
  const dy = key === 'ArrowUp' ? -stepY : key === 'ArrowDown' ? stepY : 0;
  if (dx === 0 && dy === 0) return null;

  if (options.resizing) {
    return {
      x: rect.x,
      y: rect.y,
      w: round2(clamp(rect.w + dx, RECT_MIN_SIZE, 100 - rect.x)),
      h: round2(clamp(rect.h + dy, RECT_MIN_SIZE, 100 - rect.y)),
    };
  }

  return {
    x: round2(clamp(rect.x + dx, 0, 100 - rect.w)),
    y: round2(clamp(rect.y + dy, 0, 100 - rect.h)),
    w: rect.w,
    h: rect.h,
  };
}
