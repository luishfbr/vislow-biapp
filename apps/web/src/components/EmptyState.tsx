'use client';

import type { ComponentType, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * O estado vazio dos paineis.
 *
 * O Definition of Done pede vazio e erro desenhados, nao so o caminho feliz — e
 * a mesma regra que o `visual-kit` ja segue (RN-04: o visual nunca renderiza em
 * branco). Um painel vazio sem texto nao diz se esta carregando, se quebrou ou se
 * simplesmente nao ha nada, e as tres exigem reacoes diferentes.
 *
 * TELA VAZIA E CONVITE, NAO AVISO. A frase diz o que fazer em seguida, com o
 * verbo da acao que existe na tela — nao "nenhum item encontrado".
 */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  className,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  /** Uma frase curta com o proximo passo. */
  children: ReactNode;
  /** O botao que faz esse proximo passo, quando ele cabe aqui. */
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 px-4 py-8 text-center',
        className,
      )}
    >
      <Icon className="size-5 text-muted-foreground/60" />
      <p className="text-body font-medium text-foreground">{title}</p>
      <p className="max-w-[26ch] text-pretty text-label leading-relaxed text-muted-foreground">
        {children}
      </p>
      {action}
    </div>
  );
}
