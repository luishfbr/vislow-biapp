import type { Align, FontWeight, Shadow, VAlign } from '@vislow/config-schema';
import {
  ALIGN_CLASS,
  FONT_WEIGHT_CLASS,
  SHADOW_CLASS,
  VALIGN_CLASS,
  cx,
  leadingFor,
  px,
  trackingFor,
} from '../tokens.js';
import { hcAccent, hcInk, hcLine, hcSurface } from '../highContrast.js';
import { EmptyState } from '../states.js';
import { hostOf, missingRoles, sumOf, type DataFrame } from './frame.js';

/**
 * O KPI Card (RF-16): um numero, um rotulo e a variacao contra outra medida.
 *
 * O PRIMEIRO no a ler o `DataFrame` desde a poda da spec 5.0.0. E por ele que o
 * visual gerado volta a ter poco de campos no Power BI.
 *
 * As props tem os MESMOS nomes dos `key` dos campos do descritor (`registry.ts`),
 * porque o codegen repassa o objeto `props` da spec direto para o componente.
 * Renomear um lado sem o outro quebra em tempo de compilacao do visual gerado,
 * que e onde queremos que quebre.
 *
 * ======================== DIRECAO NAO DEPENDE DE COR ========================
 * A seta E o sinal aparecem sempre, e os dois seguem o SINAL ARITMETICO da
 * variacao. Cor sozinha nao comunica direcao para daltonicos, e em alto
 * contraste as duas cores do usuario podem virar a mesma — o card continuaria
 * dizendo "mudou" sem dizer para onde.
 *
 * A POLARIDADE muda so a cor. Num KPI de custo ou de churn a queda e boa: a seta
 * continua apontando para baixo, e a cor de favoravel e que se aplica. Sem essa
 * separacao, um card de despesa pinta economia como problema.
 * ============================================================================
 */
