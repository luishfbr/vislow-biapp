# apps/api — a API de build

Contrato, códigos de erro e pipeline em [docs/backend.md](../../docs/backend.md). O que acontece dentro do
`pbiviz` está em [docs/build-visual.md](../../docs/build-visual.md).

- **Nunca defina `NODE_ENV=production` no ambiente do worker.** O `npm ci` lê isso como `--omit=dev` e pula o
  `powerbi-visuals-tools`. Ele termina **com sucesso** e a falha aparece depois, como um `404` do registro
  tentando baixar um pacote chamado `pbiviz` — nada na mensagem aponta para a causa.
- **A inspeção do artefato é portão, não teste** (ADR-11). O `pbiviz` já reportou sucesso produzindo pacote
  quebrado três vezes. Nada sai do worker sem passar por `inspectPbiviz`.
- **O worker decide por código de saída e pela inspeção, nunca por varredura de texto na saída.** Sem `openssl`,
  o `pbiviz package` imprime `error Create certificate error` e conclui com sucesso — tratar `error` como falha
  rejeitaria todo build bem-sucedido.
- **Os `@vislow/*` entram em `node_modules` DEPOIS do `npm ci`**, que apaga o diretório antes de instalar.
  **Cópia de diretório, nunca symlink nem `file:`** — symlink reintroduz o React duplicado no bundle.
- **O `tsconfig.json` do template não aceita comentário** — o `powerbi-visuals-tools` o lê com `JSON.parse` cru.
  Toda explicação vai no `packages/visual-template/template/README.md`.
- **O template usa `moduleResolution: "bundler"`** — a resolução `node` ignora `exports` e não acharia
  `@vislow/visual-kit/nodes`.
- **`compiledVisual.e2e.test.ts` é o gate de aceite** e o único teste que executa o artefato. Ele **não tem como
  se ignorar**: sem template, lança no carregamento. Rode `pnpm check`.
