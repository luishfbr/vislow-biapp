# Backend — a API de build

`apps/api` recebe a árvore que o usuário montou, gera um projeto `pbiviz` de verdade, compila e devolve o
`.pbiviz`. É a materialização da ADR-08. O que acontece **dentro** do `pbiviz` — bundle, identidade, portão —
está em [build-visual.md](build-visual.md).

## 1. Contrato HTTP

```
POST /builds        { spec }  ->  202 { buildId, status }
GET  /builds/:id              ->  200 { status, step?, queuePosition?, error?, metrics? }
GET  /builds/:id/artifact     ->  200 .pbiviz  (Content-Disposition com o nome do usuário)
```

O tipo vive em `@vislow/build-contract` e é compartilhado com o editor — um código de erro novo no servidor
quebra o build do editor em vez de virar "erro desconhecido" na tela.

`POST` responde **202**, não 201: o recurso pedido — o artefato — ainda não existe. Um build leva ~12 s, e
segurar a conexão por todo esse tempo entrega uma barra de progresso que não progride e morre no primeiro proxy
com timeout curto.

`GET /builds/:id/artifact` responde **409** enquanto a build não terminou. Um 404 faria o cliente parar de
perguntar justamente quando deveria continuar esperando.

**O `status` sozinho é mudo.** `running` cala por doze segundos, e o editor não teria como distinguir isso de
travado. Por isso o registro carrega mais dois campos, ambos opcionais e ambos só válidos no estado a que
pertencem:

- **`step`** — em qual das cinco etapas (`validating`, `generating`, `linking`, `compiling`, `inspecting`) o
  pipeline está. O `runBuildPipeline` recebe um `onStep` opcional e o dispara ao **entrar** em cada etapa, nunca
  ao sair: a etapa longa é justamente a que não teria aviso nenhum se o sinal fosse na conclusão. A ordem
  canônica é `BUILD_STEP_ORDER`, no contrato; **quanto cada etapa custa não vive aqui** — é medição, e é o
  editor quem desenha a barra.
- **`queuePosition`** — quantos builds há na frente, calculado na **leitura** (`BuildsService.find`) a partir do
  `BuildQueue.positionOf`. Gravar exigiria reescrever todos os enfileirados a cada vaga que abre, para um número
  que talvez ninguém consulte.

| Código | Significado |
|---|---|
| `SPEC_INVALID` | Falhou no schema ou nas regras semânticas. Vem com `issues[]` apontando o campo. |
| `INSTALL_FAILED` | Falhou ao montar o `node_modules` a partir da store. Disco cheio ou store corrompida — **não** rede. |
| `COMPILE_FAILED` | `pbiviz package` falhou. Quase sempre erro de tipo no fonte gerado. |
| `ARTIFACT_REJECTED` | Compilou, mas o artefato não passou na inspeção. **Nunca é entregue.** |
| `TIMEOUT` | Estourou o tempo duro. |
| `TEMPLATE_NOT_STAGED` | O servidor não foi preparado. Erro de implantação, não do usuário. |

## 2. Pipeline

```
validar spec  ->  copiar scaffold  ->  codegen  ->  montar node_modules  ->  vendorizar @vislow/*
              ->  pbiviz package   ->  INSPECIONAR  ->  entregar
```

**Nenhum passo do pipeline usa a rede** (ADR-19). As dependências do template são instaladas uma vez, no
preparo (`stage:deps`), e cada build só monta o `node_modules` por hardlink a partir dessa store — passo de
milissegundos, contra o `npm ci` por build que ele substituiu. O que quebrou o caminho antigo foi o próprio
`buildEnv`: magro por segurança, ele não repassa `HTTP_PROXY` nem `NODE_EXTRA_CA_CERTS`, então numa rede com
proxy ou TLS interceptado o `npm ci` do worker não alcançava o registro — numa máquina onde o `pnpm install` do
repo funcionava sem problema.

