# O build do visual — a toolchain, o bundle e o portão

A feature mais frágil do produto, e a que mais custou. Aqui estão as regras que, se quebradas, produzem um
pacote que **compila com sucesso e não funciona**. Leia antes de mexer no `visual-kit`, no template, no codegen
ou em qualquer coisa que termine dentro do `.pbiviz`.

> **O padrão de falha desta toolchain é o silêncio.** `pbiviz package` já reportou `Build completed successfully`
> produzindo pacote quebrado três vezes neste projeto. Nenhuma regra abaixo é preferência de estilo: cada uma
> corresponde a um pacote que foi entregue, ou quase, sem funcionar.

## 1. As invariantes do CSS

### 1.1 Classe Tailwind é string literal completa

```ts
// ✅ o Tailwind lê a classe no fonte e gera o CSS
export const SPACING_CLASS: Record<Spacing, string> = { md: 'pbi:p-4' };

// ❌ a classe não existe no fonte; o CSS não é gerado, e nada reclama
const cls = `pbi:p-${size}`;
```

O CSS é pré-compilado pelo CLI do Tailwind, que só enxerga o fonte do `visual-kit` — **nunca a spec do
usuário**, que só existe depois. Uma classe construída por interpolação some sem erro dentro do Power BI. Use
sempre strings literais completas em `visual-kit/src/tokens.ts`.

O teste de cobertura de tokens rejeita classes contendo `$`, `{`, `}` ou crase, e falha nos **dois** sentidos:
token sem classe e classe órfã sem token.

### 1.2 O prefixo vem ANTES da variante

Tailwind v4 usa prefixo em forma de variante: `pbi:flex`, não `pbi-flex`. E:

```
✅ pbi:focus:ring-2          ❌ focus:pbi:ring-2
```

Escrito ao contrário, o CLI **não reconhece a classe, não gera regra nenhuma e não reclama** (achado 54). O anel
de foco do gráfico de barras da Fase 1 nunca existiu, e o código parecia acessível. A regra "use strings
literais" não protege contra isso, porque a classe é literal e completa — só está na ordem errada.

**Classe com variante se confere no `dist/styles.css`, não no olho.** Compile e leia os seletores gerados.

### 1.3 O campo `style` do `pbiviz.json` é ignorado

O CSS entra pelo `import` no `visual.ts` — e o build reporta sucesso mesmo sem ele (achado 20), gerando um
pacote válido e sem estilo nenhum.

A guarda é `packages/visual-kit/scripts/check-css.mjs`, passo do `build` do kit — vale local, não só no CI.
**Ela confere o CSS de saída, e uma classe pode ter segunda origem no fonte** (achado 57): `pbi:p-4` também
aparece literal em `states.tsx`, então quebrar só o mapa de tokens não a remove do bundle. Ao escolher classe
para a lista da guarda, **prefira as que só o `tokens.ts` produz** — `pbi:rounded-xl`, `pbi:text-lg`,
`pbi:shadow-sm`.

### 1.4 Cor e medida nunca viram classe

Hex livre validado por `pattern`, aplicado por `style` inline. É a exceção deliberada à RN-05 que permite
qualquer cor de marca sem quebrar a garantia de purge.

**Desde a spec 4.0.0 a MEDIDA seguiu o mesmo caminho.** Espaçamento, raio, espessura de borda e tamanho de
fonte eram enums de seis ou sete degraus — não havia como pedir 13px de espaçamento, só `sm` (8) ou `md` (16).
A regra da string literal era a razão de serem enums, mas ela só vale para **classe**: `style` inline não passa
por análise estática nenhuma, e é por isso que a cor sempre funcionou livre. Hoje as medidas são `number` na
spec e `style` nos componentes, e a garantia de purge continua intacta — nenhum número do usuário vira nome de
classe.

O que continua no catálogo de tokens é o que é **escolha entre alternativas**, e não medida: peso, alinhamento e
sombra. `font-weight` e `text-align` são valores nomeados no próprio CSS, e a sombra é uma receita de várias
camadas que não cabe num número.

⚠️ **A guarda de CSS mudou de lista junto.** `check-css.mjs` conferia `rounded-xl`, `text-lg` e `p-4`, que
vinham dos mapas de token; os dois primeiros perderam a única origem no fonte. A lista de hoje cobre uma origem
cada — `flex-row`, `text-right`, `font-medium`, `shadow-sm`, `overflow-hidden`, `p-4`. Ao mexer nela, escolha
utilidade com **uma** origem, e lembre que o próprio script é varrido pelo Tailwind (por isso prefixo e
utilidade viajam separados).

