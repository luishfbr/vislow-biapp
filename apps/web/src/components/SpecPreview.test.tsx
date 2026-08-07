// @vitest-environment jsdom
import {
  NODE_KINDS,
  createEmptySpec,
  createNode,
  insertChild,
  suggestRoleBindings,
  setNodeProps,
  setNodeRect,
  type SpecNode,
  type VisualSpec,
} from '@vislow/component-registry';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { SpecPreview } from './SpecPreview';

/**
 * O preview RENDERIZA — nao so compila.
 *
 * E o analogo, do lado do editor, do que o `compiledVisual.e2e` faz com o
 * artefato: montar de verdade e conferir que saiu conteudo, e nao card de erro.
 * Um preview que monta em branco e a falha que mais custou tempo neste projeto,
 * e ela nunca aparece em typecheck.
 *
 * ================= O QUE SAIU DAQUI COM O RECHARTS (spec 5.0.0) =============
 * Este arquivo tinha um `installLayout()` de 45 linhas — `ResizeObserver`
 * imediato, `offsetWidth`/`clientHeight` fixados no prototipo, `getBoundingClientRect`
 * substituido — porque o jsdom nao tem motor de layout e o `ResponsiveContainer`
 * do Recharts depende dos dois: sem aquilo os graficos montavam e desenhavam
 * NADA, e o teste passava achando que estava tudo bem justamente na parte que
 * interessava.
 *
 * Sem grafico nenhum, nada aqui mede a moldura para decidir o que desenhar, e o
 * harness inteiro perdeu a razao de existir. Ele volta com o KPI Card da Fase 4,
 * junto com os testes "cada tipo de grafico do registro monta" e "grafico dentro
 * de uma caixa posicionada continua medindo".
 * ============================================================================
 */

beforeAll(() => {
  Object.assign(window, { IS_REACT_ACT_ENVIRONMENT: true });
});

let host: HTMLElement | null = null;
let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function render(spec: VisualSpec): HTMLElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);

  act(() => {
    root?.render(<SpecPreview spec={spec} />);
  });
  return host;
}

/** Empilha nos no container raiz, na ordem dada. */
function compose(name: string, ...nodes: SpecNode[]): VisualSpec {
  const spec = createEmptySpec(name);
  let root: SpecNode = spec.root;
  for (const node of nodes) {
    root = insertChild(root, spec.root.id, node) ?? root;
  }
  return { ...spec, root };
}

/** Um texto com as props pedidas por cima do default do descritor. */
function textNode(props: Record<string, unknown>): SpecNode {
  const node = createNode('text');
  return { ...node, props: { ...node.props, ...props } };
}

const NAO_RENDERIZOU = 'Não foi possível renderizar o visual';

/** Um no do tipo pedido, com os papeis ligados as colunas da tabela padrao. */
function nodeOf(kind: (typeof NODE_KINDS)[number]): SpecNode {
  return createNode(kind, suggestRoleBindings(kind, createEmptySpec('x').data.columns));
}

