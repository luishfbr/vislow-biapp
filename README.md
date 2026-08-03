# Vislow

Plataforma low-code que gera visuais customizados do Power BI (`.pbiviz`) sem que o usuário instale nada.

Criar um visual customizado hoje exige instalar Node, a CLI `pbiviz` e um certificado local, escrever TypeScript
e React e entender o modelo de `DataView` — horas ou dias de barreira justamente para o analista de BI, que é
quem mais quer um visual diferente e menos consegue produzi-lo.

No Vislow o usuário **compõe** uma árvore de componentes no editor, no navegador. A API compila um projeto
`pbiviz` de verdade e devolve o pacote — importável no Power BI Desktop, que lê o modelo e se comporta como
qualquer outro visual. O usuário **cria** o visual; não escolhe entre prontos.

## Como funciona

Há um só caminho: a spec vira código, o `pbiviz` compila e o portão inspeciona o artefato antes de entregar.

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

O que o servidor recebe é a **spec** — uma descrição de UI. Nenhum dado do modelo do Power BI sai do navegador,
e o servidor nunca executa código do usuário: ele roda a nossa toolchain sobre uma whitelist de componentes.

O editor tem um **canvas de posicionamento livre** (cada filho ganha uma caixa em `%` do pai, arrastável e
redimensionável), uma **prancheta** de tamanho declarado, de 100×100 a 1920×1080, e uma **tabela de dados de
exemplo** de até 10 colunas e 50 linhas. Prancheta e valores da tabela são do editor e **não entram no pacote**:
um visual do Power BI não escolhe o próprio tamanho, e o que viaja da tabela é só o esquema — cada coluna vira
um `dataRole` tipado, com o host segurando o visual enquanto faltar campo.

## Requisitos

| Item | Versão | Observação |
|---|---|---|
| Node | **≥ 22.13** | piso do pnpm 11.12, não nosso — em 22.12 o `pnpm install` recusa a rodar |
| pnpm | **11.12.0** | fixado em `packageManager`; use o corepack |
| Git | qualquer | |

Nada mais. A CLI `pbiviz` e o certificado local **não** são pré-requisitos: cada build instala a toolchain num
diretório temporário e o destrói no fim.

## Como rodar

```bash
# 1. pnpm na versão exata (o corepack já vem com o Node)
corepack enable
corepack prepare pnpm@11.12.0 --activate

# 2. instalar — na RAIZ, é um workspace pnpm
pnpm install

# 3. subir tudo
pnpm dev
```

| Serviço | URL |
|---|---|
| Editor (Next.js) | http://localhost:3000 |
| API de build (NestJS) | http://localhost:3001 |

O `pnpm dev` compila os pacotes que faltam e prepara o `vendor/` do template **antes** de subir os processos — a
ordem vive no `turbo.json` e vale igual aqui e no CI. Não é preciso rodar `pnpm build` antes.

Nenhum `.env` é obrigatório: o editor cai em `http://localhost:3001` e a API sobe na 3001 por padrão.

### Duas coisas que pegam na primeira máquina

1. **O primeiro `pnpm build` (ou `pnpm dev`) baixa a toolchain do `pbiviz`** — ~190 MB, uma vez só, para
   `packages/visual-template/deps/`. **As builds em si não usam a rede** (ADR-19): cada uma monta o
   `node_modules` por hardlink a partir dessa store. Atrás de proxy corporativo, é este passo — e só ele — que
   precisa do `npm config set proxy/https-proxy/cafile` configurado.
2. **Editar um pacote não faz hot reload.** Só os apps estão em watch. Depois de mexer em `packages/`, rode
   `pnpm build` ou reinicie o `pnpm dev`.

Se algo quebrar, o reset completo é:

```bash
pnpm clean                                   # dist/, vendor/, .next/ e o cache do turbo
find . -name node_modules -maxdepth 3 -type d -prune -exec rm -rf {} +
pnpm install && pnpm verify
```

## Comandos

```bash
pnpm dev         # sobe TUDO: compila o que falta, prepara o template, API :3001 + editor :3000
pnpm build       # pacotes + apps + stage:vendor
pnpm verify      # build + typecheck + lint + suíte rápida — rode antes de qualquer PR
pnpm check       # o verify MAIS o gate de aceite (compila um .pbiviz de verdade)
pnpm clean       # apaga dist/, vendor/, .next/ e o cache do turbo
```

Os scripts `lint` e `test` da raiz são as **implementações** que o turbo invoca — chamá-las direto pula a
ordenação. Use `pnpm verify`.

## Variáveis de ambiente

Todas opcionais.

| Variável | Onde | Padrão | Para quê |
|---|---|---|---|
| `NEXT_PUBLIC_VISLOW_API_URL` | editor | `http://localhost:3001` | endereço da API de build |
| `PORT` | API | `3001` | porta da API |
| `VISLOW_CORS_ORIGIN` | API | `*` | origem permitida no CORS |
| `VISLOW_BUILD_CONCURRENCY` | API | `2` | builds simultâneas |
| `VISLOW_BUILD_TIMEOUT_MS` | API | `180000` | teto de tempo de uma build |

## A API de build

```
POST /builds              { spec }  -> 202 { buildId, status }
GET  /builds/:id                    -> { status, error?, metrics? }
GET  /builds/:id/artifact           -> .pbiviz
```

`status` é `queued`, `running`, `done` ou `failed`; os dois últimos são terminais e é onde o cliente para de
perguntar. Uma spec inválida vira `400` com o **caminho do campo**, na hora, em vez de uma build enfileirada que
morre dez segundos depois.

## Estrutura

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

O grafo é acíclico e só aponta para baixo. `config-schema` e `visual-kit` são **isomórficos** — rodam em Node e
no browser, porque os dois são compilados para dentro do bundle do visual.

O mesmo componente React desenha o preview do editor **e** o visual compilado. É o que garante que o preview não
minta sobre o resultado.

## Documentação

Não leia tudo. Leia o da tarefa:

| Vou mexer em… | Leia |
|---|---|
| editor, preview, qualquer JSX ou CSS | [docs/frontend.md](docs/frontend.md) |
| API de build, codegen, template | [docs/backend.md](docs/backend.md) |
| `pbiviz`, bundle, CSS compilado, o portão, o gate | [docs/build-visual.md](docs/build-visual.md) |
| decidir escopo, ou "o produto deve fazer isso?" | [docs/requirements.md](docs/requirements.md) |
| pacote novo, fronteira entre pacotes, ADR, risco | [docs/architecture.md](docs/architecture.md) |
| convenção, teste, turbo, abrir PR, Definition of Done | [docs/engineering.md](docs/engineering.md) |
| "por que isso ficou assim?" e nada acima responde | [docs/history.md](docs/history.md) |

`apps/web`, `apps/api` e `packages/visual-kit` têm um `CLAUDE.md` próprio com as invariantes daquele subtree.

## Contribuindo

Cada feature é um branch `feature/*` com PR. Antes de abrir, `pnpm verify` tem de passar — é o primeiro item do
Definition of Done, que está por inteiro em [docs/engineering.md](docs/engineering.md).

O padrão de falha desta toolchain é o **silêncio**: `pbiviz package` já reportou sucesso produzindo pacote
quebrado três vezes, e classe Tailwind ausente do CSS compilado some sem erro. Por isso toda salvaguarda existe
para transformar silêncio em falha de build — e uma guarda que nunca falhou não é uma guarda verificada.
