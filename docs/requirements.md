# Requisitos — Vislow

O que o produto tem de fazer, e como se verifica que faz. Este documento descreve o **produto de hoje**: o
usuário compõe uma árvore de componentes no editor, a API compila um projeto `pbiviz` de verdade e devolve um
`.pbiviz`. O que o produto já foi está em [history.md](history.md).

Convenção de IDs: `RF` funcional · `RNF` não funcional · `RN` regra de negócio · `C` restrição do ambiente ·
`M` métrica. `[P0]` é obrigatório no MVP. Requisito sem critério de aceite verificável não é requisito.

## 1. Produto

Criar um visual customizado do Power BI exige hoje instalar Node, a CLI `pbiviz` e um certificado local,
escrever TypeScript e React e entender o modelo de `DataView`. São horas ou dias de barreira para um analista de
BI — o perfil que mais **quer** um visual diferente e menos consegue produzi-lo. O resultado é que relatórios
ficam presos à biblioteca nativa.

O Vislow entrega, em minutos e sem instalar nada, um `.pbiviz` **real e funcional**: importável no Desktop, que
lê o modelo e se comporta como qualquer outro visual. O usuário **cria** o visual — não escolhe entre prontos.

| ID | Persona | Necessidade |
|---|---|---|
| P-01 | **Analista de BI** (primária) | Um visual com a cara da empresa, sem depender de TI ou de dev. |
| P-02 | Desenvolvedor de BI | Acelerar o trabalho repetitivo de estilização. |
| P-03 | Designer / Time de Marca | Garantir que os relatórios respeitem a identidade visual. |

**Fora de escopo do MVP**, registrado para evitar expansão silenciosa: autenticação e multiusuário · publicação
no AppSource · editor de código livre, CSS ou JS do usuário · galeria de templates · importação de tema `.json`
do Power BI · localização (o MVP é só em português).

### 1.1 A fronteira do produto

**A responsabilidade do Vislow termina na entrega de um `.pbiviz` válido e funcional.** Se o administrador do
tenant permite importar visuais de arquivo é configuração do ambiente do usuário — nenhuma decisão de
arquitetura nossa altera esse resultado, porque a política avalia o *tipo* de visual, não como ele foi
produzido. O pré-requisito é **informado** (RF-13) por cortesia, não como mitigação.

Isso **não** é desculpa para falha nossa: um `.pbiviz` que o Power BI recusa por estar malformado é defeito de
severidade máxima, coberto pelo gate de aceite ([build-visual.md](build-visual.md)) e por MT-01.

## 2. Métricas de sucesso

Piloto com 5 usuários P-01:

