'use client';

import {
  NODE_DESCRIPTORS,
  artboardOf,
  parentOf,
  positionsChildren,
  type DataColumn,
  type FieldSpec,
  type SpecNode,
} from '@vislow/component-registry';
import { COLUMN_TYPE_LABEL } from '@vislow/config-schema';
import { PanelSectionHeading } from '@/components/PanelSection';
import { useMemo, type ReactNode } from 'react';
import {
  ArtboardField,
  ColorField,
  NumberInput,
  RectField,
  SelectField,
  TextField,
  ToggleField,
} from '@/components/controls/Field';
import { selectOptions, tokenOptions } from '@/lib/controls';
import { issuesByNode, type NodeIssues } from '@/lib/issues';
import { selectSelectedNode, useEditorStore } from '@/store/useEditorStore';

/**
 * Painel de propriedades do no selecionado (RF-07).
 *
 * GERADO dos campos do descritor. Nenhuma propriedade e escrita a mao aqui: o
 * mesmo `FieldSpec` que produz o schema de validacao e o codegen produz o
 * controle. Nao ha como o painel oferecer um valor que o schema rejeita, nem
 * esquecer um campo que o codegen exige — sao a mesma lista.
 */

/** Um controle por variante de `FieldSpec`. O `switch` e exaustivo por compilador. */
function Control({
  field,
  node,
  roles,
  error,
  onChange,
  onGestureStart,
  onGestureEnd,
}: {
  field: FieldSpec;
  node: SpecNode;
  roles: readonly DataColumn[];
  error: string | undefined;
  onChange: (value: unknown) => void;
  onGestureStart: () => void;
  onGestureEnd: () => void;
}) {
  const raw = node.props[field.key];

  switch (field.kind) {
    case 'token':
      return (
        <SelectField
          label={field.label}
          hint={field.hint}
          error={error}
          value={typeof raw === 'string' ? raw : field.default}
          options={tokenOptions(field.token)}
          onChange={onChange}
        />
      );

    case 'select':
      return (
        <SelectField
          label={field.label}
          hint={field.hint}
          error={error}
          value={typeof raw === 'string' ? raw : field.default}
          options={selectOptions(field.options)}
          onChange={onChange}
        />
      );

    case 'role': {
      // So papeis do TIPO certo aparecem. Oferecer uma medida onde o campo pede
      // categoria produziria uma spec que o servidor recusa — melhor a lista nem
      // conter a opcao errada.
      const compatible = roles.filter((role) => role.kind === field.roleKind);
      return (
        <SelectField
          label={field.label}
          hint={
            compatible.length === 0
              ? `Nenhum papel de ${field.roleKind === 'grouping' ? 'categoria' : 'medida'} declarado.`
              : field.hint
          }
          error={error}
          value={typeof raw === 'string' ? raw : ''}
          placeholder="Escolha um campo…"
          // O TIPO entra no rotulo: e ele que decide o que o Power BI vai
          // aceitar neste campo, e a lista e o unico lugar em que o usuario
          // escolhe entre colunas sem enxergar a tabela.
          options={compatible.map((role) => ({
            value: role.name,
            label: `${role.displayName} · ${COLUMN_TYPE_LABEL[role.type].toLowerCase()}`,
          }))}
          onChange={onChange}
        />
      );
    }

    case 'color':
      return (
        <ColorField
          label={field.label}
          hint={field.hint}
          error={error}
          value={typeof raw === 'string' ? raw : field.default}
          onChange={onChange}
        />
      );

    case 'boolean':
      return (
        <ToggleField
          label={field.label}
          hint={field.hint}
          error={error}
          value={typeof raw === 'boolean' ? raw : field.default}
          onChange={onChange}
        />
      );

    case 'text':
      return (
        <TextField
          label={field.label}
          hint={field.hint}
          error={error}
          value={typeof raw === 'string' ? raw : field.default}
          maxLength={field.maxLength}
          onChange={onChange}
        />
      );

    // Os dois passam pelo MESMO controle; so muda o sufixo. Um campo em pixel e
    // um campo sem unidade se comportam igual — digitar, arrastar o rotulo,
    // setas de 1 em 1 —, e dar formas diferentes a eles obrigaria o usuario a
    // aprender duas vezes o mesmo gesto.
    case 'number':
      return (
        <NumberInput
          label={field.label}
          hint={field.hint}
          error={error}
          value={typeof raw === 'number' ? raw : field.default}
          min={field.min}
          max={field.max}
          onChange={onChange}
          onGestureStart={onGestureStart}
          onGestureEnd={onGestureEnd}
        />
      );

    case 'length':
      return (
        <NumberInput
          label={field.label}
          hint={field.hint}
          error={error}
          value={typeof raw === 'number' ? raw : field.default}
          min={field.min}
          max={field.max}
          unit="px"
          onChange={onChange}
          onGestureStart={onGestureStart}
          onGestureEnd={onGestureEnd}
        />
      );
  }
}