## 2. O bundle

### 2.1 React não pode entrar duas vezes

**O webpack do `pbiviz` usa `resolve.symlinks: false`**, então não resolve symlink para realpath: dois symlinks
para o **mesmo** pacote viram **dois módulos distintos** (achado 39). Foi assim que o React entrou duas vezes e o
dispatcher de hooks ficou `null`.

O sintoma foi enganoso e é o que torna a regra memorável: elementos JSX atravessam cópias sem problema — o
`$$typeof` é um `Symbol.for`, global — então **só os componentes com hook falhavam** e o resto renderizava
normalmente.

Consequências permanentes, todas em vigor:

- `autoInstallPeers: false` no `pnpm-workspace.yaml`;
- nenhum `react` nas `devDependencies` do `visual-kit`;
- vendorização por **cópia de diretório, nunca symlink**;
- **o `visual-kit` não usa hooks** — regra de ESLint, defesa em profundidade. Use classe (ver `ErrorBoundary`)
  ou calcule no render;
- **não adicione dependência duplicada entre pacotes que o template empacota.**

### 2.2 O `pnpm` estrito esconde dependências do webpack do `pbiviz`

Ele resolve loaders e transitivas a partir do diretório do **projeto**, não das próprias dependências (achado
24). Falha com `Can't resolve 'ts-loader'`, depois `scheduler`, depois dependências internas do Ajv. Por isso o
`package.json` do template declara explicitamente `ts-loader`, `scheduler`, os utils do Power BI e as
dependências internas do Ajv.

### 2.3 O orçamento de 1 MB

`content.js` < 1 MB, pacote < 2 MB — limite rígido do Power BI (C-04). Duas consequências de desenho:

- **`inspectPbiviz` vive em `@vislow/config-schema/packaging`**, fora do `index.ts`: o barril é importado por
  código que termina no bundle, e reexportar levaria o JSZip junto (achado 36).
- **`@vislow/visual-kit/nodes` fica fora do barril**: quem importa só o barril não deve pagar pelo Recharts
  (~575 KB) (achado 44).

### 2.4 Regras da toolchain

- **`innerHTML` é proibido** — pelo nosso ESLint **e** pelo lint oficial do `pbiviz`
  (`powerbi-visuals/no-inner-outer-html`), que **falha o build** (achado 16).
- **`pbiviz package` exige `author.name` e `author.email`** preenchidos, senão não gera o pacote (achado 19).
- **O `pbiviz` não traz PostCSS** (só `less-loader` e `css-loader`), por isso o CSS é pré-compilado pelo CLI do
  Tailwind e importado como CSS puro (achado 21, ADR-06).
- **A toolchain compila sem `strictNullChecks`** — o `visualPlugin.ts` que ela gera não passa. Por isso
  discriminante de união é **string**, nunca booleano (achado 26). Ver [engineering.md](engineering.md).
- **TypeScript 5.9.3 em todo o monorepo** (achado 22): a toolchain depende de `typescript ^5.9.3` e o
  `visual-kit` é compilado pelo `ts-loader` dela.

## 3. A identidade do visual

**O GUID não é um UUID: é o nome de uma variável JavaScript no bundle** (achado 13) —
`var vislowSpike629BE43A5D854EF08EE114A6CAB537A8;(()=>{`. Precisa casar com `^[A-Za-z][A-Za-z0-9]*$`.

```
slug   = normaliza(nome do projeto) → NFD, remove diacríticos, mantém [A-Za-z0-9], máx. 40 chars
         se não começar por letra, prefixa "v"; se vazio, usa "vislow"
sufixo = 16 bytes de crypto aleatórios → 32 hex maiúsculos
id     = slug + sufixo
```

O `id` é gerado **uma vez**, na criação do projeto, e persiste na spec. É isso que faz RF-10 funcionar:
reexportar reusa o `id` e apenas incrementa a versão, de modo que o import **atualiza** o visual em vez de
duplicá-lo (RN-01, C-03).

Depois da ADR-08 a identidade **nasce certa** no `pbiviz.json` de cada build — não há mais reescrita, e com ela
foram embora os achados 34, 35 e 36.

