// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorStore } from '@/store/useEditorStore';
import { StatusBar } from './StatusBar';

/**
 * A barra do pacote.
 *
 * O teste que mais importa aqui e o do EXPORT: ele guarda a resposta do achado
 * 40, que ja custou uma sessao inteira de diagnostico — "o arquivo que importei
 * no Desktop veio desta tela?". Enquanto nada foi exportado nesta sessao, a
 * barra tem de ficar CALADA: um horario inventado seria pior do que nenhum.
 */

let container: HTMLDivElement;
let root: Root;

beforeAll(() => {
  Object.assign(window, { IS_REACT_ACT_ENVIRONMENT: true });
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  });
});

beforeEach(() => {
  useEditorStore.getState().newProject('Painel de vendas');
  useEditorStore.setState({ lastExportedAt: null });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

function render(): void {
  act(() => {
    root.render(<StatusBar />);
  });
}

const texto = (): string => container.textContent;

describe('o que a barra conta sobre a composicao', () => {
  it('nao conta a raiz: um projeto vazio tem zero componentes', () => {
    render();
    expect(texto()).toContain('0 componentes');
  });

  it('conta os componentes acrescentados', () => {
    act(() => {
      useEditorStore.getState().addNode('text');
      useEditorStore.getState().addNode('text');
    });
    render();
    expect(texto()).toContain('2 componentes');
  });

  it('usa o singular quando ha um so', () => {
    act(() => {
      useEditorStore.getState().addNode('text');
    });
    render();
    expect(texto()).toContain('1 componente');
    expect(texto()).not.toContain('1 componentes');
  });

  it('conta as colunas da tabela como campos', () => {
    const esperado = useEditorStore.getState().spec.data.columns.length;
    render();
    expect(texto()).toContain(`${String(esperado)} campo`);
  });
});

describe('a procedencia do pacote (achado 40)', () => {
  it('fica calada enquanto nada foi exportado nesta sessao', () => {
    render();
    expect(texto()).not.toContain('exportado');
  });

  it('mostra a hora depois do export', () => {
    act(() => {
      useEditorStore.setState({ lastExportedAt: new Date(2026, 7, 4, 14, 32).getTime() });
    });
    render();
    expect(texto()).toContain('exportado 14:32');
  });

  it('mostra a versao do pacote, que e o que o Power BI usa para atualizar', () => {
    render();
    expect(texto()).toContain(`v${useEditorStore.getState().spec.project.packageVersion}`);
  });
});

describe('as pendencias', () => {
  it('somem quando nao ha nenhuma', () => {
    render();
    expect(texto()).not.toContain('pend');
  });

  it('aparecem quando um campo fica com valor que o schema recusa', () => {
    // Todo no NASCE valido na spec 5.0.0 — nao ha mais campo sem default, entao
    // largar um componente na prancheta nao produz pendencia nenhuma. Quem
    // produz e um valor invalido digitado depois, e o caminho real para isso e o
    // campo hexadecimal: ele grava a cada tecla, e `#12` e invalido no caminho
    // para `#123456`. E o estado NORMAL de quem esta escolhendo uma cor, e por
    // isso a barra o chama de pendencia em ambar, e nao de erro em vermelho.
    act(() => {
      useEditorStore.getState().addNode('text');
    });
    const id = useEditorStore.getState().spec.root.children?.[0]?.id;
    expect(id, 'o texto nao foi criado').toBeDefined();
    act(() => {
      useEditorStore.getState().setProp(id!, 'color', '#12');
    });
    render();
    expect(texto()).toContain('pendência');
  });
});
