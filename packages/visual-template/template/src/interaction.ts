/**
 * A ponte entre os servicos do host e os nos do `visual-kit`. ESTATICO:
 * identico em todo visual gerado.
 *
 * Aqui moram as seis capacidades que o pivo da ADR-08 deixou para tras
 * (achado 53) e que o Sprint 6 devolveu:
 *
 *   RF-18 cross-filter · RF-19 tooltip nativo · RF-21 alto contraste
 *   RF-23 teclado · RF-24 menu de contexto · RF-25 aviso de truncamento
 *
 * Por que uma classe, e nao funcoes soltas: selecao tem ESTADO (o que esta
 * selecionado agora, inclusive por acao de outro visual) e esse estado precisa
 * sobreviver entre `update`s. Guardar isso no `visual.tsx` gerado espalharia
 * codigo identico por todo pacote compilado — e a fronteira do template existe
 * justamente para o contrario.
 *
 * A classe IMPLEMENTA `FrameHost`, o contrato que o kit define. E ela que viaja
 * dentro do quadro ate os nos, sem virar prop de descritor e sem hook nenhum
 * (achado 39).
 */
import type powerbi from 'powerbi-visuals-api';
import { HC_VARS } from '@vislow/visual-kit';
import {
  EMPTY_FRAME,
  type DataFrame,
  type FrameHost,
  type HighContrastPalette,
  type ScreenPoint,
} from '@vislow/visual-kit/nodes';
import { matchRoles, readDataFrame, truncationOf, type MatchedColumn } from './dataFrame';

type ISelectionId = powerbi.extensibility.ISelectionId;
type ISelectionManager = powerbi.extensibility.ISelectionManager;
type IVisualHost = powerbi.extensibility.visual.IVisualHost;
type VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
type VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;

/**
 * Dois selection ids sao o mesmo?
 *
 * O `equals` faz parte do contrato do host e e o caminho certo. A comparacao
 * por JSON e a rede de seguranca: `getSelectionIds()` ja devolveu objetos
 * simples em versoes antigas do host e num host de teste, e um `undefined` aqui
 * apagaria o esmaecimento inteiro sem erro nenhum.
 */
function sameIdentity(a: ISelectionId, b: ISelectionId): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const equals = (a as { equals?: (other: ISelectionId) => boolean }).equals;
  if (typeof equals === 'function') return equals.call(a, b) === true;
  return JSON.stringify(a) === JSON.stringify(b);
}

export class Interaction implements FrameHost {
  /**
   * Discriminante STRING (nunca booleano): a toolchain do `pbiviz` compila sem
   * `strictNullChecks` e o TypeScript nao estreita uniao por booleano.
   * E por ele que os nos sabem que ha um host de verdade e trocam o balao do
   * Recharts pelo tooltip nativo.
   */
  public readonly kind: 'host' = 'host';

  private readonly host: IVisualHost;
  private readonly element: HTMLElement;
  private readonly selectionManager: ISelectionManager;
  private readonly onChange: () => void;

  /** Selection id por papel de agrupamento, na ordem das linhas do quadro. */
  private identities: Record<string, ISelectionId[]> = {};
  private selected: ISelectionId[] = [];
  private frame: DataFrame = EMPTY_FRAME;

  constructor(options: VisualConstructorOptions, onChange: () => void) {
    this.host = options.host;
    this.element = options.element;
    this.selectionManager = options.host.createSelectionManager();
    this.onChange = onChange;

    // RF-24: menu de contexto nativo (drill, exportar dados, incluir/excluir).
    // Sem ele o clique com o botao direito abre o menu do navegador dentro do
    // relatorio, que e pior do que nao ter menu nenhum.
    this.element.addEventListener('contextmenu', (event: MouseEvent) => {
      this.selectionManager.showContextMenu({}, { x: event.clientX, y: event.clientY });
      event.preventDefault();
    });

    // RF-18: selecao feita em OUTRO visual tem de refletir aqui. Sem isto o
    // esmaecimento so responde a cliques no proprio visual — o cross-filter
    // pareceria funcionar num sentido so.
    this.selectionManager.registerOnSelectCallback(() => {
      this.selected = this.selectionManager.getSelectionIds() as ISelectionId[];
      this.onChange();
    });
  }

  /**
   * Le o `DataView` e devolve o quadro que a arvore renderiza.
   *
   * O quadro carrega ESTE objeto como host, entao todo no da arvore alcanca
   * selecao, tooltip e alto contraste sem receber uma prop a mais.
   */
  public readFrame(options: VisualUpdateOptions, roles: string[]): DataFrame {
    const matched = matchRoles(options, roles);

    this.identities = this.buildIdentities(matched);
    this.applyHighContrast();

    const frame = readDataFrame(matched, this.host.locale);
    frame.host = this;
    frame.truncated = truncationOf(matched);
    this.frame = frame;
    return frame;
  }

