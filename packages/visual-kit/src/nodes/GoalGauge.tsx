import type { FontWeight, Shadow, VAlign } from '@vislow/config-schema';
import { FONT_WEIGHT_CLASS, SHADOW_CLASS, VALIGN_CLASS, cx, leadingFor, px, trackingFor } from '../tokens.js';
import { hcAccent, hcInk, hcLine, hcSurface } from '../highContrast.js';
import { EmptyState } from '../states.js';
import { hostOf, missingRoles, sumOf, type DataFrame } from './frame.js';

/**
 * O Medidor de Meta (RF-29): uma medida contra um alvo, em barra linear.
 *
 * As props tem os MESMOS nomes dos `key` dos campos do descritor (`registry.ts`),
 * porque o codegen repassa o objeto `props` da spec direto para o componente.
 *
 * ======================== A ESCALA E max(|valor|, |meta|) ====================
 * Abaixo da meta, o FIM DO TRILHO e a meta: nao ha marca a desenhar, porque a
 * propria moldura ja e a marca. Acima, a escala se estende ate o valor, a barra
 * enche e a meta recua para dentro dela — "passou" fica visivel E mensuravel,
 * sem nenhum campo de escala para o autor acertar.
 * =============================================================================
 *
 * ============================== O ENTALHE ====================================
 * A meta dentro da barra e um VAO na cor do trilho, e nao um fio por cima dela.
 *
 * Em alto contraste o host da UMA cor de frente. Um fio em `hcLine` sobre um
 * preenchimento em `hcAccent` seria `foreground` sobre `foreground`: a marca
 * sumiria exatamente no caso que ela existe para provar. O vao colapsa para
 * `hcSurface` — fundo sobre frente contrasta por construcao, e continua
 * contrastando impresso e para quem nao distingue as duas cores do autor.
 * =============================================================================
 *
 * SO MEDIDAS, como o `KpiCard`: um numero unico nao tem marca para clicar, entao
 * o no e focalizavel (`role="group"`) e nao acionavel.
 */
