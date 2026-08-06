import { roleFieldsOf, walk, type VisualSpec } from '@vislow/component-registry';
import type { FrameHost } from '@vislow/visual-kit/nodes';

/**
 * O host do PREVIEW — o que faz o esmaecimento existir dentro do editor.
 *
 * `sampleFrame` monta o quadro sem `host`, entao `hostOf` sempre caia no
 * `INERT_HOST`: `hasSelection` falso, `isSelected` falso, e nenhum estado de
 * selecao visivel no editor. Isso bastava enquanto o unico no de dados era o KPI
 * Card, que nao tem marca para selecionar. Com a Lista de Ranking o esmaecimento
 * passou a ser um estado visual GRANDE, e um que o autor precisa DESENHAR — se
 * ele nao aparece no preview, so aparece depois de exportar e importar.
 *
 * ===================== POR QUE MORA AQUI, E NAO NO KIT =====================
 * O `visual-kit` e folha e vai inteiro para dentro do bundle do visual, contra o
 * orcamento de 1 MB. Um host de simulacao nao tem nada que fazer no pacote que o
 * consumidor final instala: ele existe para o editor, e so.
 * ===========================================================================
 *
 * ================== POR QUE `select` E `showTooltip` SAO MUDOS =============
 * Nao ha relatorio para filtrar no editor, e a tabela de exemplo nao reduz.
 * Fazer o clique "filtrar" aqui produziria um efeito que o Power BI nao
 * reproduz, e o preview passaria a mentir sobre o pacote — que e exatamente o
 * que o ADR-04 existe para impedir. O tooltip e nativo do host: no navegador nao
 * ha o que o abra.
 *
 * `kind` continua `'inert'` pela mesma razao: os nos consultam esse
 * discriminante para decidir o que desenhar, e anunciar-se como host de verdade
 * seria mentir para eles.
 * ===========================================================================
 */
export function previewHost(simulateSelection: boolean): FrameHost {
  return {
    kind: 'inert',
    select: () => undefined,
    /**
     * A PRIMEIRA linha do quadro, e nao a primeira da lista desenhada.
     *
     * O indice de um ponto e a linha de ORIGEM no quadro; a Lista ordena e o
     * indice viaja junto. Simular por indice 0 significa que a linha destacada
     * muda de posicao quando o autor troca a ordenacao — o que e verdade sobre o
     * produto final, onde o que esta selecionado tambem nao e "o primeiro da
     * lista" e sim uma categoria especifica.
     */
    isSelected: (_role: string, index: number) => simulateSelection && index === 0,
    hasSelection: simulateSelection,
    showTooltip: () => undefined,
    hideTooltip: () => undefined,
  };
}

/**
 * A arvore tem alguma marca que a selecao do relatorio possa esmaecer?
 *
 * Governa a EXIBICAO do interruptor de simulacao. Um interruptor que nao muda
 * nada na tela e a mesma falha que `direction` num container que posiciona
 * livremente: o autor o aciona tres vezes antes de concluir que o editor esta
 * quebrado. Nos dois casos a saida e a mesma — nao desenhar o controle.
 *
 * DERIVADO do catalogo, e nao uma lista de tipos: a pergunta e "algum no declara
 * papel de agrupamento?", nao "existe um `ranking` aqui?". Um tipo de no futuro
 * com papel de categoria acende o interruptor sozinho, sem tocar neste arquivo.
 *
 * Mora no editor, e nao no registro, porque tem um consumidor so e ele e uma
 * decisao de INTERFACE. `consumesData` esta la porque preview e codegen precisam
 * dela; esta pergunta o codegen nunca faz.
 */
export function hasSelectableMarks(spec: VisualSpec): boolean {
  return walk(spec).some(({ node }) =>
    roleFieldsOf(node.kind).some((field) => field.roleKind === 'grouping'),
  );
}