  // --- FrameHost -----------------------------------------------------------

  public get hasSelection(): boolean {
    return this.selected.length > 0;
  }

  public get highContrast(): HighContrastPalette | undefined {
    const palette = this.host.colorPalette;
    if (!palette.isHighContrast) return undefined;
    return {
      foreground: palette.foreground.value,
      background: palette.background.value,
      foregroundSelected: palette.foregroundSelected.value,
    };
  }

  public isSelected(role: string, index: number): boolean {
    const identity = this.identityAt(role, index);
    if (!identity) return false;
    return this.selected.some((candidate) => sameIdentity(candidate, identity));
  }

  public select(role: string, index: number, multi: boolean): void {
    const identity = this.identityAt(role, index);
    if (!identity) return;

    void this.selectionManager.select(identity, multi).then((ids: ISelectionId[]) => {
      this.selected = ids;
      this.onChange();
    });
  }

  /**
   * RF-19 — tooltip NATIVO do Power BI, nao um balao proprio: e o que faz o
   * visual se comportar como os nativos e herdar campos de tooltip do relatorio.
   *
   * As coordenadas do `tooltipService` sao relativas ao ELEMENTO do visual;
   * passar `clientX`/`clientY` direto posiciona o balao no lugar errado sempre
   * que o visual nao esta no canto superior esquerdo do relatorio.
   */
  public showTooltip(roles: readonly string[], index: number, at: ScreenPoint): void {
    const dataItems: { displayName: string; value: string }[] = [];
    for (const role of roles) {
      const column = this.frame.roles[role];
      if (column) dataItems.push({ displayName: column.title, value: column.formatted[index] ?? '' });
    }
    if (dataItems.length === 0) return;

    const box = this.element.getBoundingClientRect();
    const identity = this.identityForRoles(roles, index);

    this.host.tooltipService.show({
      coordinates: [at.x - box.left, at.y - box.top],
      isTouchEvent: false,
      dataItems,
      // A identidade e o que permite ao relatorio acrescentar os campos de
      // tooltip que o autor configurou. Sem ela o balao mostra so o que damos.
      identities: identity ? [identity] : [],
    });
  }

  public hideTooltip(): void {
    this.host.tooltipService.hide({ immediately: false, isTouchEvent: false });
  }

  // --- interno -------------------------------------------------------------

  private identityAt(role: string, index: number): ISelectionId | undefined {
    return this.identities[role]?.[index];
  }

  private identityForRoles(roles: readonly string[], index: number): ISelectionId | undefined {
    for (const role of roles) {
      const identity = this.identityAt(role, index);
      if (identity) return identity;
    }
    return undefined;
  }

  private buildIdentities(matched: MatchedColumn[]): Record<string, ISelectionId[]> {
    const out: Record<string, ISelectionId[]> = {};
    for (const column of matched) {
      const category = column.category;
      if (!category) continue;
      out[column.role] = category.values.map((_value, index) =>
        this.host.createSelectionIdBuilder().withCategory(category, index).createSelectionId(),
      );
    }
    return out;
  }

  /**
   * RF-21 — alto contraste por VARIAVEL CSS no elemento raiz.
   *
   * Definida aqui, ela vence a cor escolhida em qualquer no de HTML da arvore,
   * a qualquer profundidade, sem prop nova e sem contexto (ver
   * `highContrast.ts` no kit). Os graficos, que sao SVG, leem `highContrast`
   * deste objeto — `var()` nao vale em atributo de apresentacao.
   *
   * A remocao no caminho normal nao e simetria decorativa: o usuario liga e
   * desliga o modo com o relatorio aberto, e uma variavel que ficasse presa
   * pintaria o visual inteiro de preto depois de sair do alto contraste.
   */
  private applyHighContrast(): void {
    const style = this.element.style;
    const palette = this.highContrast;

    if (!palette) {
      style.removeProperty(HC_VARS.ink);
      style.removeProperty(HC_VARS.surface);
      style.removeProperty(HC_VARS.accent);
      style.removeProperty(HC_VARS.line);
      style.removeProperty(HC_VARS.selected);
      style.removeProperty('background-color');
      return;
    }

    style.setProperty(HC_VARS.ink, palette.foreground);
    style.setProperty(HC_VARS.surface, palette.background);
    style.setProperty(HC_VARS.accent, palette.foreground);
    style.setProperty(HC_VARS.line, palette.foreground);
    style.setProperty(HC_VARS.selected, palette.foregroundSelected);
    style.setProperty('background-color', palette.background);
  }
}
