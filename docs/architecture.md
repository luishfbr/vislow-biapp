# Arquitetura — Vislow

Como o sistema é montado e por quê. Leia antes de criar pacote, mover fronteira entre pacotes ou tomar decisão
que mereça um ADR. Para a área específica: [frontend.md](frontend.md) · [backend.md](backend.md) ·
[build-visual.md](build-visual.md).

## 1. Há um só caminho

A spec vira código, o `pbiviz` compila e o portão inspeciona.

```
editor (apps/web)                    API (apps/api)                          Power BI
  compõe a árvore  ──POST /builds──▶  valida a spec
  polling do status                   copia o scaffold do template
                                      codegen: spec → visual.tsx + capabilities.json
                                      monta node_modules  →  vendoriza @vislow/*
                                      pbiviz package
                                      INSPECIONA o artefato  ── falhou ─▶ ARTIFACT_REJECTED
  baixa o .pbiviz  ◀──GET artifact──  entrega                              importa e renderiza
```

Não existe mais pacote base pré-compilado, patch no browser nem reescrita de identidade: a identidade **nasce
certa** no `pbiviz.json` de cada build. Referência ao caminho antigo fora de [history.md](history.md) é resíduo —
remova. A lista dos nomes aposentados vive em `scripts/check-docs.mjs`, que falha o `verify` quando um deles
reaparece.

## 2. Pacotes e o grafo

```
packages/config-schema/      Schema, tipos, validação, defaults, identidade, migrações;
                             e `packaging/inspectPbiviz` (isomórfico)
packages/build-contract/     Contrato HTTP entre o editor e a API de build
packages/component-registry/ Catálogo de componentes; schema da árvore derivado dele
packages/visual-kit/         Componentes React + mapa token→classe + fonte Tailwind
                             (`/nodes` = os nós do construtor, fora do barril)
packages/codegen/            Spec → fontes de um projeto pbiviz
packages/visual-template/    Projeto pbiviz base + vendorização dos @vislow/* para o worker
apps/api/                    API de build: spec entra, .pbiviz compilado sai
apps/web/                    Editor Next.js: compõe a árvore e chama a API
spike/                       Código descartável do gate. Fora do lint e dos testes.
```

**Regra: o grafo é acíclico e só aponta para baixo.**
`config-schema` ← {`build-contract`, `component-registry`, `visual-kit`} ← `codegen` ← {`api`, `web`}.
O `config-schema` não importa nada do monorepo.

**Regra: `config-schema` e `visual-kit` são isomórficos** — rodam em Node e no browser. Nada de `fs`, `path` ou
API só de browser: os dois são compilados para dentro do bundle do visual, e `inspectPbiviz` roda tanto no
worker quanto num teste.

Duas exceções ao barril, pelo mesmo motivo — o orçamento de 1 MB do `content.js` (RNF-04):

- **`inspectPbiviz` vive em `@vislow/config-schema/packaging`**, fora do `index.ts`. O barril é importado por
  código que termina dentro do bundle; reexportar levaria o JSZip junto.
- **`@vislow/visual-kit/nodes` fica fora do barril.** Quem importa só o barril não deve pagar pelo Recharts
  (~575 KB).

## 3. As três fontes únicas

Duplicação diverge — sempre, e em semanas. Três conceitos têm um dono e só um:

| Conceito | Dono | Quem consome |
|---|---|---|
| **O catálogo de componentes** | `NODE_DESCRIPTORS` em `component-registry/src/registry.ts` | schema da árvore, paleta, painel de propriedades, preview, codegen |
| **Os componentes que desenham** | `visual-kit/src/nodes/` | o preview do editor **e** o visual compilado — literalmente o mesmo componente (ADR-04, ADR-10) |
| **O contrato HTTP** | `@vislow/build-contract` | editor e API |

**Nada de lista de tipos ou de propriedades escrita à mão em lugar nenhum.** Uma lista paralela é a quinta cópia
do catálogo e a primeira a divergir. `lib/nodeComponents.ts` é o gêmeo por referência do que o codegen faz por
texto, e `nodeComponents.test.ts` — que compara o nome da função com `descriptor.component` — é a única coisa
ligando os dois caminhos.

## 4. Evolução do schema

Dentro de uma major, **só adicionar** campos opcionais com default. Remover ou renomear exige bump de major
**e** função de migração (RN-12). `additionalProperties: false` em todo objeto é a fronteira que faz isso valer.

Um visual já distribuído compara o `schemaVersion` com o que suporta: *major* divergente vira card de erro,
*minor/patch* renderiza aplicando defaults aos campos desconhecidos (RN-09). É o que permite evoluir sem
quebrar pacotes que já estão em relatórios de usuários.

