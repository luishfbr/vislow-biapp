'use client';

import { AddComponentButton } from '@/components/AddComponentDialog';
import { DataPanel } from '@/components/DataPanel';
import { TreePanel } from '@/components/TreePanel';

/**
 * Coluna esquerda do editor: o que existe e a que dados o visual vai se ligar.
 *
 * Tres faixas, do gesto mais frequente para o mais raro: adicionar, compor,
 * declarar os dados. A paleta empilhada saiu daqui para um dialogo com busca
 * (`AddComponentDialog`) e as acoes de arquivo foram para o menu do header —
 * as duas ocupavam altura permanente para acoes que a pessoa faz uma vez.
 *
 * Quem rola e cada faixa, nunca a coluna: com um scroll unico no `<aside>`, uma
 * arvore de vinte nos empurrava "Dados de exemplo" para fora da tela, e a coluna
 * que falta ligar e exatamente o que bloqueia o export.
 */
export function ProjectPanel() {
  return (
    <aside className="flex h-full w-72 shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <div className="shrink-0 p-3">
        <AddComponentButton />
      </div>
      <TreePanel />
      <DataPanel />
    </aside>
  );
}