export function KpiCard({
  frame,
  valueRole,
  compareRole,
  polarity,
  valueFontSize,
  valueWeight,
  valueColor,
  label,
  labelPosition,
  labelFontSize,
  labelWeight,
  labelColor,
  deltaMode,
  compareLabel,
  deltaFontSize,
  deltaWeight,
  upColor,
  downColor,
  showRule,
  align,
  valign,
  gap,
  padding,
  radius,
  borderWidth,
  shadow,
  background,
  borderColor,
}: {
  frame: DataFrame;
  /** Nome da coluna ligada. O papel obrigatorio — sem ele o card pede o campo. */
  valueRole: string;
  /** `''` e "declarado, nao ligado": esconde a linha de variacao inteira. */
  compareRole: string;
  polarity: 'higher' | 'lower' | 'neutral';
  /** Todas as medidas em PIXEL. Vao por `style`, nunca por classe. */
  valueFontSize: number;
  valueWeight: FontWeight;
  valueColor: string;
  label: string;
  labelPosition: 'above' | 'below';
  labelFontSize: number;
  labelWeight: FontWeight;
  labelColor: string;
  deltaMode: 'both' | 'absolute' | 'percent';
  compareLabel: string;
  deltaFontSize: number;
  deltaWeight: FontWeight;
  upColor: string;
  downColor: string;
  showRule: boolean;
  align: Align;
  valign: VAlign;
  gap: number;
  padding: number;
  radius: number;
  borderWidth: number;
  shadow: Shadow;
  background: string;
  borderColor: string;
}) {
  const value = sumOf(frame, valueRole);

  // RN-04 / RF-20: papel obrigatorio nao preenchido orienta qual campo arrastar,
  // e nao desenha um card vazio nem uma tela branca. `missingRoles` devolve o
  // nome do papel na ordem em que foi pedido.
  if (!value) return <EmptyState missing={missingRoles(frame, valueRole)} />;

  const compare = compareRole === '' ? null : sumOf(frame, compareRole);
  const delta = compare ? value.total - compare.total : null;

  const host = hostOf(frame);
  const width = px(borderWidth);
  const valueSize = px(valueFontSize);
  const labelSize = px(labelFontSize);
  const deltaSize = px(deltaFontSize);

  const labelText = label === '' ? (frame.roles[valueRole]?.title ?? '') : label;

  // Os papeis do balao, na ordem em que o autor os declarou. O host resolve
  // titulo e valor formatado de cada um; papel ausente do quadro ele mesmo pula.
  //
  // Indice 0 porque o card NAO declara agrupamento: sem `categories` o host
  // entrega uma linha so por medida, ja agregada. Se um dia houver categoria,
  // este indice deixa de ser o agregado e passa a ser a primeira linha.
  const tooltipRoles = compareRole === '' ? [valueRole] : [valueRole, compareRole];
  const showTooltipAt = (x: number, y: number) => {
    host.showTooltip(tooltipRoles, 0, { x, y });
  };

  const labelBlock = labelText === '' ? null : (
    <div
      className={cx('vsl-kpi-label', FONT_WEIGHT_CLASS[labelWeight])}
      style={{
        color: hcInk(labelColor),
        fontSize: labelSize,
        lineHeight: leadingFor(labelSize),
        letterSpacing: trackingFor(labelSize),
      }}
    >
      {labelText}
    </div>
  );

  return (
    <div
      className={cx('vsl-text', 'vsl-kpi', ALIGN_CLASS[align], VALIGN_CLASS[valign], SHADOW_CLASS[shadow])}
      style={{
        // RF-21: em alto contraste a paleta do host sobrepoe a cor escolhida.
        backgroundColor: hcSurface(background),
        borderColor: hcLine(borderColor),
        padding: px(padding),
        borderRadius: px(radius),
        borderWidth: width,
        // EXPLICITO: o `border-style` default do CSS e `none`, e o `styles.css`
        // escrito a mao nao carrega reset. Mesma razao do `Container`.
        borderStyle: width > 0 ? 'solid' : 'none',
        gap: px(gap),
      }}
      // RF-23 — alcancavel por `Tab`, com foco visivel pela regra
      // `.vsl-kpi:focus-visible`. `group` e nao `button`: nada e acionado aqui.
      // Sem papel de agrupamento nao ha identidade para selecionar, entao um
      // `button` prometeria uma acao que nao existe.
      tabIndex={0}
      role="group"
      // NUNCA vazio: um grupo focalizavel sem nome acessivel e anunciado como
      // "grupo" e mais nada. O rotulo ja cai no titulo da coluna quando o autor
      // nao escreveu um; quando nem isso existe, o proprio numero nomeia o card.
      aria-label={labelText === '' ? value.formatted : labelText}
      onMouseMove={(event) => {
        showTooltipAt(event.clientX, event.clientY);
      }}
      onMouseLeave={() => {
        host.hideTooltip();
      }}
      // RF-19 pelo teclado tambem: quem chega por `Tab` nao tem ponteiro, e sem
      // isto o balao seria exclusivo do mouse. O centro do proprio elemento e a
      // ancora — `currentTarget` evita precisar de `ref`, que exigiria hook.
      onFocus={(event) => {
        const box = event.currentTarget.getBoundingClientRect();
        showTooltipAt(box.left + box.width / 2, box.top + box.height / 2);
      }}
      onBlur={() => {
        host.hideTooltip();
      }}
    >
      {labelPosition === 'above' && labelBlock}

      <div
        className={cx('vsl-kpi-figure', FONT_WEIGHT_CLASS[valueWeight])}
        style={{
          // `hcAccent`, e nao `hcInk`: o numero e MARCA DE DADOS, e e para ele
          // que a variavel existe. As duas recebem o `foreground` do host hoje,
          // mas confundi-las apagaria a distincao no dia em que deixarem de
          // receber. O rotulo e a legenda continuam em `hcInk` — sao texto.
          color: hcAccent(valueColor),
          fontSize: valueSize,
          // A entrelinha e o tracking RESPONDEM ao tamanho — ver `tokens.ts`. Num
          // numero de 44px sao a diferenca entre uma manchete e um texto ampliado.
          lineHeight: leadingFor(valueSize),
          letterSpacing: trackingFor(valueSize),
        }}
      >
        {value.formatted}
      </div>

      {labelPosition === 'below' && labelBlock}

      {delta !== null && compare && (
        <DeltaLine
          delta={delta}
          base={compare.total}
          baseTitle={frame.roles[compareRole]?.title ?? ''}
          locale={frame.locale}
          polarity={polarity}
          deltaMode={deltaMode}
          compareLabel={compareLabel}
          size={deltaSize}
          weight={deltaWeight}
          upColor={upColor}
          downColor={downColor}
          labelColor={labelColor}
          borderColor={borderColor}
          showRule={showRule}
        />
      )}
    </div>
  );
}

