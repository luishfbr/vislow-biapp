# @vislow/api — API de build

Recebe a arvore que o usuario montou, gera um projeto `pbiviz` de verdade, compila e devolve o `.pbiviz`.
E a materializacao da [ADR-08](../../docs/doc-mvp-lowcode-pbi.md): reverte a ADR-01 (patch de placeholder) e a
ADR-05 (zero backend).

## Contrato

```
POST /builds        { spec }  -> 202 { buildId, status }
GET  /builds/:id              -> 200 { status, error?, metrics? }
GET  /builds/:id/artifact     -> 200 .pbiviz   (Content-Disposition com o nome do usuario)
```

`POST` responde **202**, nao 201: o recurso pedido — o artefato — ainda nao existe. Um build leva ~12 s, e
segurar a conexao por todo esse tempo entrega uma barra de progresso que nao progride e morre no primeiro proxy
com timeout curto.

`GET /builds/:id/artifact` responde **409** enquanto a build nao terminou. Um 404 faria o cliente parar de
perguntar justamente quando deveria continuar esperando.

### Codigos de erro

| Codigo | Significado |
|---|---|
| `SPEC_INVALID` | Falhou no schema ou nas regras semanticas. Vem com `issues[]` apontando o campo. |
| `INSTALL_FAILED` | `npm ci` falhou — cache frio, rede, lockfile fora de sincronia. |
| `COMPILE_FAILED` | `pbiviz package` falhou. Quase sempre erro de tipo no fonte gerado. |
| `ARTIFACT_REJECTED` | Compilou, mas o artefato nao passou na inspecao. **Nunca e entregue.** |
| `TIMEOUT` | Estourou o tempo duro. |
| `TEMPLATE_NOT_STAGED` | O servidor nao foi preparado. Erro de implantacao, nao do usuario. |

## Pipeline

```
validar spec  ->  copiar scaffold  ->  codegen  ->  npm ci  ->  vendorizar @vislow/*
              ->  pbiviz package   ->  INSPECIONAR  ->  entregar
```

O passo de inspecao **nao e um teste, e um portao**. Este projeto ja documentou tres vezes que
`pbiviz package` reporta sucesso produzindo pacote quebrado. Um artefato que nao passa vira
`ARTIFACT_REJECTED` com o numero que estourou, e nao chega ao usuario.

O que a inspecao confere: GUID igual ao do projeto e presente como `var` no bundle, identidade coerente entre
`package.json` e recurso, recurso declarado batendo com o presente, classes `pbi:` no bundle (senao o CSS nao
entrou) e os dois orcamentos rigidos — 1 MB de `content.js` e 2 MB de pacote.

## Seguranca

**RN-11 do lado do servidor: nenhum codigo do usuario e executado nem compilado como codigo.** A spec e
**dados**. O `@vislow/codegen` emite JSX a partir de uma whitelist — o registro de componentes — e todo valor
sai como literal de string dentro de um container de expressao JSX. O `npm ci` roda do lockfile do template,
que o usuario nao controla e nao consegue influenciar.

Alem disso: diretorio temporario proprio por build, destruido no `finally` inclusive quando estoura o tempo;
ambiente do processo reduzido a `PATH` e `HOME`, sem repassar segredo do servidor; timeout duro com `SIGKILL`;
e fila com concorrencia limitada, porque um build ocupa uma CPU inteira por ~12 s e sem teto dez pedidos
simultaneos derrubam a maquina fazendo TODOS estourarem o tempo.

## Preparar e rodar

O template precisa ser preparado antes do primeiro build — os pacotes `@vislow/*` sao privados e entram em
`node_modules` como diretorios reais depois do `npm ci` de cada build:

```bash
pnpm build          # gera dist/ e o CSS do visual-kit
pnpm stage:vendor   # copia visual-kit e config-schema para o template
pnpm dev:api        # sobe a API em http://localhost:3001
```

A API falha no bootstrap se o template nao estiver preparado — falhar ali, e nao na primeira build, e o que
distingue erro de implantacao de erro do usuario.

### Variaveis

| Variavel | Padrao | Para que |
|---|---|---|
| `PORT` | `3001` | Porta HTTP. |
| `VISLOW_BUILD_CONCURRENCY` | `2` | Builds simultaneos. |
| `VISLOW_BUILD_TIMEOUT_MS` | `180000` | Tempo duro por build. |
| `VISLOW_NPM_CACHE` | — | Cache do npm. Com cache quente o `npm ci` cai para ~2 s. |
| `VISLOW_CORS_ORIGIN` | `*` | Origem do editor. |

## Testes

`compiledVisual.e2e.test.ts` e o **gate de aceite**: compila um `.pbiviz` de verdade e executa o bundle
minificado num jsdom. E o herdeiro do `renderRealBundle.test.ts` — o unico teste que pegou o
[achado 39](../../docs/doc-mvp-lowcode-pbi.md), porque nenhum teste de fonte enxerga o que o webpack fez com o
bundle.

Ele exige o template preparado. Sem isso avisa e se ignora; no CI, `VISLOW_REQUIRE_BUILD=1` transforma a
ausencia em falha, para que nunca passe como "teste ignorado".

```bash
pnpm test:build     # so o gate
```
