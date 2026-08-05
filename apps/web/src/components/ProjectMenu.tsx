'use client';

import { FileDown, FilePlus2, FileUp, MoreHorizontal } from 'lucide-react';
import { useRef, useState } from 'react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { downloadJson } from '@/lib/persistence';
import { useEditorStore } from '@/store/useEditorStore';

/**
 * Acoes de PROJETO — novo, exportar JSON, importar JSON.
 *
 * Saiu da coluna esquerda porque nao pertencia a ela: aquela coluna e sobre a
 * composicao, e tres botoes de arquivo ocupavam nela o espaco vertical que a
 * arvore e os campos disputam a cada nova linha. Sao acoes raras — uma por
 * sessao, no maximo — e acao rara paga aluguel caro num painel permanente.
 *
 * Nao confundir com o export do visual: o botao ao lado baixa o `.pbiviz`, que e
 * o produto. Aqui e o PROJETO, o JSON que se reabre no editor.
 *
 * ATE 2026-08-04 ESTE ARQUIVO REIMPLEMENTAVA UM MENU. Eram ~90 linhas de foco em
 * roda por `querySelectorAll`, escuta de `pointerdown` no documento, tratamento
 * de `Escape` e devolucao de foco ao gatilho — tudo ja resolvido pelo
 * `ui/dropdown-menu.tsx`, que estava instalado e que o `ThemeToggle` ja usava. De
 * quebra vieram o portal e a deteccao de colisao: o menu antigo era um
 * `absolute right-0 z-10` dentro do flex da barra, sujeito a recorte.
 *
 * As DUAS acoes que apagam o historico agora confirmam. Ver `ConfirmDialog`.
 */

type Pendente = 'novo' | 'importar';

export function ProjectMenu() {
  const spec = useEditorStore((s) => s.spec);
  const newProject = useEditorStore((s) => s.newProject);
  const importSpec = useEditorStore((s) => s.importSpec);

  const [pendente, setPendente] = useState<Pendente | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File): Promise<void> => {
    setImportError(null);
    try {
      const result = importSpec(JSON.parse(await file.text()));
      if (!result.ok) {
        const first = result.issues[0];
        setImportError(first ? `${first.path}: ${first.message}` : 'Projeto invalido.');
      }
    } catch {
      setImportError('Arquivo nao e um JSON valido.');
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Ações do projeto"
              title="Ações do projeto"
            >
              <MoreHorizontal />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem
            onClick={() => {
              setPendente('novo');
            }}
          >
            <FilePlus2 />
            Novo projeto
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              downloadJson(spec);
            }}
          >
            <FileDown />
            Exportar projeto (.json)
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              setPendente('importar');
            }}
          >
            <FileUp />
            Importar projeto (.json)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={pendente === 'novo'}
        title="Começar um projeto novo?"
        description="A composição atual, os dados de exemplo e o histórico de desfazer são descartados. Exporte o projeto (.json) antes se quiser voltar a ele."
        confirmLabel="Descartar e começar"
        onConfirm={() => {
          setPendente(null);
          newProject('Meu visual');
        }}
        onCancel={() => {
          setPendente(null);
        }}
      />

      <ConfirmDialog
        open={pendente === 'importar'}
        title="Importar um projeto?"
        description="O arquivo escolhido substitui a composição atual e o histórico de desfazer. Exporte o projeto (.json) antes se quiser voltar a ele."
        confirmLabel="Escolher arquivo"
        onConfirm={() => {
          setPendente(null);
          // O seletor de arquivo abre DEPOIS da confirmacao, e nao antes: um
          // dialogo de arquivo do sistema por cima de um dialogo modal e um lugar
          // de onde e facil sair sem saber o que foi cancelado.
          fileInput.current?.click();
        }}
        onCancel={() => {
          setPendente(null);
        }}
      />

      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
          // Zerado para que escolher o MESMO arquivo de novo volte a disparar
          // `change` — sem isto, corrigir o arquivo e reimportar nao faria nada.
          event.target.value = '';
        }}
      />

      {importError !== null && (
        <ConfirmDialog
          open
          destructive={false}
          showCancel={false}
          title="Não deu para importar"
          description={importError}
          confirmLabel="Entendi"
          onConfirm={() => {
            setImportError(null);
          }}
          onCancel={() => {
            setImportError(null);
          }}
        />
      )}
    </>
  );
}
