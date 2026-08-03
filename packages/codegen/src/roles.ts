import { NODE_DESCRIPTORS, walk, type DataColumn, type VisualSpec } from '@vislow/component-registry';

/**
 * Colunas que a ARVORE realmente consome, na ordem em que o projeto as declarou.
 *
 * Nao e o mesmo que `spec.data.columns`. O usuario pode criar uma coluna na
 * tabela de exemplo e nunca ligar num no — e a coluna sozinha nao pode virar
 * campo no painel do Power BI, senao o visual pede uma coluna que ninguem le. O
 * `capabilities.json` e gerado a partir DESTA lista, entao "campo pedido" e
 * "campo usado" sao a mesma coisa por construcao.
 */
export function usedRoles(spec: VisualSpec): DataColumn[] {
  const referenced = new Set<string>();

  for (const { node } of walk(spec)) {
    for (const field of NODE_DESCRIPTORS[node.kind].fields) {
      if (field.kind !== 'role') continue;
      const bound = node.props[field.key];
      if (typeof bound === 'string') referenced.add(bound);
    }
  }

  return spec.data.columns.filter((column) => referenced.has(column.name));
}