**A inspeção não é um teste, é um portão** (ADR-11). Este projeto já documentou três vezes que `pbiviz package`
reporta sucesso produzindo pacote quebrado. Um artefato que não passa vira `ARTIFACT_REJECTED` com o número que
estourou, e não chega ao usuário. O que ela confere está em [build-visual.md](build-visual.md).

**O worker decide por código de saída e pela inspeção, nunca por varredura de texto na saída** (achado 41):
num container sem `openssl`, o `pbiviz package` imprime `error Create certificate error` e conclui com sucesso.
O certificado é exigido pelo `pbiviz start`, não pelo `package`. Um worker que tratasse `error` na saída como
falha rejeitaria **todo** build bem-sucedido.

### Variáveis de ambiente

| Variável | Padrão | Para que |
|---|---|---|
| `PORT` | `3001` | Porta HTTP. |
| `VISLOW_BUILD_CONCURRENCY` | `2` | Builds simultâneos. |
| `VISLOW_BUILD_TIMEOUT_MS` | `180000` | Tempo duro por build. |
| `VISLOW_CORS_ORIGIN` | `*` | Origem do editor. |

A API **falha no bootstrap** se o template não estiver preparado. Falhar ali, e não na primeira build, é o que
distingue erro de implantação de erro do usuário. "Preparado" são três coisas: scaffold, `@vislow/*`
vendorizados e a store de dependências **em dia com o `package-lock.json` de hoje** — store velha compilaria
contra as dependências de outro commit, e o erro sairia como falha de tipo em código gerado que está correto.

## 3. Armadilhas do worker

Todas descobertas empiricamente, todas caras.

- **Nunca defina `NODE_ENV=production` no ambiente do worker** (achado 42). O npm lê isso como `--omit=dev` e
  ignora o `powerbi-visuals-tools`, que é uma devDependency. A falha aparece só no passo seguinte, como um
  `404 Not Found - GET .../pbiviz` — a mensagem sugere um pacote inexistente no registro, não um compilador que
  não foi instalado. O `buildEnv` não define `NODE_ENV`, com o motivo comentado, e o `stage:deps` passa
  `--include=dev` explícito. A redundância é deliberada.
- **O `tsconfig.json` do template não aceita comentário** (achado 43). O `powerbi-visuals-tools` o lê com
  `JSON.parse` cru; um `//` derruba o build com `SyntaxError` apontando para a linha do comentário. Toda
  explicação vai no `packages/visual-template/template/README.md`.
- **O template usa `moduleResolution: "bundler"`** (achado 44). A resolução `node` ignora o campo `exports` e
  não acharia `@vislow/visual-kit/nodes` — falha só do lado dos tipos, num projeto que compila por webpack.
- **Os `@vislow/*` entram em `node_modules` DEPOIS de montá-lo** (achado 45) — antes disso o diretório nem
  existe. **Cópia de diretório, nunca symlink nem `file:`**: symlink reintroduz o achado 39, e `file:` faria o
  `npm ci` do preparo recusar o lockfile a cada byte alterado no kit.
- **A store é montada por hardlink, nunca por symlink** — pelo mesmo achado 39. Hardlink não cria um segundo
  caminho para o pacote, cria um segundo nome para o mesmo arquivo, e o webpack (que roda com
  `resolve.symlinks: false`) enxerga uma árvore comum. Em compensação, escrever **por cima** de um arquivo
  montado escreveria dentro da store; nenhum passo do pipeline faz isso, e o `rm -rf` do fim só desfaz nomes.
- **O jsdom não tem motor de layout nem `ResizeObserver`**, e o `ResponsiveContainer` depende dos dois (achado
  46). O harness do gate instala um `ResizeObserver` de medida fixa e sobrescreve `offsetWidth`/`clientWidth`/
  `getBoundingClientRect`. **Equipar o harness, não afrouxar a asserção** — o que se prova é que o gráfico
  desenha *quando tem espaço*, que é a condição real dentro do Power BI.

## 4. Codegen

`@vislow/codegen` transforma a spec nos fontes de um projeto `pbiviz`: `visual.tsx`, `capabilities.json`,
`pbiviz.json`.

