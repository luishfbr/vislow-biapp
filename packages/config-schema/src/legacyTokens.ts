/**
 * Os enums de MEDIDA do config v1 — o formato plano do editor pre-ADR-08.
 *
 * ESTE ARQUIVO E HISTORIA, NAO DECISAO. Ele descreve um formato congelado que
 * ainda existe no `localStorage` de quem usou o produto antes da ADR-08, e que
 * `migrateV1` precisa conseguir validar para nao descartar o projeto.
 *
 * Mora separado do `tokens.ts` de proposito. Ate a spec 3.0.0 os dois eram o
 * mesmo conjunto de constantes, e essa uniao era exatamente o convite errado:
 * na spec 4.0.0 as medidas viraram pixel livre, e um arquivo so faria parecer
 * que "atualizar o valor de `md`" e uma coisa que alguem pode fazer. Nao e — o
 * valor de `md` aqui e o que os arquivos ja gravados dizem, e mudar qualquer um
 * deles faz `validateConfig` reprovar um projeto que era valido, o que apaga o
 * projeto de quem abriu o editor.
 *
 * Nao acrescente valor aqui. Formato congelado nao ganha opcao nova.
 */

export const LEGACY_SPACING = ['none', 'xs', 'sm', 'md', 'lg', 'xl'] as const;
export const LEGACY_RADIUS = ['none', 'sm', 'md', 'lg', 'xl', 'full'] as const;
export const LEGACY_FONT_SIZE = ['xs', 'sm', 'base', 'lg', 'xl', '2xl', '4xl'] as const;
export const LEGACY_BORDER = ['none', 'thin', 'medium'] as const;

export type LegacySpacing = (typeof LEGACY_SPACING)[number];
export type LegacyRadius = (typeof LEGACY_RADIUS)[number];
export type LegacyFontSize = (typeof LEGACY_FONT_SIZE)[number];
export type LegacyBorder = (typeof LEGACY_BORDER)[number];
