/**
 * Contrato de dados entre os hosts e os componentes.
 *
 * O visual-kit NAO conhece o Power BI. O template traduz `DataView` para o
 * `DataFrame` de `nodes/frame.ts`; o editor produz o mesmo `DataFrame` a partir
 * de dados mock. E isso que faz o preview e o visual final serem literalmente o
 * mesmo componente (ADR-04).
 *
 * Este arquivo guarda so o que atravessa os dois lados sem passar pelo frame.
 */

/**
 * Paleta de alto contraste do Power BI (RF-21). Quando presente, SOBREPOE as
 * cores escolhidas — o modo de alto contraste existe para acessibilidade e nao
 * pode ser sobrescrito por escolha estetica do usuario.
 *
 * Nos nos de HTML a substituicao acontece por variavel CSS (`highContrast.ts`);
 * nos graficos, que sao SVG, ela e resolvida em JS a partir desta paleta —
 * `var()` nao funciona em atributo de apresentacao de SVG (achado 55).
 */
export interface HighContrastPalette {
  foreground: string;
  background: string;
  foregroundSelected: string;
}