## 4. A estrutura real do `.pbiviz`

Verificada empiricamente com `powerbi-visuals-tools` 7.2.1. É um ZIP com **três entradas**:

```
{guid}.{version}.pbiviz  (ZIP)
├── package.json
│     ├── version                          "1.0.0.0"
│     ├── author { name, email }            ← obrigatório, senão o build falha
│     ├── resources [ { resourceId: "rId0", sourceType: 5, file: "resources/{guid}.pbiviz.json" } ]
│     ├── visual { name, displayName, guid, visualClassName, version, ... }
│     └── metadata { pbivizjson: { resourceId: "rId0" } }
├── resources/                              (entrada de diretório, vazia)
└── resources/{guid}.pbiviz.json            TUDO que o Power BI executa
      ├── visual, author, apiVersion, capabilities
      └── content { js, css, iconBase64 }
```

Não existe `assets/icon.png` no ZIP — o ícone é a string `content.iconBase64`. E `pbiviz.json`,
`capabilities.json` e `bundle.js` soltos na raiz são a estrutura do **projeto-fonte**, não do pacote.

## 5. O portão

`inspectPbiviz` abre o pacote e recusa a entrega se qualquer invariante falhar (ADR-11). **Não é teste: é
portão** — roda em produção, a cada build, antes de o usuário baixar qualquer coisa.

O que confere: GUID igual ao do projeto e presente como `var` no bundle · identidade coerente entre
`package.json` e recurso · recurso declarado batendo com o presente · classes `pbi:` no bundle (senão o CSS não
entrou) · SVG compilado sem `fill="var(` · e os dois orçamentos rígidos.

## 6. O gate de aceite

`apps/api/src/builds/compiledVisual.e2e.test.ts`. **É o teste mais importante do projeto** — cobre exatamente o
que o usuário quer garantir: que o `.pbiviz` entregue funciona.

Faz o ciclo inteiro numa passada: monta uma spec com **todos** os tipos de nó, chama `runBuildPipeline`
(codegen → monta o `node_modules` → `pbiviz package`), abre o pacote com `inspectPbiviz` e **executa o `content.js` minificado
dentro de um jsdom**, com o `powerbi` global e um `DataView` falso, exatamente como o Power BI faz.

Executar o bundle é o ponto: **é a única verificação que enxerga o que o webpack fez.** Herdou do
`renderRealBundle.test.ts`, o único teste que pegou o achado 39 — um bug que só existe no pacote empacotado e
que nenhum teste de fonte alcança.

**Ele não tem como se ignorar** (ADR-17): o sufixo `.e2e.test.ts` o tira da suíte rápida e o põe na do gate,
cuja tarefa no `turbo.json` declara `stage:vendor` como dependência e é `cache: false`. Se ele roda, o template
está preparado; se não estiver, o arquivo **lança no carregamento** em vez de avisar e passar verde (achado 58).
Rode com `pnpm check`.

| ID | Assertiva | Protege |
|---|---|---|
| T-03 | Identidade do `package.json` e do recurso coincidem; o recurso declarado é o presente no zip | ADR-11 |
| T-04 | O GUID aparece como **variável** no bundle (`var {guid}`), senão o visual não carrega | RN-06, achado 13 |
| T-05 | O GUID do pacote é o do projeto, sem reescrita, e o nome exibido é o que o usuário deu — com aspas, acentos e emoji | RN-01, ADR-08 |
| T-06 | O bundle contém as classes `pbi:` — sem elas o visual renderiza sem estilo e o `pbiviz` reporta sucesso igual | ADR-02 |
| T-07 | Dois projetos novos nunca compartilham GUID; o mesmo projeto reexportado mantém o seu | RN-01 |
| T-08 | Pacote < 2 MB e `content.js` < 1 MB | RNF-04, RNF-05 |
| T-09 | Renderiza dados, estado vazio ou card de erro — **nunca** tela branca | RN-04 |
| T-10 | O que o visual **pede ao host**: seleção com a identidade da linha, tooltip nativo, menu de contexto, alto contraste resolvido e teclado | RF-18…RF-25 |

T-10 existe porque a lacuna que deixou o achado 53 passar foi exatamente esta: o gate verificava que o visual
**desenha**, não o que ele **pede ao host**. Um visual pode desenhar certo e não filtrar nada.
