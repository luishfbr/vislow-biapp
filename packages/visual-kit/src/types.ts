/**
 * Contrato de dados entre os hosts e os componentes.
 *
 * O visual-kit NAO conhece o Power BI. O runtime traduz `DataView` para estas
 * estruturas; o editor produz as mesmas estruturas a partir de dados mock. E
 * isso que faz o preview e o visual final serem literalmente o mesmo componente
 * (ADR-04).
 */

export interface DataPoint {
  category: string;
  value: number;
  /** Ja formatado pelo host (locale + format da medida). Ver RF-17. */
  formattedValue: string;
  selected: boolean;
}

export interface KpiComparison {
  formattedValue: string;
  /** Variacao relativa ao alvo. Positivo = acima. */
  deltaRatio: number;
  formattedDelta: string;
}

export interface KpiDatum {
  formattedValue: string;
  label: string;
  comparison?: KpiComparison;
}

/**
 * Paleta de alto contraste do Power BI (RF-21). Quando presente, SOBREPOE as
 * cores da config — o modo de alto contraste existe para acessibilidade e nao
 * pode ser sobrescrito por escolha estetica do usuario.
 */
export interface HighContrastPalette {
  foreground: string;
  background: string;
  foregroundSelected: string;
}

export interface RenderContext {
  highContrast?: HighContrastPalette;
  /** Handler de selecao. Ausente no preview do editor. */
  onSelect?: (index: number, multi: boolean) => void;
  /** Tooltip nativo do host. Ausente no preview. */
  onHover?: (index: number, event: { x: number; y: number }) => void;
  onHoverEnd?: () => void;
}