**A união de nós no schema usa `if`/`then` por `kind`, nunca `oneOf`** — ver ADR-15.

## 5. Decisões de arquitetura (ADR)

ADR não se apaga. Se for revertido, registra-se a reversão e a razão — as revertidas (01, 03, 05, 07) estão em
[history.md](history.md). **A coluna "alternativa descartada" é o que impede reabrir decisão fechada:** antes de
propor uma delas de novo, é preciso derrubar o motivo.

| ADR | Decisão | Motivo | Alternativa descartada |
|---|---|---|---|
| **ADR-02** | A spec descreve **design tokens semânticos**; o kit mapeia token → classe/estilo. | Resolve C-07 por construção: todas as classes existem literalmente no fonte. Schema estável e validável por enum. | Classes Tailwind cruas + safelist — frágil, falha em silêncio, acopla o schema ao Tailwind. |
| **ADR-04** | Um `visual-kit` com os componentes React, consumido pelo visual compilado **e** pelo preview. | Garante WYSIWYG por construção: não são "parecidos", são o mesmo componente. | Componentes duplicados — divergem em semanas. |
| **ADR-06** | Tailwind v4.3, com o CSS **pré-compilado pelo CLI** e importado como CSS puro. | O `pbiviz` **não traz PostCSS** (só `less-loader`/`css-loader`), então pré-compilar dispensa plugar Tailwind no webpack dele. | PostCSS dentro do webpack do `pbiviz` (não existe). |
| **ADR-08** | **Compilação real por usuário, num backend.** O worker recebe a árvore, gera o projeto `pbiviz` e roda `pbiviz package`. **Reverte a ADR-01 e a ADR-05.** | O patch de placeholder travava o produto: o usuário escolhia entre tipos que o runtime já sabia renderizar, nunca criava. Com compilação real o `capabilities.json` é **gerado por visual** — o usuário declara os campos que o visual dele vai pedir, e é isso que faz "começar do zero" ser real. De quebra, a identidade vem do `pbiviz.json` e o achado 39 some por construção. | Manter o patch (teto de produto); um visual único no AppSource com config no painel de formatação (padrão Deneb — mata a proposta de valor). |
| **ADR-09** | **O schema JSON da árvore é gerado a partir do registro**, não escrito à mão. | Um schema manual seria uma segunda lista de tipos, que divergiria na primeira adição — e a divergência falharia em runtime, dentro do Power BI. Derivando, um tipo novo passa a ser validado no mesmo commit em que passa a existir. | Schema manual em paralelo ao registro. |
| **ADR-10** | O codegen emite **imports nomeados dos mesmos componentes do `visual-kit`** que o preview usa, não JSX de Recharts cru. | Preserva o ADR-04 depois do pivô. Imports nomeados dão tree-shaking — o bundle leva só os nós usados. | Codegen emitindo Recharts direto (preview e final divergem); interpretador genérico (sem tree-shaking, e o registro perde sentido). |
| **ADR-11** | **A inspeção do artefato é um portão do pipeline, não um teste.** O worker abre o `.pbiviz` e recusa a entrega se qualquer invariante falhar. | `pbiviz package` já reportou sucesso produzindo pacote quebrado três vezes neste projeto (achados 20, 34, 41). Confiar no código de saída entrega ao usuário um arquivo que o Power BI recusa com mensagem genérica. | Confiar no código de saída (provado insuficiente); verificar só no CI (não protege build de produção). |
| **ADR-12** | O `capabilities.json` declara **apenas os papéis que a árvore consome**. | Um papel declarado e não ligado viraria um campo no painel que o visual nunca lê: o usuário arrasta a coluna e nada acontece. | Declarar todos os papéis do projeto; ou exigir que todo papel declarado seja usado (transforma rascunho em erro). |
| **ADR-13** | O **nome técnico de um papel é estável**: nasce do rótulo na criação e nunca muda. O usuário edita só o `displayName`. | O `name` vai para o `capabilities.json` e amarra toda referência da árvore. Renomear em cascata que falhasse pela metade produziria um visual pedindo coluna que nenhum nó lê. | Renomear em cascata (falha parcial silenciosa); expor o `name` como editável (o usuário quebra o próprio visual). |
| **ADR-14** | O **preview não tem seleção por clique**. A seleção vive no painel de árvore. **Restringido pela ADR-18:** continua valendo em container que empilha; num container que posiciona, não. | Envolver cada nó num elemento clicável insere um `div` na cadeia de flex que os gráficos usam para medir altura — o `ResponsiveContainer` mediria outra coisa e o preview deixaria de valer como referência, que é justamente o ADR-04. | Wrapper clicável (quebra o WYSIWYG por dentro, sem sintoma visível); `refs` + overlay (complexidade alta, ganho pequeno). |
| **ADR-15** | A união de nós no schema é despachada com **`if`/`then` por `kind`**, não com `oneOf`. | Com `oneOf` o Ajv avalia as sete variantes e reporta o erro de todas: um `barChart` sem medida acusava "falta `direction`" e "falta `gap`", campos de container. Erro de outro tipo de nó é pior que erro nenhum. | `oneOf` (ruído inutilizável no painel); `discriminator` do Ajv (extensão fora do dialeto 2020-12). |
| **ADR-16** | Os **serviços do host viajam dentro do `DataFrame`**, num `FrameHost`. O alto contraste chega ao HTML por **variável CSS com fallback**; o SVG dos gráficos lê a paleta do quadro. | Seleção, tooltip e alto contraste não são configuração do usuário: dar-lhes um campo em cada descritor criaria seis propriedades por nó que ninguém edita. O quadro já atravessa a árvore. A variável CSS resolve o que o quadro não alcança — `Container` e `TextNode` não consomem dados e mesmo assim obedecem — **sem hook** (achado 39). | Prop por capacidade em cada descritor; React Context (exige `useContext`, proibido no kit); variável CSS também no SVG (não funciona, e falha em silêncio). |
| **ADR-17** | **A ordem de build é declarada no `turbo.json`**, não reconstruída em cada lugar que a executa. | A ordem vivia em três lugares que não conversavam — o solution file do `tsc`, os passos do CI e a memória de quem roda os comandos — e o CI já tinha divergido. Consequência direta: um teste que exige artefato compilado (`*.e2e.test.ts`) **não tem mais como se ignorar**. | `tsc -b` da raiz como tarefa única (cache tudo-ou-nada); Nx (peso desproporcional para 8 workspaces); `pnpm -r` em cascata (ordena o build, mas não sabe de lint, teste ou `stage:vendor`). |
| **ADR-18** | **Posição e tamanho são proporcionais, e a manipulação direta vive dentro do próprio canvas.** O nó ganha `rect` em % do pai; a camada de alças é filha `absolute` do container, e não uma sobreposição sobre o preview. **Restringe a ADR-14 ao container que empilha.** | Percentual porque um visual do Power BI **não tem tamanho** — o autor do relatório arrasta a moldura, e a mesma composição precisa valer com 400 ou 1600 de largura. E a ADR-14 morreu por **medição**: filha absoluta está fora do fluxo, não entra em cadeia de flex nenhuma e herda o sistema de coordenadas do container, então as alças saem dos mesmos % que estão na spec — sem `ref`, sem `ResizeObserver`, sem medir para desenhar. Pixel só no gesto, lido uma vez no `pointerdown`. **Custo aceito:** dentro de um canvas a camada cobre os gráficos e o tooltip do Recharts some **do preview**; o do host, no visual compilado (RF-19), não é afetado. | Pixel fixo + `transform: scale()` (texto de 8px em moldura estreita, borrado em larga); grade de 12 colunas com linha em px (não permite sobrepor, e a altura não fecha com a moldura); sobreposição irmã do preview, posicionada por medição (traz de volta exatamente o `ResizeObserver` que a ADR-14 recusou). |

