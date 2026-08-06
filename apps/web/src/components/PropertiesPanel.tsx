'use client';

import {
  NODE_DESCRIPTORS,
  NODE_NAME_MAX_LENGTH,
  artboardOf,
  isExposable,
  parentOf,
  positionsChildren,
  selectOptions,
  tokenOptions,
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
  PublishToggle,
  RectField,
  SelectField,
  TextField,
  ToggleField,
} from '@/components/controls/Field';
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
  publish,
  onChange,
  onGestureStart,
  onGestureEnd,
}: {
  field: FieldSpec;
  node: SpecNode;
  roles: readonly DataColumn[];
  error: string | undefined;
  /** O alternador de publicacao, ou nada num campo que nao pode ser publicado. */
  publish: ReactNode;
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
          publish={publish}
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
          publish={publish}
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
          publish={publish}
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
          publish={publish}
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
          publish={publish}
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
          publish={publish}
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
          publish={publish}
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
          publish={publish}
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

  // O valor ATUAL manda, e ele nao e necessariamente string: `showBackground` e
  // booleano e governa a cor de fundo. Enquanto so `string` era aceita, um
  // governante booleano caia direto no `default` do descritor — o campo
  // governado ficava congelado na visibilidade inicial e o interruptor nao fazia
  // nada na tela.
  const current = node.props[field.showWhen.key];
  if (typeof current === 'string' || typeof current === 'boolean' || typeof current === 'number') {
    return String(current) === field.showWhen.equals;
  }

  // Prop ausente: cai no default do descritor. Campo de papel nao tem default e
  // nao governa nada.
  const governing = NODE_DESCRIPTORS[node.kind].fields.find((f) => f.key === field.showWhen?.key);
  return (
    governing !== undefined &&
    governing.kind !== 'role' &&
    String(governing.default) === field.showWhen.equals
  );
}

/**
 * Reparte os campos pelas secoes do descritor, na ordem da PRIMEIRA aparicao.
 *
 * O gemeo disto vive em `buildFormattingModel`, no template do visual gerado: os
 * dois paineis leem o mesmo `group` do registro, entao o autor ve no editor a
 * mesma divisao que o consumidor ve dentro do Power BI.
 *
 * Campo sem grupo cai numa secao de nome vazio, que nao desenha cabecalho — e por
 * isso que `container` e `text` continuam sendo a lista corrida de sempre.
 */
function sectionsOf(fields: FieldSpec[]): { name: string; fields: FieldSpec[] }[] {
  const sections: { name: string; fields: FieldSpec[] }[] = [];

  for (const field of fields) {
    const name = field.group ?? '';
    let section = sections.find((candidate) => candidate.name === name);
    if (!section) {
      section = { name, fields: [] };
      sections.push(section);
    }
    section.fields.push(field);
  }

  return sections;
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
  const setNodeName = useEditorStore((s) => s.setNodeName);
  const setFieldExposed = useEditorStore((s) => s.setFieldExposed);
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
  const exposed = node.exposed ?? [];

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

      {/* So aparece depois da primeira publicacao. Um campo de apelido num no
          que nao publica nada seria um controle sem efeito nenhum — e o apelido
          existe justamente para batizar o card que passou a existir. */}
      {exposed.length > 0 && (
        <section className="mb-2 border-b border-border pb-2">
          <PanelSectionHeading className="mb-1.5">Painel de formatacao</PanelSectionHeading>
          <TextField
            label="Apelido"
            hint="Titulo do card no painel do Power BI."
            value={node.name ?? ''}
            maxLength={NODE_NAME_MAX_LENGTH}
            // Vazio, o card se chama pelo rotulo do descritor. O campo mostra
            // qual e esse nome em vez de ficar em branco.
            placeholder={descriptor.label}
            onChange={(value) => {
              setNodeName(node.id, value);
            }}
          />
        </section>
      )}

      {sectionsOf(descriptor.fields.filter((field) => isVisible(field, node))).map((section) => (
        <section key={section.name}>
          {/* Sem nome, sem cabecalho: `container` e `text` nao declaram secao, e
              o painel deles continua sendo a lista corrida de sempre. */}
          {section.name !== '' && (
            <PanelSectionHeading className="mb-1.5 mt-3">{section.name}</PanelSectionHeading>
          )}
          {/* O `divide-y` embrulha SO os campos. Com o cabecalho dentro dele, a
              linha caia entre o titulo e o primeiro campo, e a fronteira entre
              secoes ficava sem linha nenhuma — as reguas nos lugares errados. */}
          <div className="divide-y divide-border">
          {section.fields.map((field) => (
          <Control
            key={field.key}
            field={field}
            node={node}
            roles={spec.data.columns}
            error={errorFor(problems, field.key)}
            // Campo estrutural nao ganha alternador, e a celula fica vazia: o
            // codegen ja gastou a escolha para decidir a forma da arvore, e um
            // alternador ali prometeria um controle que o pacote nao tem como
            // obedecer.
            publish={
              isExposable(field) ? (
                <PublishToggle
                  label={field.label}
                  exposed={exposed.includes(field.key)}
                  onToggle={(next) => {
                    setFieldExposed(node.id, field.key, next);
                  }}
                />
              ) : null
            }
            onChange={(value) => {
              setProp(node.id, field.key, value);
            }}
            onGestureStart={beginGesture}
            onGestureEnd={endGesture}
          />
          ))}
          </div>
        </section>
      ))}
    </Panel>
  );
}
