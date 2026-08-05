'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * O cabecalho de secao dos paineis.
 *
 * Existe porque a mesma string estava copiada em quatro arquivos —
 * `TreePanel`, `DataPanel`, `PropertiesPanel` e `controls/Field` (duas vezes) —
 * e "copiada" e o estado anterior a "divergente". A quinta secao a ser escrita
 * ia herdar a versao errada de alguma das quatro.
 *
 * MAIUSCULA COM ESPACEJAMENTO, e nao negrito maior. Um painel de instrumento nao
 * tem hierarquia de titulo: as secoes sao rotulos de faixa, todas do mesmo peso,
 * e o que as separa do conteudo e o tratamento, nao o tamanho.
 */
export function PanelSectionHeading({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={cn(
        'text-label font-semibold uppercase tracking-wide text-muted-foreground',
        className,
      )}
    >
      {children}
    </h2>
  );
}

/**
 * Uma faixa de painel: cabecalho, acoes opcionais a direita, e o conteudo.
 *
 * `flex-1` quando a faixa deve esticar (a arvore, a lista de campos); sem ele a
 * faixa fica do tamanho do conteudo.
 */
export function PanelSection({
  title,
  actions,
  grow = false,
  className,
  children,
}: {
  title: string;
  /** Botoes do cabecalho — ficam a direita, na mesma linha do rotulo. */
  actions?: ReactNode;
  grow?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn('flex flex-col', grow && 'min-h-0 flex-1', className)}>
      <div className="mb-1.5 flex shrink-0 items-center justify-between gap-2">
        <PanelSectionHeading>{title}</PanelSectionHeading>
        {actions}
      </div>
      {children}
    </section>
  );
}