function errorFor(problems: NodeIssues | undefined, key: string): string | undefined {
  const found = problems?.byField.get(key)?.[0];
  if (!found) return undefined;
  // Mensagem do Ajv para campo de papel nao ligado. Traduzida aqui porque
  // "must have required property" nao diz nada a quem esta montando um visual.
  return found.message.includes('required property') ? 'Escolha um campo.' : found.message;
}

/**
 * O campo esta visivel para este no?
 *
 * A condicao vem do descritor (`showWhen`), nao de uma lista de excecoes aqui:
 * um container que posiciona livremente ignora `direction` e `gap`, e deixar os
 * dois na tela seria oferecer controles que nao fazem nada.
 */
function isVisible(field: FieldSpec, node: SpecNode): boolean {
  if (!field.showWhen) return true;
  const descriptor = NODE_DESCRIPTORS[node.kind];
  const governing = descriptor.fields.find((f) => f.key === field.showWhen?.key);
  const current = node.props[field.showWhen.key];
  const value =
    typeof current === 'string'
      ? current
      : governing && governing.kind !== 'role'
        ? String(governing.default)
        : undefined;
  return value === field.showWhen.equals;
}

/** Moldura comum aos dois estados do painel, para o cabecalho nao divergir. */
function Panel({ eyebrow, title, hint, children }: {
  eyebrow: string;
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <aside className="flex h-full flex-col overflow-y-auto border-l border-border bg-card p-4">
      <header className="mb-3">
        <PanelSectionHeading>{eyebrow}</PanelSectionHeading>
        {/* `truncate` + `title`: o nome do projeto e do usuario e o painel tem
            20rem. Sem isto, um nome longo empurra a coluna e o resto do
            cabecalho sai de posicao. */}
        <p className="mt-0.5 truncate text-sm font-medium text-foreground" title={title}>
          {title}
        </p>
        <p className="text-label leading-tight text-muted-foreground">{hint}</p>
      </header>
      {children}
    </aside>
  );
}

export function PropertiesPanel() {
  const spec = useEditorStore((s) => s.spec);
  const issues = useEditorStore((s) => s.issues);
  const node = useEditorStore(selectSelectedNode);
  const setProp = useEditorStore((s) => s.setProp);
  const setRect = useEditorStore((s) => s.setRect);
  const setArtboard = useEditorStore((s) => s.setArtboard);
  // O registro inteiro, e nao um tamanho por seletor: e uma REFERENCIA vinda do
  // estado (o zustand v5 compara por `Object.is`), e ela so muda quando alguma
  // medida muda de fato — o que acontece ao redimensionar a janela, nao a cada
  // edicao. Um seletor que indexasse aqui construiria valor a cada chamada.
  const containerSizes = useEditorStore((s) => s.containerSizes);
  const beginGesture = useEditorStore((s) => s.beginGesture);
  const endGesture = useEditorStore((s) => s.endGesture);

  const byNode = useMemo(() => issuesByNode(spec, issues), [spec, issues]);

  // Sem selecao, o painel fala do PROJETO. A prancheta vive aqui e nao mais nas
  // propriedades da raiz: ela nunca foi propriedade de um no — nao vem do
  // descritor, nao vai para o pacote, e e a moldura em que TUDO e desenhado.
  // Este e tambem o estado em que o editor abre.
  if (!node) {
    return (
      <Panel
        eyebrow="Projeto"
        title={spec.project.name}
        hint="Nada selecionado. Clique num componente da prancheta para editar."
      >
        <ArtboardField value={artboardOf(spec)} onChange={setArtboard} />
      </Panel>
    );
  }

  const descriptor = NODE_DESCRIPTORS[node.kind];
  const problems = byNode.get(node.id);

  // A geometria e propriedade da RELACAO com o pai: so aparece quando o pai
  // posiciona. Num container que empilha, quem manda no tamanho e a cadeia de
  // flex, e oferecer x/y/w/h seria prometer um controle que nao existe.
  const parent = parentOf(spec.root, node.id);
  const placed = parent && positionsChildren(parent) ? node.rect : undefined;
  const rectError = problems?.all.find((issue) => issue.path.endsWith('.rect'))?.message;

  // O tamanho do PAI em pixel — e ele que converte o percentual da spec no pixel
  // que o campo mostra. Publicado pela camada de manipulacao, que ja cobre
  // exatamente este container.
  const parentSize = parent ? containerSizes[parent.id] : undefined;

  return (
    <Panel eyebrow="Propriedades" title={descriptor.label} hint={descriptor.hint}>
      {placed && (
        <div className="mb-2 border-b border-border pb-1">
          <RectField
            value={placed}
            parent={parentSize}
            error={rectError}
            onChange={(axis, v) => {
              setRect(node.id, { ...placed, [axis]: v });
            }}
          />
        </div>
      )}

      <div className="divide-y divide-border">
        {descriptor.fields.filter((field) => isVisible(field, node)).map((field) => (
          <Control
            key={field.key}
            field={field}
            node={node}
            roles={spec.data.columns}
            error={errorFor(problems, field.key)}
            onChange={(value) => {
              setProp(node.id, field.key, value);
            }}
            onGestureStart={beginGesture}
            onGestureEnd={endGesture}
          />
        ))}
      </div>
    </Panel>
  );
}
