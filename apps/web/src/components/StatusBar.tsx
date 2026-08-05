'use client';

import { walk } from '@vislow/component-registry';
import { useMemo } from 'react';
import { formatClockTime } from '@/lib/formatNumber';
import { issuesByNode } from '@/lib/issues';
import { useEditorStore } from '@/store/useEditorStore';

/**
 * A barra do pacote — a faixa de 24px no rodape.
 *
 * POR QUE ELA EXISTE. O Vislow nao e um editor de desenho: e um editor cuja
 * saida e um binario compilado que precisa passar num portao. A metade de cima
 * da tela e ferramenta de design; esta faixa e a metade ferramenta de build, e a
 * tela fica honesta sobre ser as duas coisas.
 *
 * A direita ela responde a pergunta do achado 40, que ja custou uma sessao
 * inteira: "o arquivo que acabei de importar no Desktop veio DESTA tela?".
 * Ate aqui nao havia nada no editor que dissesse o que foi exportado por ultimo,
 * e "importou o arquivo antigo" ficava indistinguivel de "a correcao nao
 * funcionou".
 *
 * ISTO NAO E O SELO REMOVIDO. O `BuildStamp` foi tirado do VISUAL COMPILADO em
 * 2026-08-03, a pedido — um hash sobre o relatorio de quem usa o visual e ruido
 * que o usuario final nao pediu. Esta barra vive no editor e nunca no pacote.
 *
 * A hora e SO DA SESSAO (`lastExportedAt` nao e persistido). Um horario lido do
 * `localStorage` no dia seguinte responderia com confianca a pergunta errada.
 */
export function StatusBar() {
  const spec = useEditorStore((s) => s.spec);
  const issues = useEditorStore((s) => s.issues);
  const lastExportedAt = useEditorStore((s) => s.lastExportedAt);

  // Memoizado, nunca em seletor: `walk` e `issuesByNode` constroem array e Map
  // novos a cada chamada, e o zustand v5 compara com `Object.is` — devolver
  // valor construido de dentro de um seletor re-renderiza em loop e trava a aba
  // (achado 52).
  const { nodes, pending } = useMemo(
    () => ({
      // Menos a raiz: ela existe em todo projeto e contar "1 no" numa composicao
      // vazia diria que ha alguma coisa quando nao ha.
      nodes: walk(spec).length - 1,
      pending: issuesByNode(spec, issues).size,
    }),
    [spec, issues],
  );

  const fields = spec.data.columns.length;

  return (
    <footer
      className="flex h-6 shrink-0 items-center gap-3 border-t border-border bg-card px-3 font-mono text-micro tabular-nums text-muted-foreground"
      // A composicao muda por arrasto e por tecla, entao o leitor de tela nao
      // tem como saber que estes numeros andaram. `polite` conta sem interromper.
      aria-live="polite"
    >
      <Count value={nodes} one="componente" many="componentes" />
      <Separator />
      <Count value={fields} one="campo" many="campos" />

      {pending > 0 && (
        <>
          <Separator />
          {/* Ambar, e nao vermelho: campo por preencher e o estado NORMAL de quem
              esta compondo, nao um defeito. E a razao de `--warning` existir. */}
          <span className="text-warning">
            {pending} {pending === 1 ? 'pendência' : 'pendências'}
          </span>
        </>
      )}

      <span className="ml-auto flex items-center gap-3">
        <span title="Versão do pacote — sobe a cada exportação">
          v{spec.project.packageVersion}
        </span>
        {lastExportedAt !== null && (
          <>
            <Separator />
            <span title="Confirme a procedência do arquivo antes de concluir qualquer coisa no Power BI Desktop">
              exportado {formatClockTime(new Date(lastExportedAt))}
            </span>
          </>
        )}
      </span>
    </footer>
  );
}

function Count({ value, one, many }: { value: number; one: string; many: string }) {
  return (
    <span>
      {value} {value === 1 ? one : many}
    </span>
  );
}

/** Decorativo: o leitor de tela ja separa os `<span>` por si. */
function Separator() {
  return (
    <span aria-hidden className="text-border">
      ·
    </span>
  );
}