| ID | Métrica | Meta |
|---|---|---|
| M-01 | Do primeiro acesso ao visual renderizando no Desktop, sem ajuda | < 10 min (mediana) |
| M-02 | Sucesso do ciclo compor → exportar → importar → renderizar, em ambientes onde a importação é permitida ([1.1](#11-a-fronteira-do-produto)) | ≥ 95% |
| M-03 | Ocorrências de tela branca / visual quebrado | 0 |
| M-04 | Usuários que usariam o visual gerado num relatório real | ≥ 4 de 5 |
| M-05 | Divergência percebida entre preview e resultado no Power BI | Nenhuma bloqueante |

M-01 e M-02 decidem. M-03 é critério não negociável (RN-04).

## 3. Restrições do ambiente

Todo o desenho decorre destas. Verificadas na documentação da Microsoft e no spike.

| ID | Restrição | Consequência de projeto |
|---|---|---|
| C-01 | Visuais rodam em `<iframe sandbox="allow-scripts">` **sem domínio de origem**. | Sem `fetch` relativo, sem `localStorage`, sem acesso a arquivos do próprio pacote. |
| C-02 | Só `content.js`, `content.css` e `content.iconBase64` (strings dentro de `resources/{guid}.pbiviz.json`) chegam ao runtime. | Não existe "arquivo de configuração" no pacote. |
| C-03 | O **GUID é a identidade** do visual. Dois pacotes com o mesmo GUID são o mesmo visual. | Cada projeto precisa de GUID único (RN-01). |
| C-04 | O `.pbiviz` tem limite rígido de **2 MB**. | Orçamento verificado no gate (RNF-05). |
| C-05 | Importar visual de arquivo exige política de tenant habilitada. | Pré-requisito informado, não mitigado (RN-08). |
| C-06 | O único canal de dados é `update(options)`, com `dataViews` declarados em `capabilities.json`. | O editor **não tem acesso ao modelo** e não pode mapear campos (RN-02). |
| C-07 | Tailwind purga classes ausentes do código-fonte em build time. | Nenhuma classe pode ser escolhida depois da compilação (ADR-02). |

## 4. Requisitos funcionais

### 4.1 Editor — composição

**RF-01 `[P0]` — Compor uma árvore de componentes**
O usuário monta o visual a partir dos tipos de nó do catálogo (`container`, `text` e `kpi` na spec 5.2.0),
aninhando dentro de containers. Os quatro gráficos saíram na 5.0.0 e voltam quando houver nó de agrupamento.
*Dado* o editor aberto, *quando* o usuário adiciona um componente, *então* ele entra **dentro** da seleção se
ela aceita filhos, senão como irmão logo depois; a seleção passa a ser o nó novo; e o preview reflete a mudança
sem recarregar a página.

**RF-02 `[P0]` — Editar as propriedades de um nó**
Os controles do painel saem do descritor daquele tipo em `NODE_DESCRIPTORS`, não de uma lista escrita à mão
(ADR-09).
*Dado* qualquer controle, *quando* alterado, *então* a spec é atualizada, revalidada contra o schema e o preview
reflete a mudança.

**RF-03 `[P0]` — Texto livre nos nós de texto e rótulos**
*Dado* um texto com aspas, acentos ou emoji, *quando* exportado, *então* aparece íntegro no Power BI.

**RF-04 `[P0]` — Nomear o projeto**
Nome obrigatório; origina o nome do arquivo, o `displayName` e o slug do GUID.
*Dado* um nome fora de 3–50 caracteres, *quando* o usuário tenta exportar, *então* o export é bloqueado com
mensagem explicando a regra (RN-06).

**RF-26 `[P0]` — Declarar os campos de dados do visual**
O usuário monta uma **tabela de exemplo**: quantas colunas quiser, cada uma com um tipo declarado (texto,
inteiro, decimal, percentual, moeda, data, sim/não) e as linhas de valores que ele quiser. Cada coluna é, ao
mesmo tempo, o dado contra o qual ele compõe e o campo que o visual vai **exigir** no Power BI — o tipo vira
`requiredTypes` e o campo vira obrigatório (`min: 1`) no `capabilities.json` gerado.
*Dado* um papel declarado e não ligado a nó nenhum, *quando* o visual é compilado, *então* ele **não** aparece
no `capabilities.json` — campo pedido e campo usado são a mesma coisa (ADR-12).
*Dado* um papel renomeado, *quando* o usuário edita o rótulo, *então* só o `displayName` muda; o `name` técnico
nasce na criação e nunca muda (ADR-13).

### 4.2 Preview

**RF-05 `[P0]` — Preview fiel ao resultado final**
O preview renderiza com os **mesmos componentes** do `visual-kit` que o visual compilado usa (ADR-04, ADR-10).
*Dado* uma spec qualquer, *quando* comparados preview e visual importado no Power BI com os mesmos dados,
*então* a renderização é visualmente idêntica salvo pelos dados.

**RF-06 `[P0]` — Dados de exemplo**
O preview usa a tabela do usuário (`sampleFrame`). O projeto novo nasce com uma semente realista (nomes longos e curtos, zero, ordens de grandeza
diferentes).
*Dado* o preview, *quando* renderizado, *então* nenhum dado do modelo do usuário é envolvido (RN-02).

**RF-07 `[P1]` — Simulação de dimensões**
Alternar o preview entre proporções comuns do canvas do Power BI.

### 4.3 Projeto

**RF-08 `[P0]` — Persistência local** — o projeto é salvo em `localStorage` e restaurado ao reabrir a aba.

**RF-09 `[P0]` — Exportar e importar a spec** como `.json`.
*Dado* uma spec exportada, *quando* reimportada, *então* o editor volta ao estado exato, incluindo a identidade
do projeto (RN-01).

**RF-10 `[P1]` — Reexportar mantendo identidade** — reusa o GUID e incrementa a versão, de modo que o import
**atualiza** o visual existente em vez de duplicá-lo.

### 4.4 Export do pacote

**RF-11 `[P0]` — Gerar o `.pbiviz` pela API de build**
*Dado* uma spec válida, *quando* o usuário pede o download, *então* a API compila um projeto `pbiviz` real e
devolve um pacote de identidade única, importável no Desktop.

**RF-27 `[P0]` — Progresso visível durante o build**
O build leva ~12 s medidos, e "Gerando..." parado por doze segundos é indistinguível de travado.
*Dado* um build em andamento, *quando* o editor consulta o status, *então* a fase corrente é nomeada ("na
fila", "compilando"), e o download só é oferecido após um estado **terminal**.

**RF-12 `[P0]` — Bloqueio por validação**
*Dado* uma spec que falha no schema ou nas regras semânticas, *quando* o usuário tenta exportar, *então* o
export é impedido e **os campos inválidos são apontados no painel e na árvore** (RN-03). O nó com pendência e
**todos os seus ancestrais** são marcados: com a árvore recolhida, marcar só o nó defeituoso deixaria o export
bloqueado sem indício de onde.

**RF-13 `[P0]` — Instruções de importação** — após o download, o passo a passo e o aviso sobre a política de
tenant (C-05).

### 4.5 O visual gerado

Requisitos do artefato que o usuário importa no Power BI. Valem para o `.pbiviz` compilado, não para o editor.

**RF-15 `[P0]` — Renderizar os tipos de nó do catálogo** com os dados das roles ligadas e os tokens aplicados.

**RF-16 `[P0]` — KPI Card com comparação** — valor principal formatado, rótulo e, quando o papel opcional de
comparação estiver ligado, variação absoluta e percentual com indicação de direção. **ENTREGUE** na spec 5.2.0.
A direção é sempre redundante — seta mais sinal aritmético —, e `polarity` separa direção de juízo, para que um
KPI de custo não pinte economia como problema.

**RF-17 `[P0]` — Formatação numérica correta** via `valueFormatter` oficial, respeitando o `format` da medida e
o `host.locale`.
*Dado* uma medida em moeda pt-BR, *então* aparece `R$ 1.234,57`, não `1234.5678`.
**PARCIAL na spec 5.2.0:** o `format` da coluna é aplicado (agrupamento e casas decimais), mas os **separadores
saem em `en-US`**. O `formattingService` só conhece culturas se `globalize.cultures` for importado, e a tabela
pesa 1,17 MB — estouraria o RNF-04. Decisão pendente: pagar o bundle, trocar por `Intl`, ou aceitar. A lacuna
está documentada no gate (`compiledVisual.e2e.test.ts`).

**RF-18 `[P0]` — Cross-filter** — clicar numa marca filtra os demais visuais; `Ctrl`+clique acumula; clicar fora
limpa; não selecionados esmaecem; o estado sobrevive a atualizações vindas de outros visuais.
*Pendente.* Só coluna vinda de `categories` gera selection id, e o KPI é o único nó que lê dados — um card de
número único não tem marca para clicar. Volta com o primeiro nó de agrupamento.

**RF-19 `[P0]` — Tooltip nativo** do Power BI, com categoria e valor formatado. **ENTREGUE** na spec 5.2.0, no
ponteiro e no foco; sem identidade, o balão mostra só o que o visual dá.

**RF-20 `[P0]` — Estado vazio** — com as roles obrigatórias não preenchidas, orienta quais campos arrastar. Não
um gráfico vazio, não um erro.

**RF-21 `[P0]` — Alto contraste** — respeita `host.colorPalette.isHighContrast` no lugar das cores da spec.

**RF-22 `[P0]` — Responsividade** — reage a resize sem recriar a árvore React; rótulos degradam graciosamente.

**RF-23 `[P1]` — Navegação por teclado** — `Tab` entra, setas navegam, `Enter`/`Espaço` seleciona, foco visível.
**PARCIAL na spec 5.2.0:** o KPI é alcançável por `Tab`, rotulado e com foco visível. Setas e acionamento
esperam a RF-18 — sem identidade não há o que `Enter` selecione, e um `button` prometeria ação inexistente.

**RF-24 `[P1]` — Menu de contexto** nativo do Power BI no botão direito. **ENTREGUE**: o ouvinte está no
elemento do visual, então vale para qualquer composição, inclusive uma só de texto.

**RF-25 `[P0]` — Aviso de truncamento** quando o `dataReductionAlgorithm` cortar o conjunto (RN-10).
*Pendente*, pela mesma razão da RF-18: `truncationOf` só olha coluna de categoria.

**RF-28 `[P0]` — Painel de formatação no visual gerado**
O autor **publica** os campos que quiser (`exposed` no nó); cada nó publicado vira um card no painel de
formatação do Power BI, batizado pelo apelido do nó.
*Dado* um campo publicado, *quando* o consumidor do relatório o altera no painel, *então* o visual passa a
desenhar o valor dele — e volta ao valor do autor em "Redefinir para o padrão".
*Dado* um campo **não** publicado, *quando* alguém injeta um valor para ele no relatório, *então* o visual o
ignora: o valor do autor está literal no fonte gerado, e não há por onde ler o `objects` naquela posição.
**Fechado é o padrão** (ADR-20): sem publicação, o pacote não tem painel — nem `objects`, nem
`getFormattingModel`.

## 5. Requisitos não funcionais

| ID | Categoria | Requisito | Como é verificado |
|---|---|---|---|
| **RNF-01** | Desempenho (editor) | Preview atualiza em < 100 ms (p95) após alterar um controle. | E2E Playwright com `performance.mark`. |
| **RNF-02** | Desempenho (build) | Build completo em < 30 s (p95); ~12 s medidos com cache quente. Concorrência limitada, porque um build ocupa uma CPU inteira. | Métricas devolvidas pela API; gate de aceite cronometrado. |
| **RNF-03** | Desempenho (visual) | Render inicial < 200 ms para 1.000 categorias; resize sem *layout thrashing*. | Matriz manual com dataset de carga (MT-11). |
| **RNF-04** | Tamanho | `content.js` < 1 MB minificado. | Portão do pipeline (ADR-11) e T-08. |
| **RNF-05** | Tamanho | Pacote `.pbiviz` < 2 MB. Limite rígido (C-04). | Portão do pipeline e T-08. |
| **RNF-06** | Compatibilidade | Power BI Desktop na versão atual e nas 2 anteriores; `apiVersion` fixada no `pbiviz.json`. | Matriz manual. |
| **RNF-07** | Compatibilidade | Editor funcional em Chrome e Edge (2 últimas versões). | E2E em ambos. |
| **RNF-08** | Robustez | O visual **nunca** renderiza tela branca. Toda falha vira card de erro com código (RN-04). | `ErrorBoundary` + T-09. |
| **RNF-09** | Acessibilidade | Contraste AA nos defaults; foco visível; alto contraste; navegação por teclado. | Auditoria `web-design-guidelines` + axe no editor. |
| **RNF-10** | Manutenibilidade | Catálogo de componentes, schema, preview e codegen saem de **uma** fonte (`NODE_DESCRIPTORS`). | `nodeComponents.test.ts` liga os dois caminhos. |
| **RNF-11** | Observabilidade | Todo pacote carrega um `buildId` visível no visual e no card de erro. | Inspeção manual — **peça o id antes de diagnosticar** (achado 40). |
| **RNF-12** | Privacidade | Nenhum **dado do modelo** do Power BI sai do navegador do usuário nem chega à API. O que trafega para a API é a *spec* — descrição de UI, não dado. Sem telemetria no MVP. | C-06 por construção; revisão da superfície de rede. |
| **RNF-13** | Reprodutibilidade | Versões fixadas sem `^`; `npm ci` do lockfile do template. | Lockfile versionado. |

## 6. Regras de negócio

| ID | Regra | Justificativa |
|---|---|---|
| **RN-01** | Cada **novo** projeto recebe GUID único. Reexportar o **mesmo** projeto reusa o GUID e incrementa a versão. | C-03. Projetos distintos precisam coexistir; reexports devem atualizar, não duplicar. |
| **RN-02** | Nenhum dado do modelo do Power BI trafega para o editor nem para a API. O preview usa exclusivamente a tabela de exemplo que o usuário digitou. | C-06 e privacidade. O editor não tem como acessar o modelo, e não deveria. |
| **RN-26** | Os **valores** da tabela de exemplo nunca entram no `.pbiviz`. Só o esquema (coluna, tipo, papel) vira `capabilities.json`. | Mesma regra da prancheta: um visual que carrega dado embutido mente sobre o que mostra — e o pacote é um arquivo que o usuário distribui. |
| **RN-03** | Uma spec que falhe na validação **não pode ser compilada**. O editor valida antes de enviar e a API **revalida** antes de compilar. | Não é redundância: o editor é código do cliente e a API não pode confiar nele. |
| **RN-04** | O visual sempre renderiza um de três estados: **dados**, **vazio** ou **erro**. Tela branca é defeito de severidade máxima. | Um visual em branco é indistinguível de um bug do Power BI e destrói a confiança no produto. |
| **RN-05** | Só valores do catálogo de tokens são aceitos; os enums do schema são fechados. | ADR-02. É o que garante que toda classe exista no CSS compilado. |
| **RN-06** | O nome do visual é obrigatório, 3–50 caracteres. O identificador derivado casa com `^[A-Za-z][A-Za-z0-9]*$`. | O GUID não é UUID: é **nome de variável JS** dentro do bundle (achado 13). |
| **RN-07** | A versão do pacote segue `major.minor.patch.build`. Primeiro export: `1.0.0.0`. | Requisito do formato `pbiviz`. |
| **RN-08** | A interface **informa** que importar visual de arquivo depende de política do administrador, e não trata isso como erro do produto. | C-05 e [1.1](#11-a-fronteira-do-produto). |
| **RN-09** | Um visual compara o `schemaVersion` com o que suporta. *Major* divergente → card de erro. *Minor/patch* → renderiza aplicando defaults. | Permite evoluir o schema sem quebrar pacotes distribuídos. |
| **RN-10** | No máximo 1.000 categorias (`dataReductionAlgorithm.top.count`). Truncamento é sinalizado. | RNF-03 e limite prático de legibilidade. |
| **RN-11** | A spec nunca é interpretada como HTML, CSS ou JavaScript, **nem no cliente nem no servidor**. Proibido `dangerouslySetInnerHTML` e `innerHTML`. O codegen emite JSX a partir de uma whitelist — o registro — com todo valor como literal de string. | Segurança. Não é só disciplina nossa: o lint oficial do `pbiviz` aplica `powerbi-visuals/no-inner-outer-html` e **falha o build** (achado 16). |
| **RN-12** | Alterações do schema são **somente aditivas** dentro de uma major. Remover ou renomear exige bump de major e função de migração. | RN-09 depende disso. |

## 7. Pós-MVP

Em ordem sugerida de valor por esforço:

1. **Novos tipos de nó** — tabela, rosca, mapa de calor. Cada um é uma entrada no registro, e o schema, o painel
   e o codegen o absorvem sozinhos (ADR-09).
2. **Galeria de templates** — specs de partida. Adiado de propósito: só faz sentido com o registro estável.
3. **Importação de tema do Power BI** — derivar cores do `.json` de tema corporativo. Atende P-03 diretamente.
4. **Contas e biblioteca na nuvem** — salvar, versionar e compartilhar projetos entre times.
5. ~~**Painel de formatação no visual gerado** (`getFormattingModel`)~~ — **ENTREGUE** na spec 5.1.0, como
   RF-28 e ADR-20. Fecha também o R-09: o aviso do `pbiviz` sobre `getFormattingModel` obrigatório deixa de
   valer para todo pacote que publique algum campo.
