'use client';

import {
  NODE_DESCRIPTORS,
  artboardOf,
  parentOf,
  positionsChildren,
  type DataRole,
  type FieldSpec,
  type SpecNode,
} from '@vislow/component-registry';
import { useMemo } from 'react';
import {
  ArtboardField,
  ColorField,
  NumberField,
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
}: {
  field: FieldSpec;
  node: SpecNode;
  roles: readonly DataRole[];
  error: string | undefined;
  onChange: (value: unknown) => void;
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
          placeholder="Escolha um campo..."
          options={compatible.map((role) => ({ value: role.name, label: role.displayName }))}
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

    case 'number':
      return (
        <NumberField
          label={field.label}
          hint={field.hint}
          error={error}
          value={typeof raw === 'number' ? raw : field.default}
          min={field.min}
          max={field.max}
          onChange={onChange}
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

export function PropertiesPanel() {
  const spec = useEditorStore((s) => s.spec);
  const issues = useEditorStore((s) => s.issues);
  const node = useEditorStore(selectSelectedNode);
  const setProp = useEditorStore((s) => s.setProp);
  const setRect = useEditorStore((s) => s.setRect);
  const setArtboard = useEditorStore((s) => s.setArtboard);

  const byNode = useMemo(() => issuesByNode(spec, issues), [spec, issues]);
  const descriptor = NODE_DESCRIPTORS[node.kind];
  const problems = byNode.get(node.id);

  // A geometria e propriedade da RELACAO com o pai: so aparece quando o pai
  // posiciona. Num container que empilha, quem manda no tamanho e a cadeia de
  // flex, e oferecer x/y/w/h seria prometer um controle que nao existe.
  const parent = parentOf(spec.root, node.id);
  const placed = parent && positionsChildren(parent) ? node.rect : undefined;
  const rectError = problems?.all.find((issue) => issue.path.endsWith('.rect'))?.message;

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col overflow-y-auto border-l border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <header className="mb-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Propriedades
        </h2>
        <p className="mt-0.5 text-sm font-medium text-slate-800 dark:text-slate-100">
          {descriptor.label}
        </p>
        <p className="text-[11px] leading-tight text-slate-500">{descriptor.hint}</p>
      </header>

      {/* A prancheta ocupa o mesmo lugar que a geometria, e pelo mesmo motivo:
          nao vem do descritor e nao e propriedade do componente. Os dois nunca
          aparecem juntos — a raiz nao tem pai, entao nao tem caixa; quem tem
          caixa nao e a raiz. */}
      {node.id === spec.root.id && (
        <div className="mb-2 border-b border-slate-100 pb-1 dark:border-slate-800">
          <ArtboardField value={artboardOf(spec)} onChange={setArtboard} />
        </div>
      )}

      {placed && (
        <div className="mb-2 border-b border-slate-100 pb-1 dark:border-slate-800">
          <RectField
            value={placed}
            error={rectError}
            onChange={(axis, v) => {
              setRect(node.id, { ...placed, [axis]: v });
            }}
          />
        </div>
      )}

      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {descriptor.fields.filter((field) => isVisible(field, node)).map((field) => (
          <Control
            key={field.key}
            field={field}
            node={node}
            roles={spec.dataRoles}
            error={errorFor(problems, field.key)}
            onChange={(value) => {
              setProp(node.id, field.key, value);
            }}
          />
        ))}
      </div>
    </aside>
  );
}
