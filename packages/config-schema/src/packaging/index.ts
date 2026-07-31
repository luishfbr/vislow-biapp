/**
 * Subcaminho `@vislow/config-schema/packaging`.
 *
 * Separado do barril principal de proposito: este modulo depende de JSZip, e o
 * barril e importado por codigo que termina dentro do bundle do visual do Power
 * BI. Reexportar daqui no `index.ts` arrastaria o JSZip para la — em silencio,
 * contra o orcamento de 1 MB do RNF-04.
 */
export {
  inspectPbiviz,
  PbivizInspectionError,
  type PbivizIdentity,
  type PbivizInspection,
} from './inspectPbiviz.js';