export function GoalGauge({
  frame,
  valueRole,
  targetMode,
  targetRole,
  targetValue,
  polarity,
  valueFontSize,
  valueWeight,
  valueColor,
  label,
  labelFontSize,
  labelWeight,
  labelColor,
  progressMode,
  progressFontSize,
  progressWeight,
  progressColor,
  barHeight,
  barRadius,
  trackColor,
  reachedColor,
  shortColor,
  notchWidth,
  gap,
  valign,
  padding,
  radius,
  borderWidth,
  shadow,
  background,
  borderColor,
}: {
  frame: DataFrame;
  /** A medida realizada. Papel obrigatorio — sem ele o visual pede o campo. */
  valueRole: string;
  targetMode: 'field' | 'fixed';
  /** `''` no modo fixo: "declarado, nao ligado". */
  targetRole: string;
  /** Valor de MEDIDA, nao de tela. Decimal permitido. */
  targetValue: number;
  polarity: 'higher' | 'lower' | 'neutral';
  valueFontSize: number;
  valueWeight: FontWeight;
  valueColor: string;
  label: string;
  labelFontSize: number;
  labelWeight: FontWeight;
  labelColor: string;
  progressMode: 'goalPercent' | 'remaining' | 'goalValue' | 'percentAndGoal';
  progressFontSize: number;
  progressWeight: FontWeight;
  progressColor: string;
  barHeight: number;
  barRadius: number;
  trackColor: string;
  reachedColor: string;
  shortColor: string;
  /** Zero esconde o entalhe. */
  notchWidth: number;
  gap: number;
  valign: VAlign;
  padding: number;
  radius: number;
  borderWidth: number;
  shadow: Shadow;
  background: string;
  borderColor: string;
}) {
  const value = sumOf(frame, valueRole);

  // RN-04 / RF-20: papel obrigatorio nao preenchido orienta qual campo arrastar.
  if (!value) return <EmptyState missing={missingRoles(frame, valueRole)} />;

  const target = targetOf(frame, targetMode, targetRole, targetValue);

  /*
   * O MESMO estado vale para o autor e para quem usa o relatorio.
   *
   * O autor pode ter escolhido "meta vem de um campo" e nao ter ligado o papel;
   * o consumidor pode nao ter arrastado coluna nenhuma para o papel que o autor
   * ligou. Os dois chegam aqui, e a resposta e a mesma — pedir o campo, em vez
   * de desenhar um medidor sem meta, que e um componente diferente do que o
   * autor compos. `targetRole` vazio nao nomeia nada: cai no rotulo do campo.
   */
  if (!target) return <EmptyState missing={[targetRole === '' ? 'Meta' : targetRole]} />;

  const host = hostOf(frame);
  const width = px(borderWidth);
  const valueSize = px(valueFontSize);
  const labelSize = px(labelFontSize);
  const progressSize = px(progressFontSize);

  const scale = Math.max(Math.abs(value.total), Math.abs(target.total));
  const fill = scale === 0 ? 0 : Math.abs(value.total) / scale;
  /*
   * O entalhe SO existe quando a meta ficou para tras.
   *
   * Com o valor abaixo da meta, a meta esta em 100% da escala — ou seja, no fim
   * do trilho —, e um vao ali seria um recorte na borda da moldura, nao uma
   * marca. `< 1` e a condicao exata: e o mesmo que dizer |valor| > |meta|.
   */
  const notchAt = scale === 0 ? 1 : Math.abs(target.total) / scale;
  const showNotch = notchAt < 1 && px(notchWidth) > 0;

  // A cor e o JUIZO; a geometria acima ja deu o fato. `neutral` e o autor dizendo
  // que nao ha juizo a dar, e cai na cor favoravel — inventar uma terceira cor
  // para esse caso seria um campo a mais por uma linha que quase nunca aparece.
  const reached = polarity === 'lower' ? value.total <= target.total : value.total >= target.total;
  const barColor = polarity === 'neutral' || reached ? reachedColor : shortColor;

  const labelText = label === '' ? (frame.roles[valueRole]?.title ?? '') : label;
  const progressText = progressTextOf(
    progressMode,
    value.total,
    target.total,
    target.formatted,
    frame.locale,
  );

  // Os papeis do balao, na ordem em que o autor os declarou. Indice 0 porque o no
  // NAO declara agrupamento: sem `categories` o host entrega uma linha so por
  // medida, ja agregada. A meta fixa nao e papel e nao entra no balao.
  const tooltipRoles = targetMode === 'field' ? [valueRole, targetRole] : [valueRole];
  const showTooltipAt = (x: number, y: number) => {
    host.showTooltip(tooltipRoles, 0, { x, y });
  };

  return (
    <div
      className={cx('vsl-text', 'vsl-goal', VALIGN_CLASS[valign], SHADOW_CLASS[shadow])}
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
      // RF-23 — alcancavel por `Tab`, com foco visivel. `group` e nao `button`:
      // sem papel de agrupamento nao ha identidade para selecionar, e um `button`
      // prometeria uma acao que nao existe.
      tabIndex={0}
      role="group"
      // A barra e `aria-hidden`: valor, percentual e meta ja estao na tela como
      // TEXTO, e o rotulo do grupo amarra os tres numa frase so. NUNCA vazio —
      // um grupo focalizavel sem nome e anunciado como "grupo" e mais nada.
      aria-label={`${labelText === '' ? value.formatted : `${labelText}: ${value.formatted}`}, ${progressText}`}
      onMouseMove={(event) => {
        showTooltipAt(event.clientX, event.clientY);
      }}
      onMouseLeave={() => {
        host.hideTooltip();
      }}
      // RF-19 pelo teclado tambem: quem chega por `Tab` nao tem coordenada de
      // mouse. `currentTarget` evita `ref`, que exigiria hook (proibido no kit).
      onFocus={(event) => {
        const box = event.currentTarget.getBoundingClientRect();
        showTooltipAt(box.left + box.width / 2, box.top + box.height / 2);
      }}
      onBlur={() => {
        host.hideTooltip();
      }}
    >
      {labelText !== '' && (
        <div
          className={cx('vsl-goal-label', FONT_WEIGHT_CLASS[labelWeight])}
          style={{
            color: hcInk(labelColor),
            fontSize: labelSize,
            lineHeight: leadingFor(labelSize),
            letterSpacing: trackingFor(labelSize),
          }}
        >
          {labelText}
        </div>
      )}

      <div className="vsl-goal-head">
        <span
          className={cx('vsl-goal-value', FONT_WEIGHT_CLASS[valueWeight])}
          style={{
            // `hcAccent`, e nao `hcInk`: o numero e MARCA DE DADOS. Rotulo e
            // apoio sao texto e ficam em `hcInk`.
            color: hcAccent(valueColor),
            fontSize: valueSize,
            lineHeight: leadingFor(valueSize),
            letterSpacing: trackingFor(valueSize),
          }}
        >
          {value.formatted}
        </span>
        <span
          className={cx('vsl-goal-support', FONT_WEIGHT_CLASS[progressWeight])}
          style={{
            color: hcInk(progressColor),
            fontSize: progressSize,
            lineHeight: leadingFor(progressSize),
            letterSpacing: trackingFor(progressSize),
          }}
        >
          {progressText}
        </span>
      </div>

      {/* A barra inteira e decoracao para o leitor de tela: o `aria-label` do
          grupo ja carrega valor, percentual e meta em texto. */}
      <div
        className="vsl-goal-track"
        aria-hidden="true"
        style={{
          backgroundColor: hcSurface(trackColor),
          height: px(barHeight),
          borderRadius: px(barRadius),
        }}
      >
        <div
          className="vsl-goal-fill"
          style={{
            width: `${String(fill * 100)}%`,
            backgroundColor: hcAccent(barColor),
            borderRadius: px(barRadius),
          }}
        />
        {showNotch && (
          <div
            className="vsl-goal-notch"
            style={{
              left: `${String(notchAt * 100)}%`,
              width: px(notchWidth),
              // A COR DO TRILHO, e nao uma cor propria: o entalhe e o trilho
              // aparecendo por baixo. Em alto contraste vira `hcSurface`, que e o
              // fundo do host — e fundo sobre frente contrasta sempre.
              backgroundColor: hcSurface(trackColor),
            }}
          />
        )}
      </div>
    </div>
  );
}

