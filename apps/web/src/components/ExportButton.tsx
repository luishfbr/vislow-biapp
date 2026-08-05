'use client';

import { Download } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { requestBuild, type BuildPhase } from '@/lib/buildApi';
import { triggerDownload } from '@/lib/persistence';
import { selectCanExport, useEditorStore } from '@/store/useEditorStore';
import { BuildProgressDialog } from './BuildProgressDialog';
import { ImportInstructions } from './ImportInstructions';

/**
 * Botao de export (RF-11 / RF-12).
 *
 * Depois do ADR-08 o pacote nao e mais montado no browser: a spec sobe, o
 * servidor COMPILA um projeto pbiviz de verdade e devolve o artefato. A espera
 * passou a existir — ~12 s medidos —, e o botao sozinho nao dava conta dela: um
 * rotulo trocando dentro de 120 px e, na pratica, silencio.
 *
 * Entao aqui sobrou o gatilho. A espera inteira — bloqueio da tela, barra por
 * etapa, erro e instrucoes de importacao — vive no `BuildProgressDialog`, que e
 * modal justamente para que ninguem edite uma composicao que ja subiu.
 */

export function ExportButton() {
  const spec = useEditorStore((s) => s.spec);
  const markExported = useEditorStore((s) => s.markExported);
  const canExport = useEditorStore(selectCanExport);
  const [phase, setPhase] = useState<BuildPhase>({ kind: 'idle' });
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [lastFileName, setLastFileName] = useState('');

  const busy = phase.kind === 'uploading' || phase.kind === 'queued' || phase.kind === 'running';
  const disabled = !canExport || busy;

  /**
   * Fechar a aba no meio da build perde o download: o artefato fica preso no
   * servidor ate o TTL, e nao ha como pedir "aquele mesmo pacote" de novo. O
   * aviso so existe enquanto ha o que perder.
   */
  useEffect(() => {
    if (!busy) return;
    const warn = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
    };
  }, [busy]);

  /**
   * O botao e `aria-disabled`, nao `disabled`, e essa guarda e o preco disso.
   *
   * A troca existe porque o motivo de nao dar para exportar so serve enquanto
   * nao da: elemento `disabled` nao recebe evento de ponteiro em navegador
   * nenhum, entao o tooltip nunca abriria justamente no estado em que a frase
   * importa. `aria-disabled` anuncia a mesma coisa ao leitor de tela e mantem o
   * foco e o hover — mas o clique CHEGA, e quem recusa e este `return`.
   */
  const handleExport = async () => {
    if (disabled) return;

    const result = await requestBuild(spec, setPhase);

    if (result.kind === 'error') {
      setPhase(result);
      return;
    }

    triggerDownload(result.blob, result.fileName);
    setLastFileName(result.fileName);
    setPhase({ kind: 'done', fileName: result.fileName, metrics: result.metrics });
    // Depois do export, nao antes: o pacote leva a versao com que foi gerado, e
    // a proxima exportacao sobe para uma versao maior — e o que faz o Power BI
    // atualizar o visual em vez de duplicar (RF-10).
    markExported();
  };

  return (
    <>
      <div className="flex items-center gap-2">
        {lastFileName !== '' && (
          <Button
            variant="link"
            size="sm"
            onClick={() => {
              setInstructionsOpen(true);
            }}
          >
            Como importar
          </Button>
        )}

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                onClick={() => {
                  void handleExport();
                }}
                aria-disabled={disabled}
                aria-busy={busy}
                className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
              >
                <Download aria-hidden />
                Baixar .pbiviz
              </Button>
            }
          />
          <TooltipContent>
            {canExport
              ? 'Compila o visual no servidor e baixa o pacote'
              : 'Resolva os campos pendentes para exportar'}
          </TooltipContent>
        </Tooltip>
      </div>

      <BuildProgressDialog
        phase={phase}
        // Antes do fim o nome do arquivo ainda nao voltou do servidor, e ele e
        // derivado do nome do projeto — que e o que o usuario reconhece.
        fileName={phase.kind === 'done' ? phase.fileName : `${spec.project.name}.pbiviz`}
        onRetry={() => {
          void handleExport();
        }}
        onClose={() => {
          setPhase({ kind: 'idle' });
        }}
      />

      <ImportInstructions
        open={instructionsOpen}
        filename={lastFileName}
        onClose={() => {
          setInstructionsOpen(false);
        }}
      />
    </>
  );
}