| **ADR-19** | **As dependências do build são instaladas uma vez, no preparo, e cada build só monta o `node_modules` por hardlink.** O worker não roda `npm` e **não usa a rede**. | A árvore instalada é idêntica em toda build — nada nela depende da spec. Reinstalá-la por build custava a maior fatia do tempo e, pior, exigia rede **dentro** do worker, que roda com ambiente magro por segurança: sem `HTTP_PROXY` e sem `NODE_EXTRA_CA_CERTS`, uma máquina atrás de proxy corporativo ficava presa em `INSTALL_FAILED` enquanto o `pnpm install` do próprio repo funcionava nela. Instalando no preparo, o ambiente do desenvolvedor vale — e a build fica offline por construção. **Hardlink e não symlink** pelo achado 39: symlink daria ao webpack um segundo caminho para o mesmo pacote. | Afrouxar o `buildEnv` para repassar proxy e CA (aumenta a superfície do worker justamente onde ela foi apertada de propósito, e não resolve a lentidão); pré-aquecer só o cache do npm com `npm ci --offline` por build (mantém o npm no worker e ainda desempacota ~500 pacotes por build); versionar `node_modules` (centenas de MB no git). |

## 6. Segurança e privacidade

A fronteira de confiança mudou com a ADR-08: **existe um servidor, e ele executa uma toolchain de build a pedido
de terceiros.** O desenho leva isso a sério.

