import type { Align, FontSize, FontWeight } from '@vislow/config-schema';
import { ALIGN_CLASS, FONT_SIZE_CLASS, FONT_WEIGHT_CLASS, cx } from '../tokens.js';

/**
 * Titulo, rotulo ou nota. Nao le dados do modelo.
 *
 * O conteudo e do usuario e entra como TEXTO — filho de JSX, nunca `innerHTML`
 * (RN-11, garantido tambem por regra de ESLint no monorepo inteiro).
 */
export function TextNode({
  content,
  fontSize,
  fontWeight,
  align,
  color,
}: {
  content: string;
  fontSize: FontSize;
  fontWeight: FontWeight;
  align: Align;
  color: string;
}) {
  return (
    <div
      className={cx(
        'pbi:shrink-0',
        'pbi:truncate',
        FONT_SIZE_CLASS[fontSize],
        FONT_WEIGHT_CLASS[fontWeight],
        ALIGN_CLASS[align],
      )}
      style={{ color }}
      title={content}
    >
      {content}
    </div>
  );
}
