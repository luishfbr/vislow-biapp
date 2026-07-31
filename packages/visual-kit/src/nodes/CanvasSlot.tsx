import type { ReactNode } from 'react';

/**
 * A caixa de um filho dentro de um container que posiciona livremente.
 *
 * Nao e um tipo de no: nao esta no registro, nao aparece na paleta e o usuario
 * nunca o adiciona. E o embrulho que o preview e o codegen colocam em volta de
 * cada filho de um canvas — os dois, pela mesma regra (`positionsChildren`),
 * porque preview e pacote entregue precisam concordar (ADR-04).
 *
 * PERCENTUAL, e nao pixel: um visual do Power BI nao tem tamanho, e a mesma
 * composicao vale numa moldura de 400 ou de 1600. Vai por `style` inline pelo
 * mesmo motivo que a cor — percentual arbitrario nao tem como ser classe
 * literal, e classe interpolada some sem erro dentro do Power BI.
 *
 * O `absolute` com tamanho declarado e o que INVERTE a preocupacao da ADR-14:
 * este elemento nao entra na cadeia de flex que o `ResponsiveContainer` usa para
 * medir. Ele proprio e o bloco de contencao, com altura resolvida antes de o
 * grafico medir qualquer coisa.
 *
 * O `overflow-hidden` e a politica de transbordo do produto: um KPI de fonte
 * grande numa caixa baixa e cortado, nunca escorre por cima do vizinho. Perder o
 * fim de um numero e ruim; dois numeros embaralhados um sobre o outro e pior, e
 * nao ha como o usuario descobrir de quem e a culpa.
 */
export function CanvasSlot({
  x,
  y,
  w,
  h,
  children,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  children?: ReactNode;
}) {
  return (
    <div
      // `min-h-0`/`min-w-0` pelo mesmo motivo do `Container`: sem eles um filho
      // flexivel nunca encolhe abaixo do proprio conteudo e o grafico mede
      // altura zero — invisivel, e sem erro nenhum.
      className="pbi:absolute pbi:flex pbi:min-h-0 pbi:min-w-0 pbi:overflow-hidden"
      style={{
        left: `${String(x)}%`,
        top: `${String(y)}%`,
        width: `${String(w)}%`,
        height: `${String(h)}%`,
      }}
    >
      {children}
    </div>
  );
}