- **Emite imports nomeados dos mesmos componentes do `visual-kit`** que o preview usa, nunca JSX de Recharts cru
  (ADR-10). É o que preserva o WYSIWYG depois do pivô, e o que dá tree-shaking.
- **O tipo da coluna vira `requiredTypes`, e todo campo declarado é obrigatório (`min: 1`)**. É o que faz o
  Power BI recusar uma coluna de texto num campo numérico e segurar o visual enquanto faltar campo.
- **O `capabilities.json` declara apenas os papéis que a árvore consome** (ADR-12). A regra é `consumesData()`
  no registro, consultada pelo codegen **e** pelo preview — não reimplemente `fields.some(f => f.kind === 'role')`
  num dos dois lados.
- **Todo valor sai como literal de string** dentro de um container de expressão JSX, a partir da whitelist que é
  o registro. É assim que RN-11 vale do lado do servidor: a spec é **dados**, nunca código.
- **Toda a conversa com o host é estática**, em `visual-template/template/src/interaction.ts`. O codegen só
  instancia e chama `readFrame`. **Não mova implementação de seleção para o fonte gerado.**
- Todo pacote carrega um `buildId` que a API passa ao codegen, exibido no canto do visual e no card de erro.

### 4.1 O painel de formatação (spec 5.1.0)

**FECHADO por padrão** (ADR-20). O nó guarda `exposed` — as chaves que o autor publicou —, e quem não publica
nada gera **o pacote de antes**: sem `objects`, sem `supportsEmptyDataView`, sem `getFormattingModel`, com o
JSX só de literais. Um teste do codegen afirma exatamente isso, e é ele que falha no dia em que o painel virar
comportamento padrão.

- **`exposure.ts` é a fonte única** dos dois artefatos que precisam concordar: o `objects` do
  `capabilities.json` e a tabela `FORMATTING` do `visual.tsx`. Duas travessias da árvore divergiriam no dia em
  que uma delas esquecesse o `showWhen`.
- **`objectName` é o id do nó**; o apelido (`name`) vira o `displayName` do card. O id nunca muda, então o valor
  gravado no relatório reencontra o componente depois de um reexport.
- **Campo publicado vira `pick(overrides, id, chave, valorDoAutor)` no JSX; campo fechado continua literal.**
  Ignorar override é propriedade **estrutural**, não verificação em runtime: não há por onde ler o `objects`
  naquela posição.
- **`placement` nunca vai ao painel** (`structural: true` no descritor). É o codegen que o lê, para decidir se
  embrulha os filhos em `CanvasSlot` — um override dele deixaria filhos absolutos dentro de um pai que empilha.
- **A máquina do painel é ESTÁTICA**, em `visual-template/template/src/formatting.ts`, ao lado do
  `interaction.ts`: monta o `FormattingModel`, desembrulha o `fill`, avalia o `showWhen` contra o valor vigente
  e valida o que volta do host. O `component-registry` **não** é vendorizado no visual — rótulo, faixa e opções
  viajam na tabela emitida.
- **Valor que volta do host**: tipo errado ou fora de conjunto fechado é **recusado** (vale o valor do autor);
  tipo certo fora da faixa é **normalizado**. Um `padding={NaN}` desenha caixa de tamanho zero sem avisar.

## 5. Rodar e testar

```bash
pnpm dev      # sobe tudo, na ordem certa: API em :3001, editor em :3000
pnpm check    # verify + o gate de aceite (compila um .pbiviz de verdade)
```

O `@vislow/api#dev` declara `stage:vendor` e o build dos pacotes como dependências, então **não há como subir o
editor sem a API pronta atrás dele** — a preparação do template deixou de ser passo manual.

`compiledVisual.e2e.test.ts` é o **gate de aceite** e o único teste que executa o artefato. Se você mexer no
codegen, no template ou nos nós do kit, é ele que pega o estrago. Ele **não tem como se ignorar**: sem template,
lança no carregamento. Ver [build-visual.md](build-visual.md).