/**
 * A meta, venha ela de onde vier.
 *
 * Devolve `null` — e nao zero — quando o modo e campo e o papel nao chegou, pela
 * mesma razao do `seriesOf`: "sem meta" e "meta zero" pedem telas diferentes, e
 * confundi-los desenharia uma barra cheia contra um alvo que ninguem declarou.
 *
 * A meta FIXA e formatada pelo `Intl` com o locale do host, e nao pelo host: ela
 * nao e coluna do modelo, entao nao ha `format` de medida a herdar.
 */
function targetOf(
  frame: DataFrame,
  targetMode: 'field' | 'fixed',
  targetRole: string,
  targetValue: number,
): { total: number; formatted: string } | null {
  if (targetMode === 'field') {
    return targetRole === '' ? null : sumOf(frame, targetRole);
  }

  const total = typeof targetValue === 'number' && Number.isFinite(targetValue) ? targetValue : 0;
  return {
    total,
    formatted: new Intl.NumberFormat(frame.locale, { maximumFractionDigits: 2 }).format(total),
  };
}

/**
 * A linha de apoio.
 *
 * O DENOMINADOR e `|meta|`, e meta zero nao vira percentual — as duas regras sao
 * as do `DeltaLine` do KPI, e pelo mesmo motivo: `x / 0` e `Infinity`, e com meta
 * negativa dividir pelo numero cru inverteria o sinal do percentual em relacao
 * ao da barra. Sem percentual possivel, os modos que o pediriam caem na meta em
 * si — informacao a menos, nunca informacao errada.
 */
function progressTextOf(
  progressMode: 'goalPercent' | 'remaining' | 'goalValue' | 'percentAndGoal',
  value: number,
  target: number,
  targetFormatted: string,
  locale: string,
): string {
  const goal = `de ${targetFormatted}`;
  if (progressMode === 'goalValue') return goal;

  if (progressMode === 'remaining') {
    const gap = target - value;
    if (gap === 0) return 'meta atingida';
    const magnitude = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(
      Math.abs(gap),
    );
    return gap > 0 ? `faltam ${magnitude}` : `${magnitude} acima da meta`;
  }

  if (target === 0) return goal;
  const percent = new Intl.NumberFormat(locale, {
    style: 'percent',
    maximumFractionDigits: 1,
  }).format(value / Math.abs(target));

  return progressMode === 'percentAndGoal' ? `${percent} ${goal}` : `${percent} da meta`;
}
