import type { FontWeight, Shadow } from '@vislow/config-schema';
import { FONT_WEIGHT_CLASS, SHADOW_CLASS, cx, leadingFor, px, trackingFor } from '../tokens.js';
import { hcAccent, hcInk, hcLine, hcSelected, hcSurface } from '../highContrast.js';
import { EmptyState } from '../states.js';
import { hostOf, missingRoles, seriesOf, type DataFrame, type SeriesPoint } from './frame.js';

/**
 * A Lista de Ranking (Top-N): categorias em ordem, com barra de proporcao.
 *
 * O PRIMEIRO no do kit que ACIONA alguma coisa. O `KpiCard` e focalizavel mas e
 * `role="group"`, de proposito — sem papel de agrupamento nao ha identidade para
 * selecionar, e um `button` prometeria uma acao inexistente. Aqui a acao existe:
 * cada linha carrega a identidade de uma categoria, e clicar filtra o relatorio
 * inteiro (RF-18).
 *
 * E tambem o primeiro consumidor de `seriesOf`, que estava escrito e sem
 * chamador desde o Sprint 6.
 *
 * As props tem os MESMOS nomes dos `key` dos campos do descritor (`registry.ts`),
 * porque o codegen repassa o objeto `props` da spec direto para o componente.
 *
 * ======================= A BARRA FICA ATRAS DO TEXTO =======================
 * `behind` e o padrao, e nao e preferencia: nenhuma largura e gasta numa coluna
 * separada, entao o rotulo fica com a linha inteira — que e exatamente onde
 * lista de ranking falha, no nome comprido. E no esmaecimento o campo tingido e
 * o texto apagam como UM objeto, em vez de duas coisas apagando em paralelo.
 * ===========================================================================
 */
export function RankingList({
  frame,
  categoryRole,
  valueRole,
  sortMode,
  sortDirection,
  maxRows,
  rowGap,
  rowPadding,
  showDivider,
  dividerColor,
  labelFontSize,
  labelWeight,
  labelColor,
  labelOverflow,
  valueFontSize,
  valueWeight,
  valueColor,
  valuePosition,
  barMode,
  barBasis,
  barColor,
  barTrackColor,
  barHeight,
  barRadius,
  dimOpacity,
  selectedColor,
  hoverBackground,
  padding,
  radius,
  borderWidth,
  shadow,
  background,
  borderColor,
}: {
  frame: DataFrame;
  /** A coluna de AGRUPAMENTO. E dela que sai a identidade de selecao. */
  categoryRole: string;
  valueRole: string;
  sortMode: 'value' | 'category' | 'model';
  sortDirection: 'desc' | 'asc';
  /** Contagem, nao medida: quantas linhas a lista desenha. */
  maxRows: number;
  rowGap: number;
  rowPadding: number;
  showDivider: boolean;
  dividerColor: string;
  labelFontSize: number;
  labelWeight: FontWeight;
  labelColor: string;
  labelOverflow: 'wrap' | 'truncate';
  valueFontSize: number;
  valueWeight: FontWeight;
  valueColor: string;
  valuePosition: 'inline' | 'stacked';
  barMode: 'behind' | 'beside' | 'none';
  barBasis: 'max' | 'total';
  barColor: string;
  barTrackColor: string;
  barHeight: number;
  barRadius: number;
  /** Opacidade em PONTOS PERCENTUAIS do que esta fora da selecao. */
  dimOpacity: number;
  selectedColor: string;
  hoverBackground: string;
  padding: number;
  radius: number;
  borderWidth: number;
  shadow: Shadow;
  background: string;
  borderColor: string;
}) {
  const series = seriesOf(frame, categoryRole, valueRole);

  // RN-04 / RF-20: papel obrigatorio nao preenchido orienta qual campo arrastar.
  // `seriesOf` devolve `null` — e nao lista vazia — exatamente para separar este
  // caso de "o filtro nao retornou linha nenhuma", que desenha a lista vazia.
  if (!series) return <EmptyState missing={missingRoles(frame, categoryRole, valueRole)} />;

  const host = hostOf(frame);
  const rows = sortSeries(series, sortMode, sortDirection, frame.locale).slice(0, rowLimit(maxRows));
  const basis = basisOf(rows, barBasis);

  const width = px(borderWidth);
  const labelSize = px(labelFontSize);
  const valueSize = px(valueFontSize);
  const dim = ratio(dimOpacity);

  return (
    <div
      className={cx('vsl-text', 'vsl-rank', SHADOW_CLASS[shadow])}
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
        gap: px(rowGap),
      }}
      // Um conjunto de controles relacionados precisa de NOME, senao o leitor de
      // tela anuncia varios botoes sem dizer de que lista sao. O titulo da coluna
      // de categoria e o nome que o proprio autor do relatorio deu.
      role="group"
      aria-label={frame.roles[categoryRole]?.title ?? ''}
    >
      {rows.map((point, position) => (
        <Row
          // A CHAVE e o indice de origem no quadro, e nao a posicao na lista
          // ordenada: e ele que identifica a categoria. Reordenar a lista nao
          // deve remontar linha nenhuma, so reposiciona-las.
          key={point.index}
          point={point}
          host={host}
          categoryRole={categoryRole}
          valueRole={valueRole}
          fill={basis === 0 ? 0 : Math.min(1, Math.abs(point.value) / basis)}
          dimmed={host.hasSelection && !point.selected}
          dim={dim}
          divided={showDivider && position > 0}
          dividerColor={dividerColor}
          rowPadding={rowPadding}
          labelSize={labelSize}
          labelWeight={labelWeight}
          labelColor={labelColor}
          labelOverflow={labelOverflow}
          valueSize={valueSize}
          valueWeight={valueWeight}
          valueColor={valueColor}
          valuePosition={valuePosition}
          barMode={barMode}
          barColor={barColor}
          barTrackColor={barTrackColor}
          barHeight={barHeight}
          barRadius={barRadius}
          selectedColor={selectedColor}
          hoverBackground={hoverBackground}
        />
      ))}
    </div>
  );
}

