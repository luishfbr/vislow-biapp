import type { Shadow } from '@vislow/config-schema';
import type { ReactNode } from 'react';
import { DIRECTION_CLASS, SHADOW_CLASS, cx, px } from '../tokens.js';
import { hcLine, hcSurface } from '../highContrast.js';

/**
 * O unico no que aceita filhos. E o esqueleto de toda composicao.
 *
 * As props tem os MESMOS nomes dos `key` dos campos do descritor
 * (`registry.ts`), porque o codegen repassa o objeto `props` da spec direto para
 * o componente. Renomear um lado sem o outro quebra em tempo de compilacao do
 * visual gerado, que e onde queremos que quebre.
 */
export function Container({
  placement,
  direction,
  gap,
  padding,
  radius,
  borderWidth,
  shadow,
  background,
  borderColor,
  children,
}: {
  /**
   * `stack` divide o espaco sozinho; `canvas` da a cada filho a sua caixa.
   *
   * Em `canvas` o container vira o BLOCO DE CONTENCAO dos filhos — e por isso
   * que ele troca `flex` por `relative`, e nao apenas acrescenta. Com os dois, o
   * filho absoluto sairia da cadeia de flex e o `gap` continuaria reservando
   * espaco para itens que ja nao estao nela.
   */
  placement: 'stack' | 'canvas';
  direction: 'row' | 'column';
  /** Todas as medidas em PIXEL. Vao por `style`, nunca por classe. */
  gap: number;
  padding: number;
  radius: number;
  borderWidth: number;
  shadow: Shadow;
  background: string;
  borderColor: string;
  children?: ReactNode;
}) {
  const free = placement === 'canvas';
  const width = px(borderWidth);

  return (
    <div
      // `min-h-0`/`min-w-0` nao sao decorativos: sem eles um filho flexivel nunca
      // encolhe abaixo do proprio conteudo, e o ResponsiveContainer do Recharts
      // mede altura zero — grafico invisivel, sem erro nenhum.
      className={cx(
        'pbi:flex-1',
        'pbi:min-h-0',
        'pbi:min-w-0',
        free ? 'pbi:relative' : 'pbi:flex',
        !free && DIRECTION_CLASS[direction],
        SHADOW_CLASS[shadow],
      )}
      style={{
        // RF-21: em alto contraste a paleta do host sobrepoe a cor escolhida. A
        // variavel e definida no elemento raiz do visual — ver `highContrast.ts`.
        backgroundColor: hcSurface(background),
        borderColor: hcLine(borderColor),
        padding: px(padding),
        borderRadius: px(radius),
        borderWidth: width,
        // EXPLICITO, e nao herdado: o preflight do Tailwind nao e carregado no
        // visual compilado (`styles.css` importa so `theme` e `utilities`), e
        // sem preflight o `border-style` default do CSS e `none` — a borda teria
        // espessura e nao desenharia nada. Enquanto `borderWidth` era classe,
        // `pbi:border` cuidava disso sozinha.
        borderStyle: width > 0 ? 'solid' : 'none',
        // O `gap` do flex reservaria espaco entre filhos que sairam da cadeia:
        // num canvas eles sao absolutos, e o container nem e flex.
        ...(free ? {} : { gap: px(gap) }),
      }}
    >
      {children}
    </div>
  );
}