- **Nenhum código do usuário é executado nem compilado como código (RN-11).** A spec é **dados**. O
  `@vislow/codegen` emite JSX a partir de uma whitelist — o registro — e todo valor sai como literal de string
  dentro de um container de expressão JSX. As dependências saem do lockfile do template, que o usuário não
  controla e não consegue influenciar — e desde a ADR-19 nem sequer são baixadas durante a build.
- **Nenhum dado do modelo do Power BI chega a nós** (C-06, RN-02). O editor não tem acesso ao modelo; o que
  trafega é a spec, que descreve UI. O preview usa a tabela de exemplo que o próprio usuário digitou
  (`sampleFrame`), e os valores dela ficam no editor — não entram no pacote.
- **Isolamento por build:** diretório temporário próprio, destruído no `finally` inclusive quando estoura o
  tempo; ambiente do processo reduzido a `PATH` e `HOME`, sem repassar segredo do servidor; timeout duro com
  `SIGKILL`; fila com concorrência limitada — um build ocupa uma CPU inteira por ~12 s, e sem teto dez pedidos
  simultâneos derrubam a máquina fazendo **todos** estourarem o tempo.
- **Validação nos dois lados, e um portão no fim.** O editor valida antes de enviar, a API revalida antes de
  compilar, `inspectPbiviz` confere o artefato depois. Não é redundância: o editor é código do cliente e a API
  não pode confiar nele.
- **Distribuição.** O visual gerado é de arquivo, ou seja, uso organizacional. AppSource exigiria revisão da
  Microsoft e GUID estável — fora de escopo.

## 7. Riscos abertos

Um risco sem **sinal de detecção** não é gerenciável. Os fechados estão em [history.md](history.md).

| ID | Risco | Impacto | Prob. | Mitigação | Sinal de detecção |
|---|---|---|---|---|---|
| **R-03** | A Microsoft muda o formato interno do `.pbiviz`. | Alto | Baixa | `powerbi-visuals-tools` fixado sem `^`; o gate roda contra o pacote recém-construído, detectando a mudança na hora do upgrade. | O gate falha ao atualizar a dependência. |
| **R-05** | O bundle estoura 2 MB ao crescer o catálogo de nós. | Médio | Baixa | Orçamento no portão (ADR-11) e em T-08; imports nomeados com tree-shaking (ADR-10); Recharts fora do barril. | O portão recusa o artefato. |
| **R-06** | O preview diverge do resultado no Power BI. | Alto | Baixa | `visual-kit` compartilhado (ADR-04, ADR-10); MT-01/MT-02 comparados ao preview. | Relato no piloto (M-05). |
| **R-07** | Upgrade acidental do Tailwind quebra o prefixo ou o preflight. | Médio | Média | Versão fixada; guarda de CSS (`check-css.mjs`) no build do kit. | A guarda falha no `pnpm build`. |
| **R-09** | O `pbiviz` avisa que `getFormattingModel` **será obrigatório** em versão futura. Hoje não bloqueia. | Médio | Alta | Implementar mesmo que o painel fique vazio; versão fixada evita a mudança chegar sem aviso. | O build reporta o aviso a cada empacotamento. |

## 8. Glossário

| Termo | Definição |
|---|---|
| **`.pbiviz`** | Arquivo (ZIP) de um visual customizado. Não confundir com **`.pbix`**, o arquivo de relatório. |
| **`pbiviz` (CLI)** | Ferramenta oficial da Microsoft que compila e empacota visuais customizados. |
| **Spec** | Documento JSON que descreve o visual do usuário: a árvore de nós, a tabela de exemplo (cujas colunas são os campos) e a identidade do projeto. |
| **Nó** | Um componente da árvore. Sete tipos, todos declarados em `NODE_DESCRIPTORS`. |
| **Papel (data role)** | "Poço" de campos declarado em `capabilities.json` para onde o usuário arrasta colunas dentro do Power BI. |
| **Token** | Valor semântico de design (`padding: "md"`), independente da implementação em CSS. |
| **`DataView`** | Estrutura pela qual o Power BI entrega os dados ao visual, em `update(options)`. |
| **`DataFrame`** | Nossa leitura do `DataView`, já normalizada, com os serviços do host dentro (ADR-16). |
| **GUID** | Identificador único do visual. Determina se dois pacotes são o mesmo visual. E é nome de variável JS. |
| **Portão** | A inspeção do artefato antes da entrega (ADR-11). Não é teste: recusa a entrega. |
| **Preflight** | Reset de CSS do Tailwind, desligado aqui para não conflitar com os estilos injetados pelo host. |