describe('preview da arvore', () => {
  it('desenha o conteudo do usuario, sem card de erro', () => {
    const spec = compose(
      'Painel',
      textNode({ content: 'Vendas do trimestre' }),
      textNode({ content: 'Atualizado hoje' }),
    );

    const dom = render(spec);

    expect(dom.textContent).toContain('Vendas do trimestre');
    expect(dom.textContent).toContain('Atualizado hoje');
    expect(dom.textContent).not.toContain(NAO_RENDERIZOU);
  });

  it('projeto novo — tela em branco — nao renderiza em branco de ERRO', () => {
    const dom = render(createEmptySpec('Vazio'));
    expect(dom.textContent).not.toContain(NAO_RENDERIZOU);
    expect(dom.querySelector('div')).not.toBeNull();
  });

  it('o texto entra como TEXTO, nunca como marcacao (RN-11)', () => {
    const dom = render(compose('Hostil', textNode({ content: '<b>nao</b> deve virar tag' })));

    expect(dom.textContent).toContain('<b>nao</b> deve virar tag');
    expect(dom.querySelector('b')).toBeNull();
  });

  it('a caixa de texto aplica cor, tamanho e espacamento por style inline', () => {
    // Cor e MEDIDA nunca viram classe (ADR-02): o valor e livre, e classe
    // construida por interpolacao some sem erro dentro do Power BI.
    const dom = render(
      compose('Estilo', textNode({ color: '#123456', fontSize: 44, padding: 12, radius: 6 })),
    );
    const caixa = dom.querySelector<HTMLElement>('.vsl-box');

    expect(caixa).not.toBeNull();
    // A cor sai embrulhada na variavel de ALTO CONTRASTE (RF-21): o valor do
    // usuario e o fallback, e a paleta do host vence quando ela existe. Assertar
    // o hex cru aqui esconderia a perda dessa escotilha.
    expect(caixa?.style.color).toBe('var(--vislow-hc-ink, #123456)');
    expect(caixa?.style.fontSize).toBe('44px');
    expect(caixa?.style.padding).toBe('12px');
    expect(caixa?.style.borderRadius).toBe('6px');
  });

  it('a entrelinha RESPONDE ao tamanho — a assinatura tipografica', () => {
    // Nao ha controle para isto, e e o ponto: uma entrelinha fixa aperta o texto
    // pequeno e afrouxa o grande. Ver `leadingFor` em `visual-kit/src/tokens.ts`.
    const pequeno = render(compose('P', textNode({ fontSize: 11 })));
    const pequenoLead = Number(pequeno.querySelector<HTMLElement>('.vsl-box')?.style.lineHeight);
    act(() => root?.unmount());
    host?.remove();

    const grande = render(compose('G', textNode({ fontSize: 44 })));
    const grandeLead = Number(grande.querySelector<HTMLElement>('.vsl-box')?.style.lineHeight);

    expect(pequenoLead).toBeGreaterThan(grandeLead);
    expect(grandeLead).toBeGreaterThanOrEqual(1.15);
  });

  it('o fundo so existe quando o interruptor esta ligado', () => {
    const sem = render(compose('Sem', textNode({ showBackground: false, background: '#ff0000' })));
    expect(sem.querySelector<HTMLElement>('.vsl-box')?.style.backgroundColor).toBe('');
    act(() => root?.unmount());
    host?.remove();

    const com = render(compose('Com', textNode({ showBackground: true, background: '#ff0000' })));
    expect(com.querySelector<HTMLElement>('.vsl-box')?.style.backgroundColor).toBe(
      'var(--vislow-hc-surface, #ff0000)',
    );
  });

  it('quebrar e cortar sao classes distintas, e so uma vale por vez', () => {
    const quebra = render(compose('Quebra', textNode({ overflow: 'wrap' })));
    const classeQuebra = quebra.querySelector('.vsl-box')?.className ?? '';
    expect(classeQuebra).toContain('vsl-wrap');
    expect(classeQuebra).not.toContain('vsl-truncate');
    act(() => root?.unmount());
    host?.remove();

    const corta = render(compose('Corta', textNode({ overflow: 'truncate' })));
    const classeCorta = corta.querySelector('.vsl-box')?.className ?? '';
    expect(classeCorta).toContain('vsl-truncate');
    expect(classeCorta).not.toContain('vsl-wrap');
  });

  it('filho de canvas sai numa caixa absoluta com a geometria da spec', () => {
    const spec = compose('Posicionado', createNode('text'));
    const posicionado = setNodeRect(spec.root, spec.root.children![0]!.id, {
      x: 25,
      y: 10,
      w: 50,
      h: 40,
    })!;

    const dom = render({ ...spec, root: posicionado });
    const slot = dom.querySelector<HTMLElement>('.vsl-slot');

    expect(slot).not.toBeNull();
    expect(slot?.style.left).toBe('25%');
    expect(slot?.style.top).toBe('10%');
    expect(slot?.style.width).toBe('50%');
    expect(slot?.style.height).toBe('40%');
  });

  it('num container que empilha nao ha caixa nenhuma', () => {
    const spec = createEmptySpec('Empilhado');
    const empilhado = setNodeProps(spec.root, spec.root.id, { placement: 'stack' })!;
    const comFilho = insertChild(empilhado, spec.root.id, createNode('text'))!;

    const dom = render({ ...spec, root: comFilho });

    expect(dom.querySelector('.vsl-slot')).toBeNull();
    expect(dom.textContent).not.toContain(NAO_RENDERIZOU);
  });

  it('container aninhado desenha os filhos', () => {
    const interno = createNode('container');
    const spec = compose('Aninhado', {
      ...interno,
      children: [textNode({ content: 'La dentro' })],
    });

    const dom = render(spec);
    expect(dom.textContent).toContain('La dentro');
    expect(dom.textContent).not.toContain(NAO_RENDERIZOU);
  });

  it('o i-esimo filho da spec e o i-esimo elemento no DOM', () => {
    // A alca fantasma acha o elemento de um no descendo pelos INDICES da spec
    // (`indexPath` + `elementAt`, no `StackHandles`), porque o preview nao marca
    // no nenhum. Um tipo novo que renderizasse fragmento ou dois irmaos faria a
    // contagem escorregar, e a alca apareceria sobre o no errado — em silencio.
    //
    // EMPILHADO de proposito: e o unico arranjo em que o filho da spec e filho
    // direto do container no DOM. Em canvas o `CanvasSlot` entra no meio, e a
    // contagem passaria por ele em vez de pelos componentes.
    const spec = createEmptySpec('Um elemento por no');
    let raiz = setNodeProps(spec.root, spec.root.id, { placement: 'stack' })!;
    for (const kind of NODE_KINDS) {
      raiz = insertChild(raiz, spec.root.id, nodeOf(kind)) ?? raiz;
    }

    const dom = render({ ...spec, root: raiz });
    const container = dom.querySelector('.vsl-root')?.children[0];

    expect(container?.children).toHaveLength(NODE_KINDS.length);
    expect(dom.textContent).not.toContain(NAO_RENDERIZOU);
  });

  it('a moldura mais externa e a MESMA que o codegen emite', () => {
    // `VisualRoot`, e nao uma string de classes repetida dos dois lados. Se
    // divergisse, o preview teria uma moldura e o pacote entregue outra.
    const dom = render(createEmptySpec('Moldura'));
    expect(dom.querySelector('.vsl-root')).not.toBeNull();
  });
});
