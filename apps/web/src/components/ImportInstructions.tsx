'use client';

import { DialogFooter, DialogFrame, DialogHeader } from '@/components/DialogFrame';
import { Button } from '@/components/ui/button';

/**
 * Instrucoes de importacao no Power BI (RF-13).
 *
 * Aparece depois de um export bem-sucedido, porque e exatamente ali que o
 * usuario nao sabe o que fazer com o arquivo que acabou de baixar. Usa o
 * `<dialog>` nativo: Esc, backdrop e retencao de foco vem de graca, e nao ha
 * biblioteca de modal no projeto.
 *
 * Os passos saem daqui como componente proprio (`ImportSteps`) porque o dialogo
 * de compilacao termina neles: quando o pacote fica pronto, e o MESMO dialogo
 * que passa a mostra-los, em vez de fechar e abrir outro por cima. Este dialogo
 * continua existindo para o link "Como importar", que e consultado fora do
 * fluxo de export.
 */

const STEPS: { title: string; detail: string }[] = [
  {
    title: 'Abra o Power BI Desktop ou o Service',
    detail: 'No Desktop, a faixa "Inserir". No Service, o painel de visualizacoes do relatorio.',
  },
  {
    title: 'Visualizações → ⋯ → Importar um visual de um arquivo',
    detail: 'Selecione o .pbiviz que acabou de ser baixado e confirme o aviso de visual nao certificado.',
  },
  {
    title: 'Insira o visual e arraste os campos',
    detail: 'Categoria / Eixo recebe a dimensao; Valor recebe a medida. O visual nao acessa seu modelo.',
  },
  {
    title: 'Para atualizar depois',
    detail:
      'Reexporte o MESMO projeto e importe de novo: o identificador e reusado, entao o Power BI atualiza o visual existente em vez de duplicar.',
  },
];

/** So a lista. Sem dialogo, sem cabecalho — quem monta a moldura e quem usa. */
export function ImportSteps() {
  return (
    <ol className="flex flex-col gap-3 px-5 py-4">
      {STEPS.map((step, index) => (
        <li key={step.title} className="flex gap-3">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-label font-semibold text-primary">
            {index + 1}
          </span>
          <div>
            <p className="text-xs font-medium">{step.title}</p>
            <p className="mt-0.5 text-label leading-relaxed text-muted-foreground">
              {step.detail}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export interface ImportInstructionsProps {
  open: boolean;
  filename: string;
  onClose: () => void;
}

export function ImportInstructions({ open, filename, onClose }: ImportInstructionsProps) {
  return (
    <DialogFrame open={open} onClose={onClose} labelledBy="import-instructions-title">
      <DialogHeader id="import-instructions-title" title="Pacote gerado">
        <p className="mt-1 break-all font-mono text-label text-muted-foreground">{filename}</p>
      </DialogHeader>

      <ImportSteps />

      <DialogFooter>
        <Button size="sm" onClick={onClose}>
          Entendi
        </Button>
      </DialogFooter>
    </DialogFrame>
  );
}
