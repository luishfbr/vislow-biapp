// `./packaging` NAO entra aqui. Ele depende de JSZip e este barril e importado
// pelo Runtime Core — reexportar arrastaria o JSZip para dentro do bundle do
// visual, em silencio, contra o orcamento do RNF-04. Consumidores do
// empacotamento usam `@vislow/config-schema/packaging`.
export * from './tokens.js';
export * from './types.js';
export * from './schema.js';
export * from './validate.js';
export * from './identity.js';
export * from './defaults.js';
export * from './migrations.js';
