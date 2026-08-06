import type { ReactNode } from 'react';

/**
 * A moldura mais externa do visual — a que envolve a arvore inteira.
 *
 * ============================ POR QUE E UM COMPONENTE ========================
 * Ate a spec 4.0.0 isto era uma STRING de classes, escrita duas vezes: uma no
 * `SpecPreview` do editor e outra dentro do template de codegen. As duas
 * precisavam ser identicas — e a igualdade era mantida por atencao humana, sem
 * nada conferindo. Divergir ali nao quebra teste nenhum: o preview passa a
 * desenhar numa moldura, o pacote entregue em outra, e a diferenca so aparece
 * dentro do Power BI.
 *
 * Sendo componente, o preview e o fonte gerado passam a IMPORTAR a mesma coisa.
 * Nao ha mais duas strings para manter iguais.
 * ============================================================================
 *
 * `w-full h-full` de proposito: um visual do Power BI NAO escolhe o proprio
 * tamanho — quem escolhe e o autor do relatorio, arrastando a moldura. A
 * prancheta do editor (`project.artboard`) e do editor e nunca chega aqui.
 */
export function VisualRoot({ children }: { children?: ReactNode }) {
  return <div className="vsl-root">{children}</div>;
}
