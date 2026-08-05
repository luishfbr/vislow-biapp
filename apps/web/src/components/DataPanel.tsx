'use client';

import { bindingCount } from '@vislow/component-registry';
import { Table2 } from 'lucide-react';
import { COLUMN_TYPE_LABEL, type ColumnType } from '@vislow/config-schema';
import { useState } from 'react';
import { EmptyState } from '@/components/EmptyState';
import { PanelSection } from '@/components/PanelSection';
import { Button } from '@/components/ui/button';
import { DataTableDialog } from '@/components/DataTableDialog';
import { COLUMN_MARK } from '@/lib/columnMarks';
import { useEditorStore } from '@/store/useEditorStore';

/**
 * Os dados do visual, na coluna estreita (RF-09 / mapeamento de campos).
 *
 * Cada COLUNA da tabela de exemplo e, ao mesmo tempo, um campo que o visual vai
 * pedir no Power BI — nao ha duas listas. E o que faz "comecar do zero" ser
 * real: com compilacao por usuario o `capabilities.json` nasce por visual, entao
 * e o USUARIO quem decide quais campos o visual dele exige.
 *
 * Aqui a lista e SO LEITURA: 288px nao comportam uma planilha, e tentar editar
 * rotulo, tipo, papel e valores nesta largura produziria controles de 60px. A
 * edicao inteira mora no dialogo, que tem a largura da tela.
 */

export function DataPanel() {
  const spec = useEditorStore((s) => s.spec);
  const [open, setOpen] = useState(false);

  const { columns, rows } = spec.data;

  return (
    // Faixa propria, com fundo: e a segunda coisa mais olhada da coluna e antes
    // ela era a quarta secao de uma pilha, saindo da tela quando a arvore
    // crescia. Agora ela e um painel com altura negociavel e rolagem propria —
    // quem a separa das camadas e a alca do `PanelResizeHandle`, nao uma borda.
    <PanelSection
      title="Dados de exemplo"
      grow
      className="bg-muted/50 p-3"
      actions={
        <span className="font-mono text-micro tabular-nums text-muted-foreground">
          {columns.length} col · {rows.length} lin
        </span>
      }
    >

      {columns.length === 0 ? (
        // Sem coluna nao ha campo, e sem campo o visual compilado nao tem o que
        // pedir ao Power BI — o export fica bloqueado e nada na tela diria por que.
        <EmptyState icon={Table2} title="Nenhuma coluna ainda" className="min-h-0 flex-1">
          Cada coluna vira um campo que o visual pede no Power BI. Abra a planilha para criar a
          primeira.
        </EmptyState>
      ) : (
      <ul className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
        {columns.map((column) => {
          const used = bindingCount(spec, column.name);
          return (
            <li
              key={column.name}
              className="shrink-0 rounded-md border border-border bg-card px-2 py-1.5"
            >
              <div className="flex items-center gap-1.5">
                {/* O mesmo chip do cabecalho da grade: o usuario reconhece a
                    coluna pelo sinal antes de ler o rotulo. */}
                <TypeMark type={column.type} measure={column.kind === 'measure'} />
                <span className="min-w-0 flex-1 truncate text-body text-foreground">
                  {column.displayName}
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-2 pl-1 text-micro text-muted-foreground">
                <span className="shrink-0">{COLUMN_TYPE_LABEL[column.type].toLowerCase()}</span>
                <span className="min-w-0 truncate font-mono">{column.name}</span>
                {/* Quantos componentes usam a coluna. Esta na tela porque apagar
                    ou trocar o tipo dela DESLIGA esses componentes — o numero e
                    o aviso de quanto vai quebrar, antes de abrir o dialogo. */}
                <span className="ml-auto shrink-0 tabular-nums">
                  {used === 0 ? 'sem uso' : `${String(used)} uso(s)`}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      )}

      {/* Tracejado de proposito: e um convite a abrir a planilha, nao uma acao
          primaria. O `border-dashed` viaja como classe porque a variante
          `outline` do Button nao tem tracejado — e o unico desvio, nao um sexto
          idioma de botao. */}
      <Button
        variant="outline"
        size="sm"
        className="mt-2 w-full border-dashed"
        onClick={() => {
          setOpen(true);
        }}
      >
        Editar dados
      </Button>

      <p className="mt-2 text-micro leading-tight text-muted-foreground">
        Os valores ficam <strong className="font-medium">no editor</strong> e não entram no pacote.
        O que o visual leva são as colunas: no Power BI, elas viram os campos que ele exige.
      </p>

      <DataTableDialog
        open={open}
        onClose={() => {
          setOpen(false);
        }}
      />
    </PanelSection>
  );
}

/**
 * Chip de tipo — a assinatura visual desta feature.
 *
 * O `Σ` marca a coluna que o visual vai SOMAR em vez de agrupar. E a informacao
 * mais consequente da coluna (um "Ano" somado vira um numero sem sentido), e por
 * isso ela viaja em dois canais: o glifo e a cor. So a cor excluiria quem nao a
 * distingue; so o glifo passaria despercebido numa lista de dez.
 */
function TypeMark({ type, measure }: { type: ColumnType; measure: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`shrink-0 rounded px-1 py-0.5 font-mono text-micro leading-none ${
        measure
          ? 'bg-primary/10 text-primary'
          : 'bg-muted text-muted-foreground'
      }`}
    >
      {measure && <span className="mr-0.5">Σ</span>}
      {COLUMN_MARK[type]}
    </span>
  );
}