/**
 * Uma linha. Funcao a parte porque ela carrega tudo o que e INTERACAO — clique,
 * teclado, tooltip, selecao —, e a lista acima le como composicao.
 */
function Row({
  point,
  host,
  categoryRole,
  valueRole,
  fill,
  dimmed,
  dim,
  divided,
  dividerColor,
  rowPadding,
  labelSize,
  labelWeight,
  labelColor,
  labelOverflow,
  valueSize,
  valueWeight,
  valueColor,
  valuePosition,
  barMode,
  barColor,
  barTrackColor,
  barHeight,
  barRadius,
  selectedColor,
  hoverBackground,
}: {
  point: SeriesPoint;
  host: ReturnType<typeof hostOf>;
  categoryRole: string;
  valueRole: string;
  /** Fracao de 0 a 1 ja resolvida contra a base escolhida. */
  fill: number;
  dimmed: boolean;
  dim: number;
  divided: boolean;
  dividerColor: string;
  rowPadding: number;
  labelSize: number;
  labelWeight: FontWeight;
  labelColor: string;
  labelOverflow: 'wrap' | 'truncate';
  valueSize: number;
  valueWeight: FontWeight;
  valueColor: string;
  valuePosition: 'inline' | 'stacked';
  barMode: 'behind' | 'beside' | 'none';
  barColor: string;
  barTrackColor: string;
  barHeight: number;
  barRadius: number;
  selectedColor: string;
  hoverBackground: string;
}) {
  const label = point.category === '' ? '(vazio)' : point.category;
  // O `formatted` vem do HOST e pode chegar vazio — uma medida sem `format`
  // declarado, ou uma linha que o host nao formatou. Um botao chamado "Norte: "
  // e pior do que um chamado "Norte: 0": o leitor de tela le os dois pontos e
  // para. O numero cru e a degradacao honesta.
  const shown = point.formatted === '' ? String(point.value) : point.formatted;

  const select = (multi: boolean) => {
    host.select(categoryRole, point.index, multi);
  };
  const showTooltipAt = (x: number, y: number) => {
    host.showTooltip([categoryRole, valueRole], point.index, { x, y });
  };

  const labelBlock = (
    <span
      className={cx(
        'vsl-rank-label',
        labelOverflow === 'truncate' ? 'vsl-truncate' : 'vsl-wrap',
        FONT_WEIGHT_CLASS[labelWeight],
      )}
      style={{
        color: hcInk(labelColor),
        fontSize: labelSize,
        lineHeight: leadingFor(labelSize),
        letterSpacing: trackingFor(labelSize),
      }}
    >
      {label}
    </span>
  );

  const valueBlock = (
    <span
      className={cx('vsl-rank-value', FONT_WEIGHT_CLASS[valueWeight])}
      style={{
        color: hcInk(valueColor),
        fontSize: valueSize,
        lineHeight: leadingFor(valueSize),
        letterSpacing: trackingFor(valueSize),
      }}
    >
      {shown}
    </span>
  );

  return (
    <div
      className={cx('vsl-rank-row', valuePosition === 'stacked' && 'vsl-rank-stacked')}
      style={{
        padding: px(rowPadding),
        opacity: dimmed ? dim : 1,
        // O fio entre linhas e uma BORDA no topo de quem nao e a primeira, e nao
        // um elemento irmao como no KPI: aqui as linhas ja sao irmas no flex, e
        // um separador proprio entraria na conta do `gap` duas vezes.
        borderTopWidth: divided ? 1 : 0,
        borderTopStyle: 'solid',
        borderTopColor: hcLine(dividerColor),
        // A marca de selecao e um FIO NA MARGEM, nunca um fundo — fundo brigaria
        // com o campo tingido da barra, que no modo padrao ocupa a linha inteira.
        // Os 2px sao reservados SEMPRE, com cor transparente quando fora da
        // selecao: sem isso a linha andaria 2px para o lado ao ser selecionada.
        borderLeftWidth: 2,
        borderLeftStyle: 'solid',
        borderLeftColor: point.selected ? hcSelected(selectedColor) : 'transparent',
      }}
      // RF-18/RF-23 — `button` e nao `group`: aqui ha o que acionar. `aria-pressed`
      // porque selecionar e um ALTERNADOR: clicar de novo na mesma linha limpa.
      role="button"
      tabIndex={0}
      aria-pressed={point.selected}
      // NUNCA vazio: categoria e valor juntos, porque quem chega por leitor de
      // tela nao ve a barra e o numero e a unica evidencia que sobra.
      aria-label={`${label}: ${shown}`}
      onClick={(event) => {
        select(event.ctrlKey || event.metaKey);
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        // `Space` rola a pagina do relatorio por padrao. Sem isto, acionar uma
        // linha pelo teclado move a tela do usuario junto.
        event.preventDefault();
        select(event.ctrlKey || event.metaKey);
      }}
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
      {barMode === 'behind' && (
        <>
          <div
            className="vsl-rank-track"
            aria-hidden="true"
            style={{ backgroundColor: hcSurface(barTrackColor), borderRadius: px(barRadius) }}
          />
          {/*
           * ==================== O ALTO CONTRASTE DESTA BARRA ====================
           * O preenchimento passa por `hcSurface` e a regra de baixo por
           * `hcAccent`. Parece trocado, e e deliberado.
           *
           * Em alto contraste o host da UMA cor de frente para tudo. Se a barra
           * preenchesse com `hcAccent` e o texto por cima usasse `hcInk`, os dois
           * receberiam `foreground` e o texto sumiria dentro da propria barra —
           * ilegivel em nome da acessibilidade.
           *
           * Assim, ligado o modo, o campo tingido colapsa para o FUNDO do host e
           * sobra a regra inferior, que continua tendo a largura da proporcao. A
           * barra degrada de campo para sublinhado proporcional: o dado continua
           * codificado e o texto continua legivel. Fora do alto contraste as duas
           * cores caem no mesmo `barColor` e a regra e invisivel contra o campo.
           * ======================================================================
           */}
          <div
            className="vsl-rank-fill"
            aria-hidden="true"
            style={{
              width: `${String(fill * 100)}%`,
              backgroundColor: hcSurface(barColor),
              borderBottomColor: hcAccent(barColor),
              borderRadius: px(barRadius),
            }}
          />
        </>
      )}

      {/*
       * O realce de ponteiro e um ELEMENTO, e nao uma cor no CSS.
       *
       * `:hover` nao alcanca `style` inline, e a cor e do autor — mas o
       * `styles.css` deste pacote nao pode conter cor nenhuma. A saida e inverter
       * quem guarda o que: a cor vem inline neste elemento e a regra so alterna a
       * OPACIDADE dele, que e estrutura.
       */}
      <div
        className="vsl-rank-hover"
        aria-hidden="true"
        style={{ backgroundColor: hcSurface(hoverBackground) }}
      />

      <span className="vsl-rank-text">
        {labelBlock}
        {barMode === 'beside' && (
          <span
            className="vsl-rank-gauge"
            aria-hidden="true"
            style={{
              height: px(barHeight),
              backgroundColor: hcSurface(barTrackColor),
              borderRadius: px(barRadius),
            }}
          >
            {/* Sem texto por cima, entao aqui a barra PODE preencher com a cor de
                marca de dados: nao ha o que ela possa apagar. */}
            <span
              className="vsl-rank-gauge-fill"
              style={{
                width: `${String(fill * 100)}%`,
                backgroundColor: hcAccent(barColor),
                borderRadius: px(barRadius),
              }}
            />
          </span>
        )}
        {valueBlock}
      </span>
    </div>
  );
}

