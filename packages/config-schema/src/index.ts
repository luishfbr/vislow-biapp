// `./packaging` NAO entra aqui. Ele depende de JSZip e este barril e importado
// (via `visual-kit`) por codigo que termina dentro do bundle do visual —
// reexportar arrastaria o JSZip para la, em silencio, contra o orcamento do
// RNF-04. Quem inspeciona pacote usa `@vislow/config-schema/packaging`.
export * from './tokens.js';
export * from './design.js';
export * from './legacyTokens.js';
export * from './cell.js';
export * from './types.js';
export * from './schema.js';
export * from './validate.js';
export * from './identity.js';
export * from './defaults.js';
export * from './migrations.js';
