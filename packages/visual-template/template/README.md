# Scaffold do visual gerado

Tudo aqui e **estatico**: e o que e igual em todo visual que o Vislow compila. O que muda por build sao
somente tres arquivos, escritos por `@vislow/codegen` por cima desta copia:

| Arquivo | Origem |
|---|---|
| `src/visual.tsx` | arvore que o usuario montou |
| `capabilities.json` | papeis de dado que a arvore consome |
| `pbiviz.json` | identidade do projeto (nome, GUID, versao) |

Manter essa fronteira nitida e o que permite cachear o `npm ci`: o que muda por build nao toca as
dependencias.

## Armadilhas deste diretorio

- **`tsconfig.json` nao aceita comentario.** O `powerbi-visuals-tools` le o arquivo com `JSON.parse` cru
  (`lib/utils.js`, `safelyParse`), nao com um parser de JSONC. Um `//` aqui derruba o build com
  `SyntaxError: Expected double-quoted property name`, apontando para o proprio comentario — mensagem que
  nao sugere em nada que o problema e o formato do arquivo. Toda explicacao vai neste README.
- **`moduleResolution` e `bundler`, nao `node`.** O `visual-kit` publica os componentes de no pelo
  subcaminho `@vislow/visual-kit/nodes`, declarado no campo `exports`. A resolucao `node` (node10) ignora
  `exports` e nao acharia os tipos. O webpack do `pbiviz` ja honra `exports`; so o lado do TypeScript
  precisava mudar.
- **`@vislow/visual-kit` e `@vislow/config-schema` NAO estao no `package.json`.** Sao pacotes privados,
  copiados como diretorios reais para `node_modules/@vislow/` **depois** do `npm ci` — que apaga
  `node_modules` inteiro antes de instalar. Ver `scripts/stage-vendor.mjs`.
- **O campo `style` do `pbiviz.json` e ignorado pela toolchain.** O CSS entra pelo `import` no `visual.tsx`,
  emitido pelo codegen. O `style/visual.less` daqui e um placeholder que existe so porque o manifesto exige
  o campo.
