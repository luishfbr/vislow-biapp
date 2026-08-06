import type { Align, FontWeight, VAlign } from '@vislow/config-schema';
import {
  ALIGN_CLASS,
  FONT_WEIGHT_CLASS,
  VALIGN_CLASS,
  cx,
  leadingFor,
  px,
  trackingFor,
} from '../tokens.js';
import { hcInk, hcSurface } from '../highContrast.js';

/**
 * Titulo, rotulo, nota — texto dentro de uma CAIXA. Nao le dados do modelo.
 *
 * Substituiu o `TextNode` na spec 5.0.0. O antigo era uma linha so, com
 * `truncate` fixo e `shrink-0`: nao tinha fundo, nao tinha preenchimento, nao
 * quebrava linha e nao sabia se posicionar dentro da caixa que o usuario
 * desenhou no canvas. Nao era uma caixa de texto, era um texto.
 *
 * O CONTEUDO E DO USUARIO e entra como TEXTO — filho de JSX, nunca `innerHTML`
 * (RN-11, garantido tambem por regra de ESLint no monorepo inteiro).
 *
 * As props tem os MESMOS nomes dos `key` dos campos do descritor (`registry.ts`),
 * porque o codegen repassa o objeto `props` da spec direto para o componente.
 * Renomear um lado sem o outro quebra em tempo de compilacao do visual gerado,
 * que e onde queremos que quebre.
 */
export function TextBox({
  content,
  fontSize,
  fontWeight,
  align,
  valign,
  color,
  showBackground,
  background,
  padding,
  radius,
  overflow,
}: {
  content: string;
  /** Em PIXEL. Vai por `style`, nunca por classe — ver `tokens.ts`. */
  fontSize: number;
  fontWeight: FontWeight;
  align: Align;
  valign: VAlign;
  color: string;
  /**
   * O fundo e OPCIONAL, e por isso ha um booleano em vez de uma cor
   * "transparente".
   *
   * `COLOR_PATTERN` aceita so `#rrggbb` — nao ha como escrever transparencia num
   * campo de cor sem abrir o padrao para oito digitos, o que mudaria a validacao
   * de toda cor do produto por causa de um caso. Um interruptor diz a mesma
   * coisa, e diz melhor: o usuario que desliga o fundo nao perde a cor que
   * escolheu.
   */
  showBackground: boolean;
  background: string;
  /** Em PIXEL. */
  padding: number;
  radius: number;
  overflow: 'wrap' | 'truncate';
}) {
  const size = px(fontSize);

  return (
    <div
      className={cx(
        'vsl-box',
        'vsl-text',
        FONT_WEIGHT_CLASS[fontWeight],
        ALIGN_CLASS[align],
        VALIGN_CLASS[valign],
        overflow === 'truncate' ? 'vsl-truncate' : 'vsl-wrap',
      )}
      style={{
        // RF-21: alto contraste vence a cor do usuario. Ver `highContrast.ts`.
        color: hcInk(color),
        fontSize: size,
        // A entrelinha e o tracking RESPONDEM ao tamanho — ver `tokens.ts`. Sao
        // a unica coisa deste componente que o usuario nao controla e nao
        // precisa controlar.
        lineHeight: leadingFor(size),
        letterSpacing: trackingFor(size),
        padding: px(padding),
        borderRadius: px(radius),
        // `undefined`, e nao `'transparent'`: a propriedade some do estilo em vez
        // de ser escrita com um valor que o alto contraste teria de desfazer.
        backgroundColor: showBackground ? hcSurface(background) : undefined,
      }}
      // O `title` so entra quando o texto PODE estar cortado. Num texto que
      // quebra linha, ele seria uma tooltip repetindo o que ja esta visivel — e
      // ela apareceria por cima do relatorio a cada passagem do mouse.
      title={overflow === 'truncate' ? content : undefined}
    >
      {content}
    </div>
  );
}
