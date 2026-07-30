import type { Border, Radius, Shadow, Spacing } from '@vislow/config-schema';
import type { ReactNode } from 'react';
import {
  BORDER_CLASS,
  DIRECTION_CLASS,
  GAP_CLASS,
  RADIUS_CLASS,
  SHADOW_CLASS,
  SPACING_CLASS,
  cx,
} from '../tokens.js';

/**
 * O unico no que aceita filhos. E o esqueleto de toda composicao.
 *
 * As props tem os MESMOS nomes dos `key` dos campos do descritor
 * (`registry.ts`), porque o codegen repassa o objeto `props` da spec direto para
 * o componente. Renomear um lado sem o outro quebra em tempo de compilacao do
 * visual gerado, que e onde queremos que quebre.
 */
export function Container({
  direction,
  gap,
  padding,
  radius,
  border,
  shadow,
  background,
  borderColor,
  children,
}: {
  direction: 'row' | 'column';
  gap: Spacing;
  padding: Spacing;
  radius: Radius;
  border: Border;
  shadow: Shadow;
  background: string;
  borderColor: string;
  children?: ReactNode;
}) {
  return (
    <div
      // `min-h-0`/`min-w-0` nao sao decorativos: sem eles um filho flexivel nunca
      // encolhe abaixo do proprio conteudo, e o ResponsiveContainer do Recharts
      // mede altura zero — grafico invisivel, sem erro nenhum.
      className={cx(
        'pbi:flex',
        'pbi:flex-1',
        'pbi:min-h-0',
        'pbi:min-w-0',
        DIRECTION_CLASS[direction],
        GAP_CLASS[gap],
        SPACING_CLASS[padding],
        RADIUS_CLASS[radius],
        BORDER_CLASS[border],
        SHADOW_CLASS[shadow],
      )}
      style={{ backgroundColor: background, borderColor }}
    >
      {children}
    </div>
  );
}
