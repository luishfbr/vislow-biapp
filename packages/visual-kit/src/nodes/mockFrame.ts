import type { DataFrame, RoleColumn } from './frame.js';

/**
 * Quadro de exemplo do preview (RF-06), derivado dos papeis que o USUARIO
 * declarou.
 *
 * Depois do ADR-08 nao existe mais dataset mock fixo: cada visual declara os
 * proprios papeis, entao o dado de exemplo precisa nascer deles. Um papel que o
 * usuario acabou de criar tem coluna no preview no mesmo instante — sem isso o
 * grafico cairia no estado vazio e o usuario acharia que quebrou.
 *
 * Nao importa `DataRole` do `@vislow/component-registry` de proposito: o kit e
 * folha do grafo de pacotes e fica assim. A entrada e estrutural, e `DataRole[]`
 * satisfaz.
 *
 * RN-02: nenhum dado real do modelo do Power BI passa por aqui — o editor nao
 * tem acesso a ele.
 */

interface MockRole {
  name: string;
  kind: 'grouping' | 'measure';
}

/**
 * Categorias escolhidas para EXPOR problema de layout, nao para ficar bonito:
 * nome curto ao lado de nome longo, que e o que quebra eixo e legenda.
 */
const CATEGORIES: [string, ...string[]] = [
  'Sul',
  'Sudeste',
  'Centro-Oeste e Norte',
  'Nordeste',
  'Exterior',
];

/** Magnitudes diferentes, um zero e um valor pequeno — o mesmo criterio. */
const BASE_VALUES: [number, ...number[]] = [184_320, 921_450, 47_800, 312_990, 0];

/**
 * Variacao deterministica por nome de papel.
 *
 * Duas medidas diferentes precisam desenhar series diferentes, senao dois
 * graficos lado a lado ficam identicos e o preview deixa de mostrar que o
 * usuario ligou os campos errados. Deterministico para que o preview nao mude
 * sozinho entre renders.
 */
function seedOf(name: string): number {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) % 997;
  return hash;
}

function groupingColumn(name: string): RoleColumn {
  // Rotaciona a lista: dois papeis de agrupamento nao aparecem na mesma ordem.
  const offset = seedOf(name) % CATEGORIES.length;
  const values = CATEGORIES.map(
    (_, index) => CATEGORIES[(index + offset) % CATEGORIES.length] ?? '',
  );
  return { title: name, values, formatted: values };
}

function measureColumn(name: string, locale: string): RoleColumn {
  const factor = 0.4 + (seedOf(name) % 13) / 10;
  const values = BASE_VALUES.map((base) => Math.round(base * factor));
  const format = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  return { title: name, values, formatted: values.map((value) => format.format(value)) };
}

/**
 * Monta o quadro de exemplo.
 *
 * Um papel declarado SEMPRE vira coluna. O estado vazio da RN-04 no preview vem
 * de campo de papel nao ligado no no — que e o caso real que o usuario precisa
 * ver —, e nao de papel ausente do quadro.
 */
export function mockFrame(roles: readonly MockRole[], locale = 'pt-BR'): DataFrame {
  const columns: Record<string, RoleColumn | undefined> = {};
  for (const role of roles) {
    columns[role.name] =
      role.kind === 'grouping' ? groupingColumn(role.name) : measureColumn(role.name, locale);
  }
  return { roles: columns, locale };
}