/**
 * A linha de variacao, com o fio que a separa do numero.
 *
 * Funcao a parte, e nao um bloco dentro do card, porque ela e a unica parte com
 * ARITMETICA: separada, o card acima le como composicao e as decisoes de sinal,
 * base zero e polaridade ficam todas num lugar so.
 */
function DeltaLine({
  delta,
  base,
  baseTitle,
  locale,
  polarity,
  deltaMode,
  compareLabel,
  size,
  weight,
  upColor,
  downColor,
  labelColor,
  borderColor,
  showRule,
}: {
  delta: number;
  base: number;
  baseTitle: string;
  locale: string;
  polarity: 'higher' | 'lower' | 'neutral';
  deltaMode: 'both' | 'absolute' | 'percent';
  compareLabel: string;
  size: number;
  weight: FontWeight;
  upColor: string;
  downColor: string;
  labelColor: string;
  borderColor: string;
  showRule: boolean;
}) {
  /*
   * A DIVISAO POR ZERO, escrita e nao herdada.
   *
   * Base zero nao tem variacao relativa: `x / 0` e `Infinity`, e um card que
   * anuncia "+Infinity%" e pior do que um que nao anuncia percentual nenhum. O
   * absoluto continua valendo e continua aparecendo.
   *
   * O denominador e o VALOR ABSOLUTO da base. Com base negativa — prejuizo,
   * saldo devedor —, dividir pelo proprio numero inverteria o sinal do
   * percentual em relacao ao da diferenca, e a seta apontaria para um lado
   * enquanto o percentual apontaria para o outro.
   */
  const ratio = base === 0 ? null : delta / Math.abs(base);

  const magnitude = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(
    Math.abs(delta),
  );
  const percent =
    ratio === null
      ? null
      : new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(
          Math.abs(ratio),
        );

  // O sinal e NOSSO, e nao o do `Intl`: formatamos a magnitude e prefixamos. Isso
  // garante o `+` no positivo — que nenhum formatador escreve por padrao — e usa
  // o sinal de menos tipografico (U+2212) em vez do hifen.
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '';
  const arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '';

  /*
   * A cor e o JUIZO; a seta acima ja deu a direcao.
   *
   * Variacao zero nao e favoravel nem desfavoravel, e `neutral` e o autor
   * dizendo que nao ha juizo a dar. Os dois caem em `upColor` porque as cores
   * declaradas sao duas, e inventar uma terceira para o caso neutro seria um
   * campo a mais para uma linha que quase nunca aparece.
   */
  const favorable = delta > 0 === (polarity === 'higher');
  const color =
    polarity === 'neutral' || delta === 0 ? upColor : favorable ? upColor : downColor;

  const legend = compareLabel !== '' ? compareLabel : baseTitle === '' ? '' : `vs ${baseTitle}`;

  const parts: string[] = [];
  if (deltaMode !== 'percent') parts.push(`${sign}${magnitude}`);
  if (deltaMode !== 'absolute' && percent !== null) parts.push(`${sign}${percent}`);

  return (
    <>
      {showRule && (
        // Um elemento, e nao uma borda na linha de baixo: como irmao no flex ele
        // participa do `gap`, entao o espaco acima e abaixo do fio e o mesmo que
        // separa as outras linhas. Uma borda ficaria colada no texto.
        <div className="vsl-kpi-rule" style={{ borderTopColor: hcLine(borderColor) }} />
      )}
      <div
        className={cx('vsl-kpi-delta', FONT_WEIGHT_CLASS[weight])}
        style={{
          color: hcInk(color),
          fontSize: size,
          lineHeight: leadingFor(size),
          letterSpacing: trackingFor(size),
        }}
      >
        {/* A seta mora num slot de largura fixa: trocar de direcao — ou nao ter
            direcao nenhuma, na variacao zero — nunca reflui a linha. `aria-hidden`
            porque o sinal ao lado ja diz a mesma coisa em texto. */}
        <span className="vsl-kpi-arrow" aria-hidden="true">
          {arrow}
        </span>
        {parts.join(' · ')}
        {legend !== '' && (
          // A legenda nao e juizo: fica na cor do rotulo, e nao na da variacao.
          <span style={{ color: hcInk(labelColor) }}> {legend}</span>
        )}
      </div>
    </>
  );
}
