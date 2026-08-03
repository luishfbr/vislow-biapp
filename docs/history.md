# Historico — o que o Vislow ja foi

> **Este documento nao descreve o produto de hoje.** Ele guarda a arquitetura aposentada, as decisoes revertidas,
> o roadmap ja entregue e os 59 achados numerados. Nenhum agente precisa le-lo para trabalhar: os achados que
> ainda governam o codigo foram reescritos como regra no doc da area correspondente, e o numero entre parenteses
> aponta para ca.
>
> Leia daqui **so** quando a pergunta for "por que isso ficou assim?" e nenhum outro doc responder.
>
> Duas ressalvas de leitura. Os links internos entre secoes foram removidos na migracao — as secoes de origem
> nao existem mais. E **tudo abaixo esta escrito no tempo em que era verdade**: onde se le "o runtime", "o
> pacote base" ou "sem servidor", trata-se do caminho anterior ao pivo da ADR-08, removido na faxina de
> 2026-07-31.

## Sumario

1. [Arquitetura anterior ao pivo](#1-arquitetura-anterior-ao-pivo-ex-31-a-33)
2. [Contrato do `VisualConfig`](#2-contrato-do-visualconfig-ex-72-a-74)
3. [Placeholder e algoritmo de export](#3-placeholder-e-algoritmo-de-export-ex-82-e-83)
4. [Runtime Core](#4-runtime-core-ex-secao-9)
5. [ADRs revertidas](#5-adrs-revertidas)
6. [Riscos fechados](#6-riscos-fechados)
7. [Roadmap — o que ja foi entregue](#7-roadmap-de-execucao--o-que-ja-foi-entregue)
8. [Anexo A — achados numerados](#8-anexo-a--achados-numerados)

---

## 1. Arquitetura anterior ao pivo (ex-3.1 a 3.3)

> ⚠️ **3.1 a 3.3 descrevem a arquitetura ANTERIOR ao pivô.** A
> ADR-08 reverteu a ADR-01 e a ADR-05: não há mais Runtime Core nem patch no
> browser. Hoje o editor **compõe uma árvore livre**, a API compila um projeto `pbiviz` por usuário e o
> `.pbiviz` sai da CLI oficial a cada export. O limite que 3.1 chamava de "preço honesto" — o usuário escolher
> entre tipos prontos — **deixou de existir**, e era a razão do pivô. O código que estas seções descrevem foi
> removido na faxina de 2026-07-31; o fluxo
> atual está nos Sprints 4 a 6. Ficam como
> registro de uma decisão que foi tomada, validada e depois revertida por um motivo melhor.

### 3.1 O que "build" significa neste projeto

Este é o ponto mais importante do documento e a origem da maior confusão possível sobre o produto.

O `.pbiviz` entregue ao usuário é **um visual do Power BI real e compilado** — não uma simulação, não um mockup,
não um preview exportado. Concretamente:

- O `base-runtime.pbiviz` é produzido pela **CLI oficial `pbiviz` da Microsoft**, com compilação TypeScript e
  bundle webpack reais, exatamente como qualquer visual customizado publicado no AppSource.
- O export do aplicativo web **não compila nada**. Ele abre esse pacote já compilado, substitui um literal de
  string dentro do JavaScript e reescreve a identidade do pacote (GUID e nome).
- O arquivo resultante importa normalmente no Power BI Desktop, lê `DataViews` reais do modelo do usuário, faz
  cross-filter real, exibe tooltip nativo e responde a redimensionamento.

A diferença em relação a um backend que rodasse `pbiviz package` por usuário **não é "real vs. falso"** — é
apenas *onde* a compilação acontece: uma vez, na nossa esteira de CI, em vez de uma vez por export.

**O limite honesto dessa escolha:** o usuário escolhe entre os tipos de visual que o Runtime Core já sabe
renderizar. Um tipo novo (rosca, mapa de calor) é um release nosso do runtime, não algo que o usuário produz
sozinho. Esse limite é o preço de não ter servidor, fila, sandbox de execução e 30–60s de latência por export.

✅ **Esta seção deixou de ser argumento e passou a ser fato em 2026-07-29.** O gate da Fase 1
foi executado e aprovado: dois pacotes gerados por patch foram importados no Power BI Desktop, cada um exibindo
a própria configuração, coexistindo no mesmo relatório. Detalhes no Anexo A.4.

### 3.2 Princípio: Runtime Core + Configuração Embutida

Em vez de gerar código novo a cada visual, existe **um** visual pré-compilado — o *Runtime Core* — que sabe
renderizar um conjunto de tipos e é parametrizado por um documento JSON de configuração.

- **Aplicativo Web (editor):** produz e valida uma especificação declarativa em JSON.
- **Runtime Core (dentro do Power BI):** lê essa especificação e a combina com os dados do modelo para renderizar.

### 3.3 Fluxo de Funcionamento

```
┌───────────────────────────────────────────────────────────────────────────┐
│                      APLICATIVO WEB (EDITOR LOW-CODE)                     │
│                                                                           │
│   [Painel de Controles]  ──▶  [Estado Zustand]  ──▶  [Preview ao vivo]    │
│    tokens de estilo,             VisualConfig          renderizado pelo   │
│    título, rótulos                (validado)           MESMO visual-kit   │
│                                       │                                   │
│                                       ▼                                   │
│                            VisualConfig (JSON)                            │
└───────────────────────────────────────────────────────────────────────────┘
                                        │
                                        │  base64 ──▶ patch no bundle (JSZip, no browser)
                                        ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                         PACOTE .pbiviz GERADO                             │
│                                                                           │
│   package.json                       ◀── GUID, nome e versão reescritos   │
│   assets/icon.png                                                         │
│   resources/{novoGuid}.pbiviz.json   ◀── arquivo RENOMEADO                │
│       ├── visual { guid, name, displayName, version }  ◀── reescritos     │
│       ├── capabilities { ... }                                            │
│       └── content                                                         │
│             ├── js   ◀── placeholder da config substituído + GUID trocado │
│             ├── css                                                       │
│             └── iconBase64                                                │
└───────────────────────────────────────────────────────────────────────────┘
                                        │
                                        │  "Importar visual de um arquivo"
                                        ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                            POWER BI DESKTOP                               │
│                                                                           │
│   1. Runtime Core inicializa e decodifica a config embutida               │
│   2. Recebe update(options) com o DataView do modelo do usuário           │
│   3. Mapeia tokens ▶ classes/estilos e DataView ▶ view model              │
│   4. Renderiza a árvore React dentro do iframe sandbox                    │
└───────────────────────────────────────────────────────────────────────────┘
```

> **Correção em relação à v1.0.** O diagrama anterior mostrava um `config.json` avulso dentro do pacote, lido
> pelo runtime em tempo de execução. **Isso é impossível** — ver 3.4.



---

## 2. Contrato do `VisualConfig` (ex-7.2 a 7.4)

### 7.2 Catálogo de Tokens

Escalas fechadas. Todo valor abaixo tem uma classe correspondente escrita **literalmente** no mapa do
`visual-kit`, o que faz o Tailwind enxergá-la em build time (ADR-02).

| Token | Valores |
|---|---|
| `spacing` | `none` · `xs` · `sm` · `md` · `lg` · `xl` |
| `radius` | `none` · `sm` · `md` · `lg` · `xl` · `full` |
| `fontSize` | `xs` · `sm` · `base` · `lg` · `xl` · `2xl` · `4xl` |
| `fontWeight` | `normal` · `medium` · `semibold` · `bold` |
| `align` | `left` · `center` · `right` |
| `shadow` | `none` · `sm` · `md` · `lg` |
| `border` | `none` · `thin` · `medium` |

Cores são exceção deliberada: aceitam hex `#RRGGBB` livre, validado por `pattern`, e são aplicadas via `style`
inline ou variável CSS — nunca via classe. Isso permite qualquer cor de marca sem violar RN-05.

### 7.3 Exemplo de Configuração

```json
{
  "schemaVersion": "1.0.0",
  "project": {
    "id": "vislowA1b2c3d4",
    "name": "Desempenho por Região",
    "packageVersion": "1.0.0.0"
  },
  "chartType": "bar",
  "layout": {
    "padding": "md",
    "radius": "xl",
    "shadow": "sm",
    "border": "thin",
    "surfaceColor": "#ffffff",
    "borderColor": "#e2e8f0"
  },
  "header": {
    "show": true,
    "text": "Desempenho de Vendas por Região",
    "fontSize": "lg",
    "fontWeight": "bold",
    "align": "left",
    "textColor": "#1e293b"
  },
  "bar": {
    "accentColor": "#3b82f6",
    "barRadius": "md",
    "showGridLines": true,
    "gridColor": "#f1f5f9",
    "showValueLabels": true,
    "valueLabelColor": "#475569",
    "valueLabelSize": "xs",
    "categoryLabelColor": "#64748b"
  },
  "labels": {
    "categoryAxis": "Região",
    "valueAxis": "Vendas"
  }
}
```

> **Correção em relação à v1.0.** O rascunho colocava `"$schema": "https://json-schema.org/draft/2020-12/schema"`
> dentro do documento de *instância*. Essa URL identifica o dialeto de um *schema*, não de um dado. Documentos de
> instância não a carregam. O campo foi substituído por `schemaVersion`, que é o que efetivamente governa a
> compatibilidade (RN-09).
>
> O bloco `bindings` foi removido — ver 4.6.

### 7.4 Esboço do Schema

```jsonc
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://vislow.app/schemas/visual-config/1.0.0.json",
  "title": "VisualConfig",
  "type": "object",
  "required": ["schemaVersion", "project", "chartType", "layout", "header"],
  "additionalProperties": false,
  "$defs": {
    "color":      { "type": "string", "pattern": "^#[0-9a-fA-F]{6}$" },
    "spacing":    { "enum": ["none", "xs", "sm", "md", "lg", "xl"] },
    "radius":     { "enum": ["none", "sm", "md", "lg", "xl", "full"] },
    "fontSize":   { "enum": ["xs", "sm", "base", "lg", "xl", "2xl", "4xl"] },
    "fontWeight": { "enum": ["normal", "medium", "semibold", "bold"] },
    "align":      { "enum": ["left", "center", "right"] },
    "shadow":     { "enum": ["none", "sm", "md", "lg"] },
    "border":     { "enum": ["none", "thin", "medium"] }
  },
  "properties": {
    "schemaVersion": { "type": "string", "pattern": "^\\d+\\.\\d+\\.\\d+$" },
    "project": {
      "type": "object",
      "required": ["id", "name", "packageVersion"],
      "additionalProperties": false,
      "properties": {
        "id":             { "type": "string", "pattern": "^[A-Za-z][A-Za-z0-9]{7,63}$" },
        "name":           { "type": "string", "minLength": 3, "maxLength": 50 },
        "packageVersion": { "type": "string", "pattern": "^\\d+\\.\\d+\\.\\d+\\.\\d+$" }
      }
    },
    "chartType": { "enum": ["bar", "kpi"] }
    // layout, header, bar, kpi, labels — análogos, todos com additionalProperties: false
  },
  "allOf": [
    { "if":   { "properties": { "chartType": { "const": "bar" } } },
      "then": { "required": ["bar"] } },
    { "if":   { "properties": { "chartType": { "const": "kpi" } } },
      "then": { "required": ["kpi"] } }
  ]
}
```

`additionalProperties: false` em todo objeto é intencional: é a fronteira que faz RN-05
valer e impede que um config de versão futura passe silenciosamente por um runtime antigo.



---

## 3. Placeholder e algoritmo de export (ex-8.2 e 8.3)

### 8.2 Contrato de Placeholder

> ⛔ **HISTÓRICO — código removido em 2026-07-31.** Placeholder e reescrita de identidade existiam porque o
> export do browser tinha de transformar UM pacote pré-compilado no visual de cada usuário. A
> ADR-08 trocou isso por compilação real: a identidade nasce certa e a
> escolha do usuário vira **código**, não payload. `buildPbiviz`, `CONFIG_PLACEHOLDER` e `packages/runtime/`
> foram aposentados na faxina. O que
> sobreviveu é `inspectPbiviz`, o portão da ADR-11. **8.2 e 8.3 ficam como
> registro do que já foi pago** — os achados 33 a 40 nasceram aqui e explicam armadilhas do formato que
> continuam valendo.

✅ **Verificado no spike:** o token sobreviveu à minificação com **exatamente 1 ocorrência**, e o minificador
preservou a checagem sem dobrar a constante.

O código-fonte do runtime contém exatamente uma ocorrência do token:

```ts
// packages/runtime/src/embeddedConfig.ts
const VISLOW_CONFIG_B64 = "__VISLOW_CONFIG_B64__";

// Base64 padrão (A-Za-z0-9+/=) NUNCA contém "_"; o placeholder é cheio deles.
const IS_PATCHED = VISLOW_CONFIG_B64.indexOf("_") === -1;

function decodeUtf8Base64(b64: string): string {
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);          // UTF-8 correto: acentos e emoji
}

export function readEmbeddedConfig(): unknown | null {
  if (!IS_PATCHED) return null;                    // pacote base, ainda não patcheado
  return JSON.parse(decodeUtf8Base64(VISLOW_CONFIG_B64));
}
```

Quatro detalhes que são requisitos, não estilo:

1. **Base64** (ADR-07) evita todo problema de escaping ao injetar em um
   literal de string dentro de JS minificado. Verificado com um título contendo aspas, acento e emoji
   simultaneamente (RF-03).
2. A detecção usa **a ausência de `_`**, não uma comparação com o token. Comparar contra `"__VISLOW" +
   "_CONFIG_B64__"` seria pior: o minificador pode dobrar a concatenação e **criar uma segunda ocorrência
   literal** do placeholder no bundle, quebrando a assertiva de ocorrência única e fazendo o patch substituir a
   ocorrência errada. A checagem por `indexOf` não tem esse risco. Saída real do minificador:
   `const i="__VISLOW_CONFIG_B64__",r=-1===i.indexOf("_")`.
3. A decodificação usa `TextDecoder`, não o par `escape`/`unescape` (obsoletos e incorretos fora de Latin-1).
4. O passo de build **falha** se o token não aparecer **exatamente uma vez** no `content.js` empacotado. Esta é
   a mitigação de R-01.

### 8.3 Algoritmo de Export

✅ **Implementado e verificado na Fase 3.** A origem é o spike, que gerou dois pacotes importados com sucesso no
Power BI Desktop. Duas correções foram aplicadas na implementação definitiva — reescrita de identidade em passada
única e inversão da ordem entre identidade e payload. Ambas estão nos passos abaixo e no
Anexo A.7, achados 34 e 35.

```ts
// packages/config-schema/src/packaging/buildPbiviz.ts (executável em browser e em Node)
import JSZip from 'jszip';

export async function buildPbiviz(
  template: ArrayBuffer | Uint8Array,
  config: VisualConfig,
): Promise<PbivizPackage> {          // { bytes, filename, guid, version }
  // 0. Defesa em profundidade (seção 13): o editor já bloqueia o botão com
  //    config inválida, mas a config também chega por import de arquivo.
  const valid = assertValidConfig(config);

  const zip = await JSZip.loadAsync(template);

  // 1. Identidade atual do pacote base
  const pkg = JSON.parse(await zip.file('package.json')!.async('string'));
  const from = { guid: pkg.visual.guid, name: pkg.visual.name };

  // 2. Nova identidade, derivada do projeto (RN-01, RN-06). O pacote gerado usa
  //    name === guid, como faz a CLI oficial.
  const to = { guid: valid.project.id, name: valid.project.id };
  const version = valid.project.packageVersion;

  // 3. Recurso principal — localizado pelo package.json, não por caminho montado à mão
  const resPath: string = pkg.resources.find(r => r.file.endsWith('.pbiviz.json')).file;
  const res = JSON.parse(await zip.file(resPath)!.async('string'));

  // 4. Guarda de R-01 ANTES de qualquer escrita
  assertOccursOnce(res.content.js, '__VISLOW_CONFIG_B64__');

  // 5. Reescreve a identidade dentro do bundle — ADR-03.
  //    O GUID é NOME DE VARIÁVEL JS aqui, não só metadado (ver 8.4).
  //    UMA passada, com alternação: duas passadas sequenciais corrompem o GUID
  //    quando o slug do usuário é igual ao `name` base (achado 34).
  let js = res.content.js.replace(
    new RegExp(`${escapeRegExp(from.guid)}|${escapeRegExp(from.name)}`, 'g'),
    m => (m === from.guid ? to.guid : to.name),
  );

  // 6. Injeta a config DEPOIS da identidade (ADR-01/ADR-07, achado 35)
  js = js.replace('__VISLOW_CONFIG_B64__', () => toBase64Utf8(JSON.stringify(valid)));

  // 7. Reescreve os metadados do recurso
  res.content.js         = js;
  res.visual.guid        = to.guid;
  res.visual.name        = to.name;
  res.visual.displayName = valid.project.name;
  res.visual.version     = version;

  // 8. Renomeia o recurso e atualiza a referência (passo mais fácil de esquecer)
  zip.remove(resPath);
  zip.file(`resources/${to.guid}.pbiviz.json`, JSON.stringify(res));

  // 9. Atualiza o package.json. `metadata.pbivizjson.resourceId` aponta para o
  //    resourceId, não para o caminho — por isso só o campo `file` muda.
  pkg.visual.guid        = to.guid;
  pkg.visual.name        = to.name;
  pkg.visual.displayName = valid.project.name;
  pkg.visual.version     = version;
  pkg.version            = version;
  pkg.resources = pkg.resources.map((r: any) =>
    r.file === resPath ? { ...r, file: `resources/${to.guid}.pbiviz.json` } : r);
  zip.file('package.json', JSON.stringify(pkg));

  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  return { bytes, filename: `${to.guid}.${version}.pbiviz`, guid: to.guid, version };
}
```

Nome do arquivo baixado: `{guid}.{packageVersion}.pbiviz`, seguindo a convenção da CLI oficial.

**Notas de implementação de força total:**

- O passo 8 é o mais fácil de errar e o mais silencioso: se o arquivo não for renomeado *ou* a referência em
  `package.json` não for atualizada, o Power BI recusa o import com uma mensagem genérica. Coberto por
  T-03.
- No passo 5 a **passada única é obrigatória**, não estilo. Como o GUID começa pelo nome do visual
  (`vislowRuntime` + 32 hex), duas passadas sequenciais duplicam o sufixo hex dentro dos GUIDs novos quando o
  slug do usuário coincide com o nome base — e `slugify("vislow Runtime")` produz exatamente esse slug. No
  pacote base, o GUID aparece 4× e o nome 5× no `content.js`.
- A saída é `Uint8Array`, não `Blob`: é o único formato que o JSZip produz sem detecção de recursos e que serve
  ao browser e ao Node. Quem baixa embrulha com `toPbivizBlob`.
- As datas das entradas reescritas são herdadas do template, então **reexportar a mesma config produz bytes
  idênticos**. Facilita diagnóstico e é verificado em T-07.
- `buildPbiviz` vive num subcaminho (`@vislow/config-schema/packaging`) e **não** é reexportado pelo `index.ts`:
  o Runtime Core importa esse barril, e o JSZip cairia dentro do bundle do visual (achado 36).



---

## 4. Runtime Core (ex-secao 9)

> ⛔ **HISTÓRICO — `packages/runtime/` removido em 2026-07-31.** O Runtime Core era um visual pré-compilado com
> papéis de dado FIXOS (`category`, `measure`, `target`) que interpretava um `VisualConfig` embutido. A
> ADR-08 o substituiu: hoje o `capabilities.json` é **gerado** a partir dos
> papéis que o próprio usuário declarou (`packages/codegen`), e o visual é compilado por usuário. As seis
> capacidades de host descritas aqui (RF-18 a RF-25) foram reimplantadas no caminho novo pelo
> Sprint 6; os requisitos continuam valendo, a
> implementação descrita nesta seção não. **Fica como registro** — 9.2 (ciclo de vida) e 9.3 (isolamento de CSS)
> descrevem o comportamento do host, que não mudou.

### 9.1 `capabilities.json`

```json
{
  "dataRoles": [
    { "displayName": "Categoria / Eixo", "name": "category", "kind": "Grouping" },
    { "displayName": "Valor",            "name": "measure",  "kind": "Measure" },
    { "displayName": "Valor de Comparação (opcional)", "name": "target", "kind": "Measure" }
  ],
  "dataViewMappings": [
    {
      "conditions": [
        { "category": { "max": 1 }, "measure": { "max": 1 }, "target": { "max": 1 } }
      ],
      "categorical": {
        "categories": {
          "for": { "in": "category" },
          "dataReductionAlgorithm": { "top": { "count": 1000 } }
        },
        "values": {
          "select": [
            { "bind": { "to": "measure" } },
            { "bind": { "to": "target" } }
          ]
        }
      }
    }
  ],
  "supportsHighlight": true,
  "supportsKeyboardFocus": true,
  "objects": {}
}
```

Diferenças em relação à v1.0 e por quê:

- `top: { count: 1000 }` explícito, em vez de `top: {}` — torna RN-10 verificável em vez
  de depender de um default não documentado.
- `conditions` declaradas: sem elas, o Power BI aceita múltiplas medidas e o view model recebe formas que o
  runtime não trata.
- Role `target` opcional, exigida por RF-16.
- `objects` **vazio**: o painel de formatação do Power BI não é usado no MVP. Toda a configuração vem embutida
  (ADR-01). A propriedade `jsonConfig` do rascunho v1.0 foi removida — expor
  o JSON cru num campo de texto do painel de formatação seria um caminho paralelo de configuração, sem validação
  e sem preview.

### 9.2 Ciclo de Vida

```
constructor(options)
  ├── lê a config embutida  (RF-14) → em falha, estado de erro
  ├── guarda host, selectionManager, tooltipService, colorPalette
  └── monta o root React uma única vez

update(options)
  ├── classifica: sem dados → estado vazio (RF-20)
  ├── mapeia DataView → ViewModel (categorias, valores, selectionIds, formatador)
  ├── resolve tokens → props de estilo, sobrepondo por alto contraste (RF-21)
  └── re-renderiza  (sem desmontar — RF-22)
```

### 9.3 Isolamento de CSS

✅ **Validado no spike.** Tailwind **v4.3**, configurado em CSS e **pré-compilado pelo CLI**
(ADR-06 revisado):

```css
/* packages/visual-kit/src/styles.css */
@layer theme, utilities;

@import 'tailwindcss/theme.css'     layer(theme)     prefix(pbi);
@import 'tailwindcss/utilities.css' layer(utilities) prefix(pbi);

@source './**/*.{ts,tsx}';
```

```jsonc
// build: gera CSS puro, sem PostCSS no webpack do pbiviz
"build:css": "tailwindcss -i ./src/styles.css -o ./dist/styles.css --minify"
```

Desde a ADR-17 esse passo não se invoca sozinho: o `build` do `visual-kit` é
`tsc && build:css && check-css.mjs`, um passo só. `tsc` e o Tailwind escrevem no **mesmo** `dist/`, e duas
tarefas do turbo com `outputs` sobrepostos produzem cache parcial. O `check-css.mjs` no fim é a guarda desta
seção transformada em portão de build — ver 12.3 e o achado 57.

Três consequências práticas, todas verificadas:

1. **O prefixo da v4 é uma variante:** `pbi:flex`, não `pbi-flex`. O mapa de tokens usa essa forma.
2. **Sem preflight por construção** — importamos `theme` e `utilities`, nunca `base`. Não há `corePlugins` a
   desligar.
3. **O runtime importa o CSS gerado a partir do `visual.ts`**, e não pelo campo `style` do `pbiviz.json` — que é
   silenciosamente ignorado (ver A.4, achado 20).

> **Correção em relação à v1.0.** A v1.0 justificava o prefixo dizendo que ele evita "que o Tailwind desconfigure
> o DOM nativo do Power BI". Isso não procede: o visual roda em um iframe sandbox (C-01),
> e nenhum CSS dele alcança o DOM do host. A justificativa correta, e o motivo de manter a configuração, é
> **evitar colisão com os estilos que o host injeta dentro do iframe** e impedir que o preflight redefina esses
> estilos. O `content` inclui o `visual-kit` porque é lá que as classes literais dos tokens vivem.

### 9.4 Componente de Exemplo (Barras)

```tsx
// packages/visual-kit/src/BarChart.tsx — consumido pelo runtime E pelo preview (ADR-04)
import React, { useMemo } from 'react';
import {
  spacingClass, radiusClass, radiusTopClass, shadowClass,
  borderClass, fontSizeClass, fontWeightClass, alignClass,
} from './tokens';
import type { VisualConfig } from '@vislow/config-schema';

export interface DataPoint {
  category: string;
  value: number;
  formattedValue: string;
  selected: boolean;
}

export const BarChart: React.FC<{
  config: VisualConfig;
  data: DataPoint[];
  onSelect?: (index: number, multi: boolean) => void;
}> = ({ config, data, onSelect }) => {
  const { layout, header, bar } = config;

  // Calculado UMA vez por render, fora do laço.
  const maxValue = useMemo(
    () => data.reduce((m, d) => Math.max(m, d.value), 0),
    [data],
  );
  const hasSelection = data.some(d => d.selected);

  return (
    <div
      className={`pbi-w-full pbi-h-full pbi-flex pbi-flex-col
                  ${spacingClass(layout.padding)} ${radiusClass(layout.radius)}
                  ${shadowClass(layout.shadow)} ${borderClass(layout.border)}`}
      style={{ backgroundColor: layout.surfaceColor, borderColor: layout.borderColor }}
    >
      {header.show && (
        <h2
          className={`pbi-mb-4 pbi-truncate ${fontSizeClass(header.fontSize)}
                      ${fontWeightClass(header.fontWeight)} ${alignClass(header.align)}`}
          style={{ color: header.textColor }}
        >
          {header.text}
        </h2>
      )}

      <div className="pbi-flex-1 pbi-flex pbi-items-end pbi-gap-2" role="list">
        {data.map((d, i) => (
          <div
            key={i}
            role="listitem"
            tabIndex={0}
            aria-label={`${d.category}: ${d.formattedValue}`}
            onClick={e => onSelect?.(i, e.ctrlKey || e.metaKey)}
            className="pbi-flex-1 pbi-flex pbi-flex-col pbi-items-center pbi-justify-end
                       pbi-h-full pbi-cursor-pointer focus:pbi-outline focus:pbi-outline-2"
            style={{ opacity: hasSelection && !d.selected ? 0.35 : 1 }}
          >
            {bar.showValueLabels && (
              <span className="pbi-text-xs pbi-mb-1" style={{ color: bar.valueLabelColor }}>
                {d.formattedValue}
              </span>
            )}
            <div
              className={`pbi-w-full pbi-transition-all ${radiusTopClass(bar.barRadius)}`}
              style={{
                height: `${maxValue > 0 ? (d.value / maxValue) * 100 : 0}%`,
                backgroundColor: bar.accentColor,
              }}
            />
            <span
              className="pbi-text-xs pbi-mt-2 pbi-truncate pbi-w-full pbi-text-center"
              style={{ color: bar.categoryLabelColor }}
            >
              {d.category}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
```

Mudanças em relação ao exemplo da v1.0, todas com consequência real:

- `Math.max(...data.map(...))` estava **dentro** do `.map`, recalculando o máximo a cada barra — O(n²), e com
  risco de estourar a pilha em `Math.max(...)` com muitos argumentos. Agora é um `reduce` memoizado.
- Valores exibidos usam `formattedValue`, não o número cru (RF-17).
- Seleção, esmaecimento, `tabIndex` e `aria-label` incorporados (RF-18, RF-23).
- Tokens resolvidos por funções de mapeamento — as classes vivem como **strings literais completas** dentro de
  `tokens.ts`, nunca interpoladas, que é o que permite ao Tailwind enxergá-las (ADR-02).

---



---

## 5. ADRs revertidas

| ADR | Decisao | Motivo | Alternativa descartada |
|---|---|---|---|
| **ADR-01** | Config embutida via substituição de um placeholder base64 dentro de `content.js`, no browser. | Único caminho compatível com C-01/C-02 sem servidor. Export em segundos. | `resources/config.json` (impossível). Backend rodando `pbiviz package` (infra, fila, 30–60s, sandbox de execução). |
| **ADR-03** | GUID, nome e `displayName` reescritos a cada export. | Sem isso, C-03 faz cada visual novo sobrescrever o anterior. | GUID fixo — quebra no primeiro uso real. |
| **ADR-05** | Zero backend no MVP. | Custo zero, sem superfície de ataque, sem dados do usuário em trânsito. | API de build. |
| **ADR-07** | Config transportada em **base64** dentro do literal de string. | Elimina qualquer problema de escaping de aspas, quebras de linha e barras invertidas ao injetar em JS minificado. | JSON cru no literal — quebra com aspas no título do usuário. |

A ADR-08 reverteu a ADR-01 e a ADR-05. A ADR-03 e a ADR-07 descreviam a reescrita de identidade e o
transporte em base64 dentro de um pacote pre-compilado: com compilacao real, a identidade nasce certa e nao ha
payload a injetar.

---

## 6. Riscos fechados

| ID | Risco | Impacto | Prob. | Mitigacao | Sinal de deteccao |
|---|---|---|---|---|---|
| **R-01** | ~~O minificador altera ou duplica o placeholder no bundle.~~ **FECHADO** pelo spike: 1 ocorrência exata após minificação. | Alto | ~~Média~~ | Detecção por ausência de `_`, não por comparação (8.2); assertiva de ocorrência única no build; T-04. | CI falha no build do runtime. |
| **R-02** | ~~A reescrita de GUID quebra o registro do plugin e o Power BI recusa o import.~~ **FECHADO** pelo spike: dois pacotes importados e coexistindo. | **Crítico** | ~~Média~~ | Gate da Fase 1 (aprovado); T-06; MT-01/MT-03 permanecem como regressão. | Import falha no gate. |
| ~~**R-04**~~ | ~~Política de tenant bloqueia visuais customizados no ambiente do usuário.~~ **RECLASSIFICADO em 2026-07-29: não é risco, é premissa.** Ver 1.5. | — | — | Nenhuma. Está fora da fronteira do produto: nenhuma decisão de engenharia nossa altera esse resultado. O produto informa o pré-requisito (RF-13) e encerra sua responsabilidade na entrega do arquivo. | — |
| ~~**R-08**~~ | ~~Dois tipos de visual no MVP são otimistas para o prazo.~~ **FECHADO:** ambos entregues na Fase 1. | Médio | ~~Média~~ | — | — |

---

## 7. Roadmap de execucao — o que ja foi entregue


> **Nota.** A v1.0 deste documento trazia todas as tarefas marcadas como concluídas, embora nada tivesse sido
> implementado. Nenhuma caixa abaixo está marcada — este é o estado real do projeto.

**Estimativa total: ~6 semanas.** A v1.0 estimava 4, sem prever interatividade, formatação numérica,
acessibilidade, testes nem tratamento de erro.

### Fase 0 — Fundação — ✅ **CONCLUÍDA em 2026-07-29**

- [x] Monorepo pnpm com *project references* do TypeScript e ordem topológica de build.
- [x] `config-schema`: JSON Schema v1.0.0 (draft 2020-12), tipos TS, validador Ajv, defaults, geração de
      identidade, compatibilidade de schema.
- [x] `visual-kit`: mapa token → classe (Tailwind v4, prefixo `pbi:`) e fonte CSS pré-compilável.
- [x] ESLint `strictTypeChecked` com RN-11 aplicada por regra de lint em todo o monorepo.
- [x] CI: typecheck → lint → testes → build → **guarda de CSS** (verifica que as classes do mapa de tokens
      chegam ao artefato, e que o preflight não vazou).
- [x] `docs/padroes-de-engenharia.md` (aposentado) e `CLAUDE.md`.

**DoD:** ✅ 36 testes passando, incluindo T-01 e T-02; `pnpm verify` limpo a partir do zero.

**Nota de estimativa:** a fase levou algumas horas em vez dos ~3 dias previstos, porque o gate já havia
eliminado a incerteza de arquitetura. É o retorno do investimento no spike.

### Fase 1 — Runtime Core + **Gate de Validação** — ✅ **CONCLUÍDA em 2026-07-29**

- [x] Projeto `pbiviz` com React 19, TypeScript e Tailwind v4 prefixado.
- [x] Contrato de placeholder e assertiva de ocorrência única no build.
- [x] `capabilities.json` de 9.1; mapeamento `DataView` → view model.
- [x] Barras com tokens, formatação por `valueFormatter` (RF-17), seleção (RF-18), tooltip nativo (RF-19),
      menu de contexto (RF-24), navegação por teclado (RF-23), alto contraste (RF-21).
- [x] **KPI Card (RF-16), antecipado da Fase 4** — o `visual-kit` já estava montado e o custo marginal era baixo.
- [x] Estados vazio (RF-20), de erro (RF-14) e aviso de truncamento (RF-25); `ErrorBoundary` real.
- [x] Guardas de empacotamento no CI: 11 assertivas sobre o `.pbiviz` gerado.
- [x] Validado no Power BI Desktop com dados reais.

**Métricas do artefato:** pacote 131 KB (orçamento 2 MB) · bundle JS 413 KB (orçamento 1 MB).

**Pendência conhecida, não bloqueante:** o `pbiviz` avisa que o painel de formatação (`getFormattingModel`) será
exigido no futuro. Não impede o empacotamento nem a importação. Tratar na Fase 4 (R-09).

#### 🚦 Gate obrigatório — ✅ **APROVADO em 2026-07-29**

Executado **antes** da Fase 0, não ao fim da Fase 1: o gate não dependia de nada do monorepo, e adiá-lo só
atrasaria a descoberta. Código descartável em `spike/`.

- [x] Compilar um visual `pbiviz` mínimo com o placeholder (`powerbi-visuals-tools` 7.2.1, `apiVersion` 5.11.0).
- [x] **Reconhecimento primeiro:** extrair e registrar a estrutura real do ZIP antes de escrever o patch.
- [x] Aplicar o patch fora do app (`spike/patch.mjs`), gerando dois pacotes com GUIDs distintos.
- [x] Verificação automatizada: **27 assertivas, 0 falhas** (`spike/verify.mjs`) — embrião de T-03…T-08.
- [x] **Importar os dois no Power BI Desktop** → importam sem erro.
- [x] Cada visual exibe a própria config e os dois **coexistem no mesmo relatório** → ADR-03 provado.
- [x] Ajustar 8.1, 8.2, 8.3
      e 8.4 ao que foi observado.

**Consequência:** ADR-01 e ADR-03 estão
confirmados empiricamente; R-01 e R-02 estão fechados. O
custo real do gate foi de algumas horas, contra as 5 semanas de trabalho que ele protegia. Achados detalhados
no Anexo A.4.

**Nenhuma pendência.** O que antes constava como R-04 — política de tenant — foi reclassificado como premissa
de fronteira do produto (1.5), não como risco a gerenciar.

**DoD:** ✅ atingido.

### Fase 2 — Editor Web — ✅ **CONCLUÍDA em 2026-07-29**

- [x] Next.js 16 com `output: 'export'` (estático, zero backend) e o layout de 10.1.
- [x] Store Zustand com validação a cada escrita; persistência em `localStorage` com *debounce*.
- [x] Painel de controles **gerado** a partir do catálogo de tokens — nenhuma propriedade escrita à mão.
- [x] Preview ao vivo com os componentes do `visual-kit` e o dataset mock, com `ErrorBoundary`.
- [x] Exportar e importar o `config.json`; projeto novo gera identidade nova (RN-01).
- [x] Nome obrigatório com validação inline; export bloqueado por config inválida (RF-12/RN-03).

**DoD:** RF-01 a RF-09 implementados; `pnpm verify` e `next build` limpos.

**Pendente para a Fase 3:** o botão "Baixar .pbiviz" está no cabeçalho, desabilitado, aguardando `buildPbiviz`.

> **Validação incidental do ADR-06.** O editor tem o seu próprio Tailwind, sem prefixo, e importa o CSS do
> `visual-kit`, prefixado `pbi:`. Os dois convivem na mesma página sem colidir — que é exatamente a razão de o
> runtime usar prefixo, agora comprovada num cenário real em vez de hipotética.

### Fase 3 — Export e Integração — ⏳ **código concluído em 2026-07-30, aguardando matriz manual**

- [x] `buildPbiviz` em `config-schema`, isomórfico, no subcaminho `packaging` (achado 36).
- [x] `inspectPbiviz` — leitura de um pacote pronto, para os testes e para diagnóstico.
- [x] Ligação com a interface: botão com estados (`idle`/`building`/`done`/`error`), erros descritos com
      instrução de correção, e diálogo de instruções de importação após o download (RF-13).
- [x] Testes de empacotamento T-03 a T-08 no CI, em duas camadas (12.3).
- [x] `make-samples.mjs` passa a usar o `buildPbiviz` de produção — a amostra não pode divergir do artefato real.
- [x] `next build` e a presença do pacote base no export estático verificados no CI.
- [ ] Matriz manual MT-01 a MT-08 no Power BI Desktop.

**DoD:** ciclo completo editar → exportar → importar → renderizar funcionando; MT-03 e MT-04 aprovados.

O editor busca o pacote base em `/templates/base-runtime.pbiviz`, copiado de `packages/runtime/dist/` por
`scripts/stage-template.mjs` no fim do `build:runtime`. É artefato de build e não é versionado.

### Gate do backend — ✅ **APROVADO em 2026-07-30**

Executado em `spike/recharts-budget/`, um projeto `pbiviz` **standalone com `npm`** — de propósito, porque é
exatamente o que o worker de build fará. Os dois riscos que poderiam inviabilizar o pivô foram medidos antes de
escrever qualquer linha do backend.

**R-A · Orçamento de bundle — passa com folga.**

| Tipos de gráfico | Pacote (limite 2048 KB) | `content.js` (limite 1024 KB) |
|---|---|---|
| 1 (`BarChart`) | 170,2 KB | 575,3 KB |
| 5 (barras, linha, área, pizza, dispersão) | 187,1 KB | 645,5 KB |

Custo base de React + Recharts: ~575 KB. Custo marginal por tipo adicional: ~17 KB. Com 378 KB de folga no pior
caso medido, o catálogo comporta cerca de **20 tipos a mais** antes de encostar no limite. O tree-shaking por
imports nomeados funciona, e é o padrão que o codegen deve emitir. **Recharts está aprovado** — o plano B das
primitivas SVG próprias fica arquivado.

**R-B · Compilação headless — passa.**

`npm ci` + `pbiviz package` num `node:22-slim`, sem display e sem certificado:

| Etapa | Tempo |
|---|---|
| `npm ci` (544 pacotes) | 5,2 s |
| `pbiviz package` | 11,5 s |
| Build de container completo, a frio | 38 s |

Bem abaixo dos 30–60 s que a §8.3 estimava para um build por export. O artefato
extraído do container foi verificado com `inspectPbiviz`: identidade coerente, recurso e referência batendo,
GUID declarado como `var` no bundle, dentro dos dois orçamentos.

**Dois achados operacionais:**

- O `npm install` limpo **dispensa todos os contornos do pnpm**. O achado 24
  — declarar `ts-loader`, `scheduler`, os `powerbi-visuals-utils-*` e as internas do Ajv explicitamente — não se
  aplica ao worker. E o achado 39 (React duplicado por
  `resolve.symlinks: false`) **desaparece por construção**: sem symlinks, não há como duplicar.
- `pbiviz package` imprime `error` de certificado e conclui com sucesso (achado 41).

### Sprint 4 — API de build — ✅ **CONCLUÍDO no código em 2026-07-30**

O pivô da ADR-08 saiu do papel: uma spec entra por HTTP e um `.pbiviz`
compilado de verdade sai, com o nome que o usuário escolheu.

**O que passou a existir:**

| Peça | Papel |
|---|---|
| `@vislow/visual-kit/nodes` | Os sete componentes do catálogo, sobre Recharts. Subcaminho **fora do barril**, pelo mesmo motivo de `config-schema/packaging`: o Runtime Core importa o barril, e reexportar levaria Recharts (~575 KB) para dentro do bundle dele. |
| `@vislow/codegen` | Árvore → `visual.tsx` + `capabilities.json` + `pbiviz.json`. Emite **imports nomeados** dos componentes do kit (ADR-10). |
| `@vislow/visual-template` | Scaffold `npm` estático do projeto `pbiviz` e vendorização dos `@vislow/*`. |
| `@vislow/api` | NestJS: `POST /builds`, `GET /builds/:id`, `GET /builds/:id/artifact`. Fila com concorrência limitada, timeout duro, diretório temporário por build e o portão da ADR-11. |

**Medido no ciclo completo por HTTP**, com uma árvore usando **os sete tipos de nó**:

| Medida | Valor | Limite |
|---|---|---|
| Pacote | 224,1 KB | 2048 KB |
| `content.js` | 762,6 KB | 1024 KB |
| Build de ponta a ponta | 11,8 s | — |

Confirma a projeção do gate do Sprint 2 (~575 KB de base + ~17 KB por tipo) e deixa **261 KB de folga** no pior
caso do catálogo atual.

**Gate de aceite:** `apps/api/src/builds/compiledVisual.e2e.test.ts` compila um `.pbiviz` de verdade e executa o
bundle minificado num jsdom — herdeiro direto do `renderRealBundle.test.ts`, o único teste que pegou o
achado 39. Verifica identidade, orçamentos, CSS no bundle e a
RN-04 nos dois lados: com dados renderiza dados (SVG do Recharts e as categorias na
tela), sem dados renderiza o estado vazio com instrução. A ausência do template não passa como "teste ignorado":
desde a ADR-17 o gate lança no carregamento em vez de se pular.

**DoD:** ✅ código, testes, CI **e validação manual no Power BI Desktop em 2026-07-30** — o `.pbiviz` gerado
pela API importa e renderiza com dados reais.

---

### Sprint 5 — Editor de composição — ✅ **CONCLUÍDO em 2026-07-30**

A última peça do pivô: o usuário deixa de escolher entre dois tipos prontos e passa a **compor**. Os painéis
fixos da Fase 2 (`AppearancePanel`, `CONTROL_GROUPS`, tipo de visual) saíram; no lugar entrou uma superfície
inteiramente **derivada do registro**.

**O que passou a existir:**

| Peça | Papel |
|---|---|
| `component-registry/tree.ts` | Edição da árvore — inserir, remover, reordenar, reparentar — como funções puras. Mora no registro porque é lá que vive a regra do que é válido (folha não aceita filho, raiz não some, nó não entra em si mesmo). |
| `visual-kit/nodes/mockFrame.ts` | `DataFrame` de exemplo **derivado dos papéis declarados**. Não existe mais dataset mock fixo: os papéis são do usuário, então o dado de exemplo nasce deles. |
| `@vislow/build-contract` | Tipos de fio da API, com dois donos: servidor e editor. Um código de erro novo no servidor quebra o `switch` do editor em tempo de compilação em vez de virar "erro desconhecido" na tela. |
| `apps/web` — `AddComponentDialog`, `TreePanel`, `PropertiesPanel`, `RolesPanel`, `SpecPreview` | Busca de componentes, árvore navegável, painel de propriedades e mapeamento de papéis. **Nenhuma lista de tipos ou de propriedades escrita à mão** — tudo sai de `NODE_DESCRIPTORS`, inclusive os termos de busca (`keywords`). |
| `apps/web/lib/buildApi.ts` | Substitui `exportPbiviz.ts`. Sobe a spec, acompanha a build e baixa o artefato, com as fases nomeadas — "Gerando..." parado por doze segundos é indistinguível de travado. |

**A garantia do ADR-04 depois do pivô.** Preview e visual compilado chegam ao
componente por caminhos diferentes: o codegen por texto (`descriptor.component` vira import nomeado), o preview
por referência (`lib/nodeComponents.ts`). Nada no compilador liga os dois — `nodeComponents.test.ts` liga,
comparando o nome da função com o descritor. A regra do `frame` deixou de ser duplicada: virou `consumesData()`
no registro, consultada pelos dois.

**Gate de aceite:** `SpecPreview.test.tsx` monta a árvore num jsdom equipado (mesmo harness do
achado 46) e verifica que sai **dado**, não card de erro:
barras desenhadas, KPI com número, os quatro tipos de gráfico montando. `useEditorStore.test.ts` fecha a
invariante que importa: toda sequência de ações que a interface permite produz uma spec que passa no **mesmo
`validateSpec` que o `BuildsController` aplica** — ou fica explicitamente pendente, com o export bloqueado.

**DoD:** ✅ código, testes (226), `pnpm verify` limpo **e validação manual no Power BI Desktop em 2026-07-30**.
O ciclo completo fecha: compor no editor a partir da tela em branco, exportar pela API e importar no Power BI.
É o primeiro momento em que a proposta do produto — o usuário **cria** o visual, não escolhe entre prontos —
existe de ponta a ponta.

Pendente de verificação nesta etapa: MT-03 (dois visuais coexistindo) e MT-04 (reexportar atualiza, não
duplica). Ambos dependem apenas da identidade do projeto, coberta por teste
(`useEditorStore.test.ts`, removido depois) e já aprovada no Desktop na Fase 3 —
mas não reconfirmadas no caminho compilado.

---

### Sprint 6 — Paridade de interatividade — ✅ **CONCLUÍDO em 2026-07-31**

Existiu porque o pivô deixou seis capacidades para trás
(achado 53). Não era escopo novo: as seis foram
entregues na Fase 1 e **aprovadas no Desktop com dados reais**. O visual que a API compilava desenhava
corretamente, mas **clicar numa barra não filtrava o relatório**.

| Capacidade | Onde ficou | Requisito |
|---|---|---|
| Cross-filter (`selectionManager`, `createSelectionId`) | `visual-template/template/src/interaction.ts` + handlers do Recharts em `visual-kit/src/nodes/charts.tsx` | RF-18 |
| Tooltip nativo (`tooltipService`) | `interaction.ts`; o balão do Recharts fica só no preview | RF-19 |
| Alto contraste | `visual-kit/src/highContrast.ts` (variável CSS) + paleta no quadro para o SVG | RF-21 |
| Navegação por teclado | sobreposição `DataKeys` em `charts.tsx` | RF-23 |
| Menu de contexto | `interaction.ts`, no construtor | RF-24 |
| Aviso de truncamento | `truncationOf` em `dataFrame.ts` + `TruncationNotice` emitido pelo codegen | RF-25 |

**O desenho, e por que ele não é um port simples.** O contrato dos nós tinha mudado: os componentes da Fase 1
recebiam `DataPoint[]` já resolvido e um `RenderContext` com tema; os nós novos recebem `DataFrame` e props
literais. Selection id e serviço de tooltip são objetos do host e precisavam chegar aos nós **sem virar prop de
cada descritor** e **sem introduzir hook no `visual-kit`** (achado 39, verificado por ESLint). A resposta está
na ADR-16: os serviços viajam **dentro do quadro**, num `FrameHost`; o alto
contraste chega ao HTML por **variável CSS** definida no elemento raiz e ao SVG pela paleta no quadro, porque
`var()` não vale em atributo de apresentação.

Três consequências que valem registro:

- **`packages/visual-template/template/src/interaction.ts` é novo e é estático.** Toda a conversa com o host
  mora ali, fora do codegen — o fonte gerado apenas instancia a classe e chama `readFrame`. Um visual gerado que
  trouxesse a implementação da seleção espalharia código idêntico por todo pacote compilado.
- **O `DataFrame` deixou de ser só dado.** Ele carrega `host` e `truncated`, e por isso entra no fonte gerado
  mesmo numa árvore só de texto: um visual sem papel nenhum ainda precisa de menu de contexto e alto contraste.
- **A navegação por teclado é uma sobreposição de `<button>` `sr-only`, não `tabIndex` no SVG.** O que o
  Recharts desenha é gerado por ele: não há onde pendurar `aria-label` por marca sem reimplementar as formas. A
  sobreposição é `absolute`, então fica fora da cadeia de flex que o `ResponsiveContainer` mede — a restrição
  que o ADR-14 já tinha documentado. As setas andam pela série movendo o
  **foco do DOM**, que é o que dá navegação por setas sem estado e portanto sem hook.

**Onde o mouse e o teclado divergem, e por quê.** Barras e fatias têm área de clique por marca e usam os
handlers do próprio `<Bar>`/`<Pie>`. Linha e área não têm marca por ponto quando o marcador está desligado, então
usam o handler do gráfico e leem `activeTooltipIndex`. A diferença vem do Recharts, não do desenho: é o preço de
ter trocado SVG próprio por biblioteca. Pelo teclado, os cinco tipos se comportam igual.

**Medido no gate de aceite:** pacote **221,1 KB**, `content.js` **751,3 KB** — os dois abaixo do que o Sprint 4
mediu, e bem dentro dos orçamentos de 2 MB e 1 MB.

**DoD do código: cumprido.** O `compiledVisual.e2e.test.ts` deixou de perguntar apenas se o visual *desenha* e
passou a verificar o que ele **pede ao host**: acionar um ponto chama `selectionManager.select` com a identidade
daquela linha; o foco pede o tooltip nativo com os valores já formatados; o botão direito abre o menu de
contexto; em alto contraste as variáveis CSS aparecem no elemento raiz e o SVG sai com a cor **resolvida**, sem
`var(`. Dezesseis assertivas sobre o `.pbiviz` compilado de verdade.

✅ **Aprovado no Power BI Desktop em 2026-07-31.** O gate exercitou as seis contra o artefato real em jsdom, mas
jsdom não tem motor de layout nem o host de verdade — o gesto de mouse sobre uma barra, o posicionamento do balão
nativo e o alto contraste do sistema só fechavam no Desktop, e fecharam. O ciclo completo agora entrega um visual
que o usuário compõe do zero **e que se comporta como visual nativo dentro do relatório**.

---

### Faxina — aposentadoria do caminho antigo — ✅ **CONCLUÍDA em 2026-07-31**

O pivô da ADR-08 trocou a arquitetura sem apagar a anterior, de propósito: até
que o caminho novo estivesse **aprovado no Desktop**, o antigo era a evidência de que o produto já tinha
funcionado. Com o Sprint 6 aprovado, essa razão acabou — e o que sobra é um segundo caminho que ninguém executa,
que aparece em toda busca e que o CI mantém verde de graça.

| Removido | Por que perdeu o chamador |
|---|---|
| `packages/runtime/` inteiro (fonte, projeto pbiviz, 5 scripts, `renderRealBundle.test.ts`) | O visual não é mais pré-compilado: `@vislow/codegen` + `@vislow/visual-template` geram um projeto por usuário |
| `buildPbiviz`, `toPbivizBlob`, `CONFIG_PLACEHOLDER`, `PbivizBuildError`, `template.fixture.ts` e os testes T-03…T-08 originais | Desde o Sprint 5 o editor não empacota no browser — quem empacota é a API, chamando o `pbiviz` de verdade |
| `packaging/base64.ts` (`toBase64Utf8`/`fromBase64Utf8`, ADR-07) | Existia para transportar a config como payload no bundle. Não há mais payload: a spec vira código |
| `visual-kit`: `BarChart`, `KpiCard`, `Frame`, `mock.ts`, `resolveColors`/`ResolvedColors`, `DataPoint`, `KpiDatum`, `KpiComparison`, `RenderContext` | Eram os componentes de papéis fixos e o contrato que os alimentava. Os nós de `visual-kit/nodes` os substituíram, com `DataFrame` e `FrameHost` |
| `apps/web/public/templates/` | Era onde o `base-runtime.pbiviz` era servido ao browser para reescrita |
| Scripts `test:packaging` e `stage:template`; bloco do runtime no `eslint.config.mjs`; `tsconfig.check.json` do `typecheck` | Apontavam para o que saiu |

**O que ficou de pé, e por quê:**

- **`inspectPbiviz`** — é o portão da ADR-11, não um teste. Ficou mais
  simples: perdeu a extração do payload base64 e o conceito de "pacote base", que só existiam para o caminho
  antigo. `PbivizBuildError` virou `PbivizInspectionError`, sem código de erro — a única coisa que ele reporta
  hoje é pacote com estrutura inválida.
- **A regra de ESLint que proíbe hook no `visual-kit`** (achado 39).
  A causa raiz — `resolve.symlinks: false` no webpack do `pbiviz` — é do formato, não do runtime antigo. Hoje a
  duplicação é evitada pela vendorização por cópia de diretório; a regra é a defesa em profundidade.
- **`autoInstallPeers: false`** no `pnpm-workspace.yaml`, pelo mesmo motivo.
- **Seções 8.2, 8.3 e 9** deste documento, marcadas como histórico. Os achados 33 a 40 nasceram ali e descrevem
  armadilhas do formato `.pbiviz` que continuam valendo para quem gera pacote hoje.

**Verificação:** `pnpm verify` verde (230 testes, 16 arquivos) e o gate de aceite verde com as mesmas 16
assertivas. Pacote **221,2 KB**, `content.js` **751,6 KB** — inalterados dentro da variação de build, o que
confirma o que já se esperava: o caminho antigo não entrava no bundle, apenas no repositório. O `pnpm install`
removeu **274 pacotes** de `node_modules` (a toolchain do `pbiviz` e o webpack que só o runtime usava).

> **Nenhum comportamento do produto mudou nesta faxina.** É remoção de código sem chamador, e é por isso que o
> gate de aceite — que executa o `.pbiviz` compilado — é a evidência que importa aqui.

---

### Turborepo — a ordem de build vira declaração — ✅ **CONCLUÍDO em 2026-07-31**

A faxina removeu o código sem chamador, mas deixou de pé o problema que a antecedia: **a ordem de build não
morava em lugar nenhum**. Ela era reconstruída três vezes — no solution file do `tsc`, na sequência de passos do
`ci.yml` e na memória de quem digita os comandos. As três já tinham divergido: o CI mantinha dois passos
apontando para `@vislow/runtime` e `test:packaging`, removidos pela faxina, e estava **vermelho na `main`**.

A ADR-17 troca as três por uma: o `turbo.json`.

| Antes | Depois |
|---|---|
| `tsc -b` na raiz + `pnpm -r build:css` | Um `build` por pacote, ordenado por `dependsOn: ["^build"]` |
| Oito passos no CI, dois deles mortos | Dois passos: `turbo run build typecheck lint test` e `turbo run test:build` |
| `pnpm build && pnpm stage:vendor && pnpm dev:api && pnpm dev` | `pnpm dev` |
| Guarda do ADR-02 em bash inline, só no CI | `visual-kit/scripts/check-css.mjs`, passo do `build` — vale local |
| `pnpm test` às vezes rodava o gate, às vezes não | `test` (rápida) e `test:build` (gate) são tarefas distintas |

**Os quatro comandos**, cada um completo: `pnpm dev` (sobe tudo, com watch), `pnpm build` (pacotes + apps +
`stage:vendor`), `pnpm verify` (build + typecheck + lint + suíte rápida), `pnpm check` (o `verify` mais o gate).

**Três dependências que existiam mas não estavam escritas**, e por isso só funcionavam por convenção:

- `stage:vendor` lê `packages/{visual-kit,config-schema}/dist/` — agora declarado em `devDependencies` do
  `visual-template`. Não reintroduz o achado 39: o que chega ao
  visual é a cópia em `vendor/`, nunca esse `node_modules`, e com `autoInstallPeers: false` o link não arrasta
  React. Verificado — `packages/visual-template/node_modules/react` não existe, e o gate passou.
- O lint com informação de tipos precisa dos `.d.ts` do build. Era comentário no `ci.yml`; virou `dependsOn`.
- A suíte rápida precisa de `@vislow/visual-template#build` — é o único `@vislow/*` que o mapa de alias do
  vitest **não** reescreve para `src/`, porque ele exporta caminhos resolvidos a partir do próprio módulo.

**Medido:** `pnpm verify` de 12,4 s para **18 ms** em cache quente (`FULL TURBO`); suíte rápida de 16,3 s para
**1,71 s** (o gate saiu dela); CI de oito passos para dois. O gate passou com as **mesmas 14 assertivas** do
artefato — as 2 de identidade (`T-07`) que moravam no mesmo arquivo voltaram para a suíte rápida em
`packages/codegen/src/projectIdentity.test.ts`, somando os mesmos 230 testes de antes.

Três riscos foram resolvidos por sondagem, não por suposição: o turbo **reconhece** `pnpm@11.12.0` (usa o parser
`pnpm9`, correto para `lockfileVersion: 9.0`, com `hashOfExternalDependencies` não-vazio); os `inputs` de tarefa
de raiz **alcançam** os workspaces (`//#test` hasheia 92 arquivos, 88 sob `packages/`/`apps/`); e o cache
restaura o `dist/.tsbuildinfo` **junto** com os `.js`/`.d.ts` — o estado perigoso seria buildinfo sem outputs, em
que o `tsc` se acha atualizado e não emite nada.

> **Nenhum comportamento do produto mudou.** O que mudou é o que o repositório **impõe** em vez de pedir que se
> lembre — e o gate de aceite, que agora não tem como se ignorar, é a evidência de que o artefato continua o
> mesmo.

---

### Canvas — posicionamento livre — ✅ **CONCLUÍDO em 2026-07-31**

Até aqui a composição era uma pilha: a posição de um nó era a ordem dele no array e o tamanho era o que sobrava
da cadeia de flex. Dava para montar um relatório, não para desenhar um. O pedido foi direto — mover por linha e
coluna livremente, e dar a cada componente o tamanho que se quisesse.

**A pergunta que decidiu tudo não era de UI: um visual do Power BI não tem tamanho.** O autor do relatório
arrasta a moldura para o que quiser, então "posição" precisa significar algo em 400 e em 1600 de largura. Daí a
ADR-18: `rect` em **% do pai**, com encaixe em grade de 24×16 e nas arestas dos irmãos. As alternativas
morreram por consequência, não por gosto — prancheta de pixel com `transform: scale()` entrega texto de 8px numa
moldura estreita; grade com linha de altura fixa não permite sobrepor e não fecha com a moldura.

**A ADR-14 não foi revogada, foi restringida.** Ela proibia interação no preview por **medição**: um wrapper
clicável entra na cadeia de flex e o `ResponsiveContainer` mede outra altura. A camada de alças é filha
`absolute` do próprio container — fora do fluxo, não altera medida de irmão nenhum — e, por viver **dentro**
dele, herda o sistema de coordenadas: desenha com os mesmos `%` que já estão na spec, sem `ref`, sem
`ResizeObserver`. A objeção registrada em 2026-07-30 ("refs + overlay: complexidade alta") era sobre medir, e
com geometria declarativa não há o que medir. Em container que empilha o ADR-14 continua valendo integralmente.

Três PRs, cada um deixando o app de pé: `rect` na spec (inerte), o render posicionado (já exportável), a
manipulação direta.

**Duas guardas foram quebradas de propósito, e uma delas não mordeu:**

- **A guarda de CSS estava se auto-satisfazendo desde que existe.** O Tailwind v4 varre o pacote inteiro, não
  só o `@source` declarado — e isso inclui o próprio `check-css.mjs`. Com as classes escritas por extenso na
  lista de exigências, o CLI as lia **de lá** e gerava a regra: a guarda teria passado com o `tokens.ts` inteiro
  quebrado. Descoberto tentando derrubá-la; ninguém tinha tentado antes. Prefixo e utilidade agora viajam
  separados e só se juntam em runtime.
- **O portão compilava uma árvore empilhada**, então nada no pipeline real exercitava o caminho novo. A fixture
  passa a posicionar, e há assertiva sobre o DOM compilado — com o codegen parando de embrulhar, só ela falha.

Dois defeitos apareceram por colisão de nomes, e nenhum dos dois quebrava compilação: o campo do container
chamava-se `layout`, que **já era** o campo de orientação do gráfico de barras — um teste media a ordem dos
campos do container achando que media os da barra; e as oito alças anunciavam "Redimensionar **pelo** borda
direita", porque a frase era montada com artigo fixo sobre substantivos de gêneros diferentes.

**Aberto, deliberadamente:** não há aviso de "esse texto não cabe nessa caixa". O `overflow-hidden` do
`CanvasSlot` impede o dano visual — corta, nunca escorre sobre o vizinho —, mas medir o conteúdo para avisar
ficou fora. E, dentro de um canvas, a camada cobre os gráficos: o tooltip do Recharts **no preview** não aparece
ali. O do host, no visual compilado, não é afetado.

---

## 8. Anexo A — achados numerados

Correções aplicadas na v2.0 sobre o rascunho v1.0, com a razão de cada uma.

### A.1 Defeitos bloqueantes

| # | Defeito na v1.0 | Por que estava errado | Correção |
|---|---|---|---|
| 1 | Fluxo de export injetava `resources/config.json` no pacote, lido pelo runtime em execução. | O visual roda em `<iframe sandbox="allow-scripts">` sem domínio: não há `fetch` relativo, `localStorage` nem acesso ao próprio pacote. Somente `content.js`/`content.css` chegam ao runtime. O visual **nunca leria** esse arquivo. | Config embutida no bundle via placeholder base64 (ADR-01, 8.2). |
| 2 | GUID fixo, herdado do pacote base em todo export. | O GUID é a identidade do visual. O segundo visual importado sobrescreveria o primeiro, e todos os visuais no relatório passariam a usar a última config importada. | GUID e nome reescritos por export (ADR-03, 8.3). |
| 3 | Config armazenava classes Tailwind cruas (`"bg-white"`, `"text-lg"`). | O Tailwind purga em build time as classes ausentes do código-fonte, e o runtime é compilado antes de o usuário escolher qualquer coisa. Toda classe fora do CSS já compilado falharia em silêncio. | Design tokens semânticos mapeados no runtime (ADR-02, 7.2). |

### A.2 Correções de escopo e de fato

| # | Item na v1.0 | Correção |
|---|---|---|
| 4 | Bloco `bindings` no config e painel "Mapeamento de Campos (Roles)" no editor. | Removidos. O app web não acessa o modelo do Power BI e não pode ligar campos; as roles são fixas e o mapeamento ocorre dentro do Power BI (4.6). |
| 5 | Estrutura do pacote descrita como `pbiviz.json` + `capabilities.json` + `bundle.js` na raiz. | Essa é a estrutura do projeto-fonte, não do pacote. No pacote, tudo está em `resources/{guid}.pbiviz.json` (8.1). |
| 6 | Prefixo `pbi-` justificado como proteção do DOM do Power BI. | O iframe sandbox já garante esse isolamento. A justificativa correta é evitar colisão com os estilos injetados pelo host *dentro* do iframe (9.3). |
| 7 | `"$schema": "https://json-schema.org/draft/2020-12/schema"` dentro do documento de instância. | Essa URL identifica o dialeto de um schema, não de um dado. Substituída por `schemaVersion` (7.3). |
| 8 | `dataReductionAlgorithm: { "top": {} }`, sem `conditions`. | `count` explícito e `conditions` declaradas, tornando RN-10 verificável (9.1). |
| 9 | `objects.configPanel.jsonConfig` no `capabilities.json`. | Removido. Seria um segundo caminho de configuração, sem validação nem preview. |
| 10 | `Math.max(...data.map(...))` **dentro** do `.map` do componente. | O(n²) e com risco de estourar a pilha em datasets grandes. Substituído por `reduce` memoizado (9.4). |
| 11 | Valores renderizados como número cru (`{row.value}`). | Exibiria `1234.5678` onde o modelo pede `R$ 1.234,57`. Formatação via `valueFormatter` (RF-17). |
| 12 | Roadmap com todas as caixas marcadas `[x]`, com o repositório vazio. | Todas desmarcadas; estimativa revisada de 4 para ~6 semanas (15). |

### A.3 Lacunas de engenharia preenchidas

Sem contrapartida na v1.0: métricas de sucesso mensuráveis · personas e escopo negativo explícito · requisitos
funcionais com critérios de aceite · RNFs quantificados · regras de negócio · versionamento e migração de schema ·
cross-filter, tooltip, formatação numérica, estados vazio e de erro, acessibilidade e alto contraste · estratégia
de testes com testes de empacotamento em CI · matriz de teste manual no Power BI · seção de segurança e
privacidade · registro de riscos com sinais de detecção · **gate de validação end-to-end na Fase 1**.

### A.4 Achados do spike de validação (2026-07-29)

O gate da Fase 1 foi executado antes da Fase 0 e **aprovado**. Achados que alteraram o documento:

| # | Achado | Onde estava errado | Correção |
|---|---|---|---|
| 13 | **O GUID é o nome de uma variável JavaScript** no bundle (`var vislowSpike629BE...;(()=>{`), com 4 ocorrências no `content.js`. | 8.4 tratava o GUID como metadado e propunha `slug` + 8 chars base36. | GUID passa a ser `{nome}{32 hex}` — convenção real da CLI — e precisa ser identificador JS válido (RN-06, T-06d). |
| 14 | A ordem de substituição GUID→nome é **obrigatória**, não preferência: como `guid = nome + hex`, trocar o nome primeiro corromperia todos os GUIDs. | 8.3 mencionava ordem sem explicar a consequência. | Justificativa registrada no passo 5. |
| 15 | Não existe `assets/icon.png` no ZIP; o ícone é `content.iconBase64`. O `package.json` tem `metadata.pbivizjson.resourceId`. | Diagrama de 8.1 mostrava `assets/` e omitia `metadata`. | Diagrama substituído pela estrutura observada. |
| 16 | O lint oficial do `pbiviz` aplica `powerbi-visuals/no-inner-outer-html` e **falha o build** com `innerHTML`. | RN-11 tratava a proibição como disciplina interna. | RN-11 registra que a proibição é imposta pela toolchain. |
| 17 | O sentinela por concatenação (`"__VISLOW" + "_CONFIG_B64__"`) é perigoso: o minificador pode dobrá-lo e **criar uma segunda ocorrência literal** do placeholder. | 8.2 recomendava exatamente isso. | Detecção por ausência de `_` (base64 nunca contém underscore). Verificado na saída real do minificador. |
| 18 | `escape`/`unescape` são obsoletos e incorretos fora de Latin-1. | Exemplo de 8.2 usava `decodeURIComponent(escape(atob(...)))`. | `TextDecoder` sobre `Uint8Array`. Round-trip verificado com aspas, acento e emoji simultâneos. |
| 19 | `pbiviz package` exige `author.name`/`author.email` preenchidos, senão não gera o pacote. Também reporta ausência de `getFormattingModel` (não bloqueia o empacotamento). | Não documentado. | Registrado como pré-requisito do build do Runtime Core. |
| 20 | **O campo `style` do `pbiviz.json` é ignorado** — e o build reporta `Build completed successfully` mesmo assim, gerando um pacote **sem os estilos pretendidos**. O CSS entra pelo `import` no `visual.ts`. | Não documentado. Falha silenciosa clássica: pacote válido, visual sem estilo. | Guarda de CSS no CI verifica que as classes estão no artefato (12.6). |
| 21 | O `powerbi-visuals-tools` **não traz PostCSS** (só `less-loader` e `css-loader`). | ADR-06 supunha configurar Tailwind na toolchain. | CSS pré-compilado pelo CLI do Tailwind e importado como CSS puro. Dispensa PostCSS no webpack. |
| 22 | `powerbi-visuals-tools` 7.2.1 depende de `typescript ^5.9.3`. | Escolha de versão em aberto. | **TypeScript 5.9.3 em todo o monorepo.** O `visual-kit` é compilado pelo `ts-loader` do pbiviz; usar TS 7 nos demais pacotes criaria duas semânticas de tipo sobre código compartilhado. |
| 23 | O entrypoint padrão do Ajv é **draft-07** e não reconhece o dialeto 2020-12 declarado em `$schema` — falha só em runtime. | Não documentado. | Importar `ajv/dist/2020.js`. Coberto por teste. |

**Artefatos do spike** (código descartável, fora do futuro monorepo): `spike/vislowSpike/` — visual mínimo ·
`spike/patch.mjs` — embrião de `buildPbiviz()` · `spike/verify.mjs` — embrião de T-03…T-08, 27 assertivas.

### A.5 Achados da Fase 1 — Runtime Core (2026-07-29)

| # | Achado | Impacto | Correção |
|---|---|---|---|
| 24 | **O `node_modules` estrito do pnpm quebra a toolchain do `pbiviz`.** O webpack embutido resolve loaders e dependências transitivas a partir do diretório do *projeto*, não das próprias dependências. Falha com `Can't resolve 'ts-loader'`, depois `scheduler`, depois dependências internas do Ajv. | Build do runtime impossível. | Declarar explicitamente em `packages/runtime`: os loaders da toolchain, `scheduler`, os `powerbi-visuals-utils-*` e as dependências internas do Ajv. Preferido a `node-linker=hoisted`, que desligaria o isolamento em todo o monorepo. |
| 25 | **O `visualPlugin.ts` gerado pelo `pbiviz` não passa em `strictNullChecks`** (`VisualConstructorOptions \| undefined`). | Impossível compilar o runtime com `strict`. | Dois tsconfig: `tsconfig.json` lax para a toolchain, `tsconfig.check.json` estrito para o nosso código — ligado ao `pnpm typecheck` e ao ESLint. Rigor preservado onde importa. |
| 26 | **Sem `strictNullChecks`, o TypeScript não estreita união por discriminante booleano.** `if (r.valid)` deixava de dar acesso a `r.config`. | Erro de compilação em todo consumidor do runtime. | `ValidationResult` e `EmbeddedConfigResult` passaram a usar discriminante de **string** (`kind`), que estreita sob qualquer configuração de compilador. Vale como padrão para código que cruza a fronteira da toolchain. |
| 27 | O `valueFormatter` **distingue opção ausente de opção presente com `undefined`**. Pego por `exactOptionalPropertyTypes`. | Formatação numérica silenciosamente errada. | Montar o objeto de opções condicionalmente. |
| 28 | **`try/catch` em volta de `root.render()` não captura falhas de render do React.** No modo concorrente a fase de render é assíncrona, então a exceção ocorre fora do bloco — e o visual ficaria em branco. | Buraco direto na RN-04, a regra mais importante do produto. | `ErrorBoundary` de verdade no `visual-kit`. O `try/catch` permanece, mas para falhas ao *montar* a árvore (mapeamento de `DataView`). São dois caminhos distintos e ambos são necessários. |
| 29 | As coordenadas do `tooltipService` são **relativas ao elemento do visual**, não à viewport. | Tooltip apareceria deslocado sempre que o visual não estivesse no canto superior esquerdo. | Subtrair `getBoundingClientRect()` antes de chamar `show`. |

### A.6 Achados da Fase 2 — Editor Web (2026-07-29)

| # | Achado | Impacto | Correção |
|---|---|---|---|
| 30 | **`exactOptionalPropertyTypes` conflita com props opcionais de React.** Repassar `hint={hint}` quando `hint` é `string \| undefined` é erro, porque `hint?: string` proíbe o valor `undefined` explícito. | Build do editor falha em qualquer componente que repasse prop opcional. | Props opcionais de componente declaram `prop?: T \| undefined`. É a acomodação padrão, e mantemos a flag ligada — ela já pagou dois bugs reais na Fase 1. |
| 31 | Os dois Tailwind — o do editor (sem prefixo) e o do `visual-kit` (`pbi:`) — **convivem na mesma página sem colidir**. | Confirma ADR-06 num cenário real. | Nenhuma. Registrado como validação. |
| 32 | `next.config.ts` fica fora de qualquer `tsconfig` de pacote e o ESLint não conseguia analisá-lo. | Lint quebrado na raiz do app. | `tseslint.configs.base` no bloco de arquivos de configuração: traz o parser de TypeScript sem as regras que exigem informação de tipos. |
| 33 | Modelar `Field` com `token?: TokenKind` obrigava asserção não-nula no ponto de uso, e o lint (corretamente) reprovou. | Convenção não verificada pelo compilador. | União discriminada: `token` só existe, e é obrigatório, quando `kind === 'token'`. O compilador passa a garantir o que era convenção. |

### A.7 Achados da Fase 3 — Export (2026-07-30)

| # | Achado | Impacto | Correção |
|---|---|---|---|
| 34 | **Duas passadas sequenciais de `replaceAll` corrompem o GUID quando o slug do projeto é igual ao `name` do pacote base.** Depois de trocar o GUID, todo GUID novo começa pelo slug do usuário; a segunda passada (nome) casa com esse prefixo e duplica o sufixo hex *dentro* dos GUIDs recém-escritos. Não é hipotético: `slugify("vislow Runtime")` produz exatamente `vislowRuntime`. | Pacote silenciosamente corrompido e recusado no import, com mensagem genérica. A ordem documentada em 8.3 não protegia desse caso — só do inverso. | **Uma passada única** com alternação de regex (`guid|name`, GUID primeiro) e `/g`. `String.replace` nunca reexamina o texto que acabou de inserir, e a ordem das alternativas resolve as posições em que ambos casariam. Coberto por teste dedicado em T-06. |
| 35 | A nota de 8.3 que mandava rodar a reescrita de identidade **depois** da injeção do payload tinha o raciocínio invertido: é injetar primeiro que expõe o base64 à reescrita. | Risco (remoto) de corromper o payload. | Ordem trocada: **identidade primeiro, payload depois**. O placeholder não contém o GUID nem o nome, então a etapa de identidade não tem como danificá-lo. |
| 36 | Reexportar `@vislow/config-schema` inteiro arrastaria o **JSZip para dentro do bundle do visual**, porque o Runtime Core importa esse barril. | ~100 KB contra o orçamento de 1 MB do RNF-04, sem nenhum sinal de erro. | Subcaminho dedicado `@vislow/config-schema/packaging`, ausente do `index.ts`. O motivo está comentado nos dois arquivos. |
| 37 | `Uint8Array` do TypeScript 5.9 é genérico sobre `ArrayBufferLike`, e `BlobPart` só aceita views sobre `ArrayBuffer`. A tipagem do JSZip devolve o genérico aberto. | `new Blob([bytes])` não compila. | `PbivizPackage.bytes` declara `Uint8Array<ArrayBuffer>`; a asserção fica num único ponto, na saída do `generateAsync`. |
| 38 | Os testes de empacotamento precisam do `.pbiviz` real, que leva ~1 min de `pbiviz package` — mas `pnpm test` roda antes de qualquer build. | Ou o `pnpm verify` local fica lento, ou os testes mais importantes do projeto ficam sem rodar no CI. | Divisão em dois: template sintético (`template.fixture.ts`) cobre lógica e casos de borda em ~300 ms e roda sempre; `buildPbiviz.real.test.ts` cobre o que só o bundle minificado prova. No CI, `VISLOW_REQUIRE_TEMPLATE=1` transforma a ausência do artefato em falha — não há como o CI passar sem verificar o pacote real. |
| 39 | **O webpack do `pbiviz` usa `resolve.symlinks: false`** (`webpack.config.js:106`), então não resolve symlink para realpath. `packages/runtime/node_modules/react` e `packages/runtime/node_modules/@vislow/visual-kit/node_modules/react` — dois symlinks para o **mesmo** pacote — entraram no bundle como **dois módulos distintos**. O `react-dom` instala o dispatcher de hooks na cópia dele; o `visual-kit` chamava `useMemo` na outra, cujo dispatcher é `null`. | **Alto e enganoso.** Elementos JSX atravessam cópias sem problema (o `$$typeof` é um `Symbol.for`, global), então o KPI Card renderizava normalmente e só o gráfico de barras — o único componente com hook — caía no `ErrorBoundary` com `Cannot read properties of null (reading 'useMemo')`. Nenhum teste de fonte pegaria: o bug só existe no artefato empacotado. Mesma família do achado 24. | `autoInstallPeers: false` no `pnpm-workspace.yaml` e remoção do `react` das `devDependencies` do `visual-kit`. Sem `packages/visual-kit/node_modules/react`, a busca do webpack sobe e encontra o `react` do runtime — uma cópia só. Guarda permanente: `packages/runtime/test/renderRealBundle.test.ts` executa o bundle minificado num jsdom e verifica o DOM. **Confirmado que o teste falha com o bug presente e passa sem ele**, e **validado no Power BI Desktop em 2026-07-30**: os dois candidatos do sprint de diagnóstico (`fe260c08`, só a deduplicação; `1f9da5e2`, deduplicação + `visual-kit` sem hooks) importaram e renderizaram barras com dados reais. A deduplicação basta; a remoção dos hooks fica como defesa em profundidade. |
| 41 | **`pbiviz package` imprime `error` de certificado e conclui com sucesso.** Num container sem `openssl`: `warn Certificate verification error` seguido de `error Create certificate error: openssl: not found` e, depois, `done Build completed successfully`. O certificado é exigido pelo `pbiviz start` (servidor de dev), não pelo `package`. | O worker de build do backend que tratasse `error` na saída como falha rejeitaria **todo** build bem-sucedido. É o inverso do padrão de falha silenciosa desta toolchain: aqui é um erro *falso*. | O worker decide por **código de saída** e pela verificação do artefato com `inspectPbiviz`, nunca por varredura de texto na saída. |
| 40 | **Um pacote que não identifica a si mesmo torna o diagnóstico impossível.** Depois da correção do achado 39, um relato de "continua falhando" ficou indistinguível de "importou o arquivo antigo" — e era o arquivo antigo. Uma sessão inteira gasta nisso. | Diagnóstico remoto de artefato binário sem identidade é adivinhação. | `stamp-build-id.mjs` sela o prefixo do sha256 do `content.js` depois do `pbiviz package`, determinístico por fonte. `BuildStamp` exibe o id no canto do visual, **fora** do `ErrorBoundary` e também no caminho de sucesso — senão "renderizou" não diz *qual* pacote renderizou. Regra em `CLAUDE.md`: pedir o id antes de diagnosticar qualquer coisa no Desktop. **Revertido em parte em 2026-08-03:** o `BuildStamp` foi removido a pedido do usuário — um hash sobre o relatório de quem usa o visual é ruído que o usuário final não pediu. O id continua no `ErrorCard` e no bundle, mas **deixou de ser legível da tela no caminho de sucesso**, e o achado 40 volta a valer com ele: a procedência do arquivo precisa ser confirmada por fora antes de qualquer conclusão. |

### A8 — Achados do Sprint 4: API de build (2026-07-30)

| # | Achado | Impacto | Correção |
|---|---|---|---|
| 42 | **`NODE_ENV=production` no ambiente do build faz o `npm ci` omitir as `devDependencies`** — e o `powerbi-visuals-tools` é uma delas. | Alto e completamente enganoso: o `npm ci` termina **com sucesso**, e a falha aparece só no passo seguinte, como um `404 Not Found - GET https://registry.npmjs.org/pbiviz`. A mensagem sugere um pacote inexistente no registro, não um compilador que não foi instalado. Custou uma rodada de diagnóstico. | O ambiente do worker (`pipeline.ts`, `buildEnv`) **não define `NODE_ENV`**, com o motivo comentado, e o `npm ci` passa `--include=dev` explícito. A redundância é deliberada: quem mexer em um dos dois esbarra no outro. |
| 43 | **O `powerbi-visuals-tools` lê o `tsconfig.json` do projeto com `JSON.parse` cru** (`lib/utils.js`, `safelyParse`), não com um parser de JSONC. | Um comentário `//` no `tsconfig.json` derruba o build com `SyntaxError: Expected double-quoted property name in JSON`, apontando para a linha do próprio comentário — mensagem que não sugere em nada que o problema é o formato do arquivo. O resto do monorepo comenta tsconfigs livremente, então o hábito leva direto ao erro. | O `tsconfig.json` do template não tem comentário nenhum. Toda a explicação vive no `template/README.md`. |
| 44 | **A resolução `node` (node10) ignora o campo `exports`.** O `visual-kit` publica os componentes de nó pelo subcaminho `@vislow/visual-kit/nodes`; o webpack do `pbiviz` honra `exports`, o TypeScript com `moduleResolution: node` não. | Falha só do lado dos tipos, com `Cannot find module`, num projeto que compila por webpack — a assimetria entre as duas resoluções não é óbvia. | `moduleResolution: "bundler"` no `tsconfig.json` do template. |
| 45 | **`npm ci` apaga `node_modules` inteiro antes de instalar.** Os pacotes `@vislow/*` são privados: não estão em registro nenhum e não podem entrar no `package.json` do template. | Vendorizar antes do `npm ci` é trabalho jogado fora, e o erro só apareceria depois, na resolução do webpack, sem explicar a causa. | `stage-vendor.mjs` prepara `vendor/@vislow/`, e o pipeline copia para `node_modules/` **depois** do `npm ci`. Cópia de diretório, não symlink nem `file:`: symlink reintroduziria a condição exata do achado 39, e `file:` faria o `npm ci` recusar o lockfile a cada byte alterado no kit. |
| 46 | **O jsdom não tem motor de layout nem `ResizeObserver`**, e o `ResponsiveContainer` do Recharts depende dos dois. | O gate de aceite passaria enganado: o visual monta, o container do gráfico aparece no DOM, e **nenhum SVG é desenhado** — exatamente o sintoma do achado 39, o bug que este teste existe para pegar. | O harness instala um `ResizeObserver` que reporta medida fixa e sobrescreve `offsetWidth`/`clientWidth`/`getBoundingClientRect`. Equipar o harness, não afrouxar a asserção: o que se prova é que o gráfico desenha **quando tem espaço**, que é a condição real dentro do Power BI. |

### A9 — Achados do Sprint 5: editor de composição (2026-07-30)

| # | Achado | Impacto | Correção |
|---|---|---|---|
| 47 | **`oneOf` sobre as sete variantes de nó faz o Ajv reportar o erro de TODAS.** Um `barChart` com papel não ligado produzia ~40 problemas, entre eles "falta `direction`" e "falta `gap`" — campos de container. | Alto para a usabilidade, invisível para os testes: as suítes existentes só verificavam `kind === 'invalid'`, então o ruído passou pelo Sprint 3 e pelo Sprint 4 sem sintoma. O painel de propriedades foi o primeiro consumidor a precisar de atribuição por campo, e a mensagem que ele mostraria mandava o usuário procurar um controle que a tela dele não tem. | Despacho por `if`/`then` sobre o `kind` (ADR-15) — o `if` que não casa não gera erro. Os rollups `must match "then" schema` são filtrados por `keyword`, com salvaguarda para não devolver "inválido" com lista vazia. De ~40 problemas para 2. |
| 48 | **Os caminhos de problema tinham DOIS formatos na mesma lista.** O Ajv devolve JSON Pointer (`/root/children/0/props`) e as regras semânticas usavam o formato do `walk` (`root.children[0].props.measureRole`). | Nenhum consumidor conseguia ligar um problema a um nó sem saber de qual dos dois validadores ele veio — e a informação de origem não está no `ValidationIssue`. Ficou latente enquanto ninguém consumia o caminho. | `toIssue` normaliza para o formato do `walk` e **anexa `params.missingProperty`** nos erros de `required`, que apontavam para o objeto e não para o campo. Sem isso o editor saberia que "algo em `props` falta", não qual controle acender. |
| 49 | **`react-is` é `peerDependency` do Recharts e o repositório usa `autoInstallPeers: false`** (imposto pelo achado 39). | O `npm ci` do template instala peers sozinho, então o visual compilado sempre funcionou — mas o editor, sob pnpm estrito, quebra ao importar Recharts, com `Cannot find module 'react-is'` vindo de dentro do próprio pacote. A assimetria entre os dois ambientes esconde o problema até alguém renderizar um gráfico no editor. | `react-is` declarado explicitamente em `apps/web`, pelo mesmo motivo que `packages/runtime` declara os loaders do webpack. |
| 50 | **O `visual-kit` não declara `react` nem em `devDependencies`** (achado 39), então nenhum teste conseguia importar seus componentes a partir do fonte. | Bloqueava qualquer teste de render do preview — justamente a classe de teste que pegou o achado 39. | Alias de `react`/`react-dom` no `vitest.config.ts`, apontando para a cópia do editor. Resolve só no vitest, **sem tocar no layout de `node_modules`**, que é o que não pode mudar. |
| 51 | **O `apps/web/tsconfig.json` usa `jsx: "preserve"`** porque quem transforma o JSX é o Next — e o vitest lê esse mesmo tsconfig. | Todo teste `.tsx` do editor falhava no parse com `Unexpected JSX expression`, erro que aponta para o código e não para a configuração. O Vite 8 usa `oxc`: definir `esbuild.jsx` é aceito e **silenciosamente ignorado**, com um aviso fácil de não ler. | `oxc: { jsx: { runtime: 'automatic' } }` no `vitest.config.ts`. |
| 52 | **Um seletor de zustand que constrói o valor a cada chamada re-renderiza em loop.** `selectIssuesByNode` devolvia um `Map` novo; o zustand v5 compara com `Object.is`. | Trava o editor, e o sintoma (aba congelada) não aponta para o seletor. | As derivações que criam objeto saíram do store para `lib/issues.ts` e são memoizadas no componente. O que fica como seletor devolve **referência vinda do estado**, nunca valor construído — com o motivo comentado no arquivo. |
| 53 | **O pivô da ADR-08 deixou seis capacidades para trás.** O caminho novo — `codegen` + `visual-template` + `visual-kit/nodes` — não tem **cross-filter**, **tooltip nativo**, **alto contraste**, **navegação por teclado**, **menu de contexto** nem **aviso de truncamento** (RF-18, 19, 21, 23, 24, 25). Vivem em `packages/runtime/src/visual.tsx` e nos componentes `BarChart`/`KpiCard` do `visual-kit` — nenhum dos dois usado pelo caminho novo. Os nós de `visual-kit/src/nodes/` não têm um único `tabIndex` ou `aria-label`. | Regressão, não escopo futuro: as seis foram entregues na Fase 1 e **aprovadas no Desktop com dados reais**. O visual compilado hoje desenha certo, então nenhum teste acusa — `compiledVisual.e2e.test.ts` verifica que renderiza dados e a RN-04, não que clicar numa barra filtra o relatório. Descoberto ao planejar a Fase 4, não por falha. | **FECHADO no Sprint 6 (2026-07-31).** As seis voltaram, com o desenho da ADR-16: serviços do host dentro do `DataFrame`, alto contraste por variável CSS. O gate de aceite deixou de perguntar só se o visual desenha e passou a verificar o que ele **pede ao host** — foi essa a lacuna que deixou o achado passar. `packages/runtime` e os componentes `BarChart`/`KpiCard` do `visual-kit` **já podem ser aposentados**: a portabilidade existe e foi aprovada no Desktop em 2026-07-31. |

### A10 — Achados do Sprint 6: paridade de interatividade (2026-07-31)

| # | Achado | Impacto | Correção |
|---|---|---|---|
| 54 | **No Tailwind v4 o prefixo vem ANTES da variante.** `focus-visible:pbi:ring-2` — escrito na Fase 1, em `visual-kit/src/BarChart.tsx` — não é reconhecido pelo CLI: nenhuma regra é gerada e nenhum aviso é emitido. O correto é `pbi:focus-visible:ring-2`. | O anel de foco do gráfico de barras da Fase 1 **nunca existiu**, e o código parecia acessível. É o mesmo mecanismo do erro de interpolação já documentado (ADR-02), numa forma nova: a classe é literal e completa, só está com a ordem errada — a regra "use strings literais" não protege contra isso. Descoberto por sondagem ao escrever a sobreposição de teclado, não por sintoma. | Corrigido em `BarChart.tsx`. A sobreposição nova (`pbi:sr-only`, `pbi:focus:not-sr-only`) foi validada **compilando o CSS e conferindo os seletores gerados** antes de escrever o componente. Regra: classe com variante é verificada no `dist/styles.css`, não no olho. |
| 55 | **`var()` não é substituído em atributo de apresentação de SVG.** `<rect fill="var(--x, red)">` não pinta em navegador nenhum — a substituição só acontece em propriedade CSS. | Teria quebrado o alto contraste exatamente onde ele mais importa (as marcas de dados), e em silêncio: o atributo fica lá, o retângulo some. Como o Recharts emite `fill`/`stroke` como atributo, a variável CSS não serve para gráfico. | Regra explícita na ADR-16 e no cabeçalho de `highContrast.ts`: **HTML usa a variável, SVG lê o quadro**. Os gráficos sempre têm o quadro, porque todo descritor de gráfico tem campo de papel. O gate verifica que o SVG compilado sai sem `fill="var(`. |
| 56 | **Um teste de render do `visual-kit` não pode morar no `visual-kit`.** O pacote não declara `react` nem em `devDependencies` (achado 39), então o ESLint com informação de tipos resolve `react-dom/client` como `error` e reprova o arquivo inteiro — mesmo com o alias do vitest fazendo os testes passarem. | O `pnpm test` passava e o `pnpm lint` reprovava, com doze erros que apontavam para o teste e não para a causa. Tentar calar as regras seria reabrir a porta para alguém "resolver" adicionando `react` ao pacote — que é a dependência proibida. | O teste foi para `apps/web/src/components/kitInteraction.test.tsx`, junto do outro teste que monta os mesmos componentes. Mesmo raciocínio de "testes do runtime vivem em `packages/runtime/test/`": a restrição do pacote manda no endereço do teste. |

### A11 — Achados da migração para Turborepo (2026-07-31)

| # | Achado | Impacto | Correção |
|---|---|---|---|
| 57 | **A guarda de CSS confere o CSS de saída, e uma classe pode ter segunda origem no fonte.** Ao provar que a guarda do ADR-02 morde, quebrei `pbi:p-4` no `tokens.ts` com interpolação e **o build passou**: a mesma classe aparece literal em `visual-kit/src/states.tsx`, então o Tailwind continuou gerando a regra. | A guarda parecia proteger o mapa de tokens e protegia menos do que se supunha — o CI verde não distinguia "mapa íntegro" de "outro arquivo por acaso menciona a mesma classe". O bash inline do CI tinha exatamente a mesma cegueira desde a Fase 1, sem ninguém notar, porque nunca foi testado contra uma quebra real. | Escolher para a lista do `check-css.mjs` classes de **origem única** no fonte. `pbi:rounded-xl`, `pbi:text-lg` e `pbi:shadow-sm` só o `tokens.ts` produz — com uma delas, a quebra falha com a mensagem certa. Regra anotada no `CLAUDE.md`: guarda que nunca falhou não é guarda verificada; quebre de propósito antes de confiar. |
| 58 | **`pnpm test` incluía o gate de aceite, que se auto-pulava.** `compiledVisual.e2e.test.ts` casava com o `include` do vitest e usava `describe.skipIf` quando o `vendor/` não estava preparado. O mesmo comando levava 3 s ou 1 min conforme o estado do disco. | O teste mais importante do projeto podia não rodar sem que nada na saída dissesse isso — e `VISLOW_REQUIRE_BUILD=1`, a defesa, só existia no CI. Localmente, "`pnpm test` passou" não significava nada sobre o artefato. | Split por convenção de nome (ADR-17): `*.e2e.test.ts` sai da suíte rápida e entra na do gate, cuja tarefa declara `stage:vendor` como dependência e é `cache: false`. O `skipIf` virou `throw` no carregamento. `VISLOW_REQUIRE_BUILD` deixou de existir — a ordenação declarada tornou a variável desnecessária. Efeito colateral medido: a suíte rápida caiu de 16,3 s para 1,71 s. |
| 59 | **Scripts `.mjs` de build rodavam com zero regras de ESLint.** O bloco de configuração do `eslint.config.mjs` casava `*.{mjs,ts}` (só a raiz) e `**/*.config.{mjs,ts}` — nenhum dos dois alcança `packages/*/scripts/`. | `stage-vendor.mjs` prepara o template do worker e `check-css.mjs` é a guarda do ADR-02: dois scripts críticos de build sem lint nenhum, e o `pnpm lint` verde não indicava a lacuna. Descoberto por sondagem com `eslint --print-config`, que respondeu `0 regras`. | `packages/*/scripts/**/*.{mjs,ts}` somado ao bloco de configuração — lint sem informação de tipos, como os demais arquivos que não pertencem a tsconfig de pacote. Passou de 0 para 64 regras; ambos os scripts já estavam limpos. |

