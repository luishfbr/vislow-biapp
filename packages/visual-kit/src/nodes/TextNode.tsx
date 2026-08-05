import type { Align, FontWeight } from '@vislow/config-schema';
import { ALIGN_CLASS, FONT_WEIGHT_CLASS, cx, px } from '../tokens.js';
import { hcInk } from '../highContrast.js';

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
  /** Em PIXEL. Vai por `style`, nunca por classe — ver `tokens.ts`. */
  fontSize: number;
  fontWeight: FontWeight;
  align: Align;
  color: string;
}) {
  return (
    <div
      className={cx('pbi:shrink-0', 'pbi:truncate', FONT_WEIGHT_CLASS[fontWeight], ALIGN_CLASS[align])}
      style={{
        // RF-21: alto contraste vence a cor do usuario. Ver `highContrast.ts`.
        color: hcInk(color),
        fontSize: px(fontSize),
        // A altura de linha vinha junto com `pbi:text-*`; sem a classe, o texto
        // herdaria a do host. `1.2` e o que as classes do Tailwind davam nos
        // tamanhos de titulo, que e o uso deste no.
        lineHeight: 1.2,
      }}
      title={content}
    >
      {content}
    </div>
  );
}