/**
 * Quantas linhas desenhar. Piso de 1: uma lista de zero linhas e indistinguivel
 * de um componente quebrado.
 */
function rowLimit(maxRows: unknown): number {
  if (typeof maxRows !== 'number' || !Number.isFinite(maxRows)) return 10;
  return Math.max(1, Math.floor(maxRows));
}

/** Pontos percentuais para fracao. Fora da faixa cai no padrao do descritor. */
function ratio(points: unknown): number {
  if (typeof points !== 'number' || !Number.isFinite(points)) return 0.32;
  return Math.min(100, Math.max(0, points)) / 100;
}

/**
 * A base contra a qual cada barra mede 100%.
 *
 * Sempre em VALOR ABSOLUTO, pela mesma razao do denominador do KPI: numa lista
 * com valores negativos — prejuizo, saldo, variacao —, medir contra o numero cru
 * daria barra de comprimento negativo em `max` e uma base menor que os proprios
 * itens em `total`. O sinal continua legivel: ele esta no numero, que a linha
 * mostra por extenso.
 *
 * Base zero devolve zero e nao `Infinity`: com todos os valores zerados nao ha
 * proporcao a desenhar, e a lista sai sem barra nenhuma em vez de sair com todas
 * cheias.
 */
function basisOf(rows: readonly SeriesPoint[], barBasis: 'max' | 'total'): number {
  if (barBasis === 'total') {
    return rows.reduce((acc, point) => acc + Math.abs(point.value), 0);
  }
  return rows.reduce((acc, point) => Math.max(acc, Math.abs(point.value)), 0);
}

