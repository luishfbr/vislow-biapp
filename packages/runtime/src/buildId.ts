/**
 * Impressao digital do build, selada no pacote depois do `pbiviz package`.
 *
 * Existe porque houve uma sessao inteira gasta sem saber QUAL artefato estava
 * carregado no Power BI Desktop: a correcao do React duplicado passou no jsdom e
 * falhou no Desktop, e "voce importou o arquivo antigo" era indistinguivel de
 * "a correcao nao funciona". Um pacote que diz quem ele e elimina essa duvida.
 *
 * O mesmo contrato de placeholder da secao 8.2: base16 nunca contem `_`, e o
 * token e cheio deles. Nao comparar contra o token concatenado — o minificador
 * pode dobrar a concatenacao e criar uma segunda ocorrencia literal.
 */
const VISLOW_BUILD_ID = '__VISLOW_BUILD_ID__';

/** `nao-selado` significa que o pacote nao passou por `stamp-build-id.mjs`. */
export const BUILD_ID: string = VISLOW_BUILD_ID.includes('_') ? 'nao-selado' : VISLOW_BUILD_ID;
