/**
 * Subcaminho `@vislow/config-schema/packaging`.
 *
 * Separado do barril principal de proposito: este modulo depende de JSZip, e o
 * Runtime Core importa `@vislow/config-schema`. Reexportar daqui no `index.ts`
 * arriscaria arrastar o JSZip para dentro do bundle do visual do Power BI —
 * em silencio, contra o orcamento de 1 MB do RNF-04.
 */
export {
  buildPbiviz,
  toPbivizBlob,
  CONFIG_PLACEHOLDER,
  PbivizBuildError,
  type PbivizBuildErrorCode,
  type PbivizPackage,
} from './buildPbiviz.js';
export { toBase64Utf8, fromBase64Utf8 } from './base64.js';
export {
  inspectPbiviz,
  type PbivizIdentity,
  type PbivizInspection,
} from './inspectPbiviz.js';
