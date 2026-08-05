'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { PROJECT_NAME_MAX_LENGTH } from '@vislow/component-registry';
import { useEffect, type ChangeEvent } from 'react';
import { useForm } from 'react-hook-form';
import { ExportButton } from '@/components/ExportButton';
import { PanelToggles } from '@/components/PanelToggles';
import { ProjectMenu } from '@/components/ProjectMenu';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Toolbar } from '@/components/Toolbar';
import { Badge } from '@/components/ui/badge';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { projectFormSchema, type ProjectFormValues } from '@/lib/projectForm';
import { useEditorStore } from '@/store/useEditorStore';

const NAME_FIELD_ID = 'visual-name';
const NAME_ERROR_ID = 'visual-name-error';

/**
 * A barra do topo: identidade, ferramentas, o projeto, e o que se faz com ele.
 *
 * Quatro zonas, nao uma fila de itens de mesmo peso. A esquerda a identidade e a
 * BARRA DE FERRAMENTAS — que veio da coluna esquerda, onde ocupava altura
 * permanente e disputava espaco com a arvore. No meio a UNICA coisa editavel da
 * barra, o nome. A direita as acoes. A folga do meio e onde a mensagem de erro
 * aparece — as acoes estao presas a direita, e e isso que impede a barra de
 * reflowar a cada tecla que valida ou desvalida.
 *
 * O ROTULO DO NOME SOME ABAIXO DE 1280px. Nessa largura a barra tem de escolher
 * entre o rotulo e as ferramentas, e as ferramentas sao o que se usa a cada
 * minuto; o campo continua rotulado para o leitor de tela pelo `sr-only`.
 *
 * A versao fica COLADA no botao de export de proposito. Ela nao e enfeite: o
 * `packageVersion` e o que faz o Power BI atualizar o visual em vez de duplicar
 * (RF-10), e ele sobe a cada exportacao. Vizinhas, da para ver o numero andar
 * logo depois de clicar no botao que o mexeu.
 */
export function Header() {
  const spec = useEditorStore((s) => s.spec);
  const rename = useEditorStore((s) => s.rename);

  const storedName = spec.project.name;

  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: { name: storedName },
    // `onChange` porque a store recebe cada tecla: a mensagem tem de contar a
    // mesma historia que o botao de export, e ele desabilita na hora.
    mode: 'onChange',
  });

  const nameError = form.formState.errors.name;

  /**
   * Ressincroniza quando a spec troca POR FORA — "Novo projeto" e "Importar
   * projeto (.json)" trocam `project.name` sem passar por aqui.
   *
   * A comparacao antes do `reset` nao e otimizacao: digitar tambem muda
   * `storedName` (o campo escreve na store a cada tecla), e um `reset` a cada
   * tecla apagaria o estado de validacao no meio da digitacao. So difere quando
   * a mudanca veio de outro lugar.
   */
  useEffect(() => {
    if (form.getValues('name') !== storedName) form.reset({ name: storedName });
  }, [form, storedName]);

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-card px-4">
      <span className="shrink-0 text-sm font-semibold tracking-tight text-foreground">Vislow</span>

      <span aria-hidden className="h-5 w-px shrink-0 bg-border" />

      <Toolbar />

      <span aria-hidden className="h-5 w-px shrink-0 bg-border" />

      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Field orientation="horizontal" className="w-auto gap-2">
          <FieldLabel
            htmlFor={NAME_FIELD_ID}
            // `sr-only`, e nao `hidden`: `display:none` tiraria o rotulo da
            // arvore de acessibilidade tambem, e o campo ficaria sem nome
            // abaixo de 1280px. Assim ele so deixa de ser DESENHADO.
            className="sr-only flex-none text-xs font-normal text-muted-foreground xl:not-sr-only"
          >
            Nome do visual
          </FieldLabel>
          <Input
            id={NAME_FIELD_ID}
            className="w-40 xl:w-64"
            // O teto do campo e o DOBRO do teto do nome, nao ele mesmo. Um
            // `maxLength={50}` recusaria a 51a tecla em silencio — que e o modo
            // de falhar que esta casa nao aceita — e a mensagem de maximo nunca
            // apareceria. Aqui o usuario passa do limite, LE por que, e corrige.
            maxLength={PROJECT_NAME_MAX_LENGTH * 2}
            autoComplete="off"
            aria-invalid={nameError !== undefined}
            aria-describedby={nameError === undefined ? undefined : NAME_ERROR_ID}
            // A store recebe o valor SEMPRE, valido ou nao. E o que preserva a
            // RN-03: quem barra o export e o `validateSpec` sobre a spec, e ele
            // precisa enxergar o nome ruim para travar. O zod aqui so antecipa a
            // mensagem.
            {...form.register('name', {
              onChange: (event: ChangeEvent<HTMLInputElement>) => {
                rename(event.target.value);
              },
            })}
          />
          {/* `polite`, e nao o `role="alert"` que o `FieldError` traz de fabrica.
              A validacao roda a cada tecla: assertivo interromperia a leitura do
              leitor de tela a cada caractere digitado. Mesma escolha que o
              `ArtboardField` ja fazia pelo mesmo motivo. */}
          <FieldError id={NAME_ERROR_ID} className="text-xs" role="status" aria-live="polite">
            {nameError?.message}
          </FieldError>
        </Field>
      </div>

      {/* Controles de VISTA, agrupados: mostrar/ocultar coluna e o tema mudam o
          que se ve, nunca o projeto. Ficam aqui e nao flutuando sobre o shell —
          sobre ele, com a coluna aberta, cobriam o conteudo dela. */}
      <PanelToggles />

      <ThemeToggle />

      {/* Acoes de arquivo do PROJETO — vieram da coluna esquerda, onde
          ocupavam altura permanente para uso ocasional. Ficam a esquerda do
          export porque o export e a acao principal, e a principal e a ultima. */}
      <ProjectMenu />

      <Badge
        variant="secondary"
        className="font-normal tabular-nums"
        title="Versao do pacote — sobe a cada exportacao"
      >
        v{spec.project.packageVersion}
      </Badge>

      {/* O botao fica desabilitado com spec invalida: RN-03 impede pedir uma
          build que o servidor recusaria de qualquer forma. */}
      <ExportButton />
    </header>
  );
}
