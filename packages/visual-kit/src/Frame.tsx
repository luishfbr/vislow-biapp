import type { ReactNode } from 'react';
import type { VisualConfig } from '@vislow/config-schema';
import {
  ALIGN_CLASS,
  BORDER_CLASS,
  FONT_SIZE_CLASS,
  FONT_WEIGHT_CLASS,
  RADIUS_CLASS,
  SHADOW_CLASS,
  SPACING_CLASS,
  cx,
} from './tokens.js';
import type { ResolvedColors } from './theme.js';

/**
 * Moldura comum a todos os tipos de visual: superficie, borda, sombra e titulo.
 *
 * Existir uma unica moldura e o que garante que trocar o tipo de visual preserve
 * os tokens comuns (RF-01) sem duplicar a logica em cada componente.
 */
export function Frame({
  config,
  colors,
  children,
}: {
  config: VisualConfig;
  colors: ResolvedColors;
  children: ReactNode;
}) {
  const { layout, header } = config;

  return (
    <div
      className={cx(
        'pbi:w-full',
        'pbi:h-full',
        'pbi:flex',
        'pbi:flex-col',
        'pbi:overflow-hidden',
        SPACING_CLASS[layout.padding],
        RADIUS_CLASS[layout.radius],
        SHADOW_CLASS[layout.shadow],
        BORDER_CLASS[layout.border],
      )}
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        borderStyle: layout.border === 'none' ? undefined : 'solid',
      }}
    >
      {header.show && header.text !== '' && (
        <h2
          className={cx(
            'pbi:mb-3',
            'pbi:truncate',
            'pbi:shrink-0',
            FONT_SIZE_CLASS[header.fontSize],
            FONT_WEIGHT_CLASS[header.fontWeight],
            ALIGN_CLASS[header.align],
          )}
          style={{ color: colors.headerText }}
          title={header.text}
        >
          {header.text}
        </h2>
      )}
      <div className="pbi:flex-1 pbi:min-h-0 pbi:flex pbi:flex-col">{children}</div>
    </div>
  );
}