/**
 * Ordena a serie sem perder o `index`.
 *
 * O `index` de cada ponto e a LINHA DE ORIGEM no quadro, e e por ele que o host
 * resolve o selection id. Ordenar reposiciona os pontos e o indice viaja junto —
 * e por isso que a ordenacao pode ser livre sem quebrar o filtro cruzado. Um
 * `sort` que reindexasse faria cada clique filtrar a categoria errada, e o erro
 * so apareceria dentro do Power BI.
 *
 * `model` devolve a ordem que o host mandou, que e a do proprio modelo semantico.
 * O autor pode ja ter ordenado a coluna no relatorio, e reordenar por cima disso
 * apagaria a escolha dele sem avisar.
 */
function sortSeries(
  series: readonly SeriesPoint[],
  sortMode: 'value' | 'category' | 'model',
  sortDirection: 'desc' | 'asc',
  locale: string,
): SeriesPoint[] {
  if (sortMode === 'model') return [...series];

  if (sortMode === 'category') {
    // Sempre A-Z: `sortDirection` so aparece no painel quando a ordenacao e por
    // valor (`showWhen`), entao le-lo aqui seria obedecer a um controle que o
    // autor nao viu.
    return [...series].sort((a, b) => a.category.localeCompare(b.category, locale));
  }

  const factor = sortDirection === 'asc' ? 1 : -1;
  return [...series].sort((a, b) => factor * (a.value - b.value));
}
