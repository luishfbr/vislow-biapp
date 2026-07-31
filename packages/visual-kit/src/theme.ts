/**
 * Constantes visuais compartilhadas entre os nos.
 *
 * Ja abrigou `resolveColors`, que decidia as cores efetivas de um render a
 * partir do `VisualConfig` do Runtime Core. Com a compilacao por usuario a cor
 * vem da propria spec, no o a no, e a regra de alto contraste vive em
 * `highContrast.ts` — sobrou o que nao pertence a nenhum dos dois.
 */

/** Opacidade de esmaecimento de itens nao selecionados (RF-18). */
export const DIMMED_OPACITY = 0.35;
