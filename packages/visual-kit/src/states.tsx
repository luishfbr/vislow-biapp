/**
 * Estados nao-felizes do visual.
 *
 * RN-04: o runtime SEMPRE renderiza um de tres estados — dados, vazio ou erro.
 * Tela branca dentro de um relatorio e indistinguivel de um bug do Power BI e
 * e tratada como defeito de severidade maxima.
 *
 * As cores passam por `hcInk`: em alto contraste (RF-21) o estado vazio e o
 * selo de build precisam do `foreground` do host tanto quanto os dados. Sem
 * isso, cinza sobre preto e exatamente o que o modo existe para evitar.
 */
import { INK, INK_MUTED } from '@vislow/config-schema';
import { hcInk } from './highContrast.js';

/** RF-20 — roles obrigatorias nao preenchidas. Orienta, nao acusa. */
export function EmptyState({ missing }: { missing: string[] }) {
  return (
    <div className="vsl-notice" style={{ color: hcInk(INK_MUTED) }}>
      <div className="vsl-notice-title" style={{ color: hcInk(INK) }}>
        Faltam campos para montar o visual
      </div>
      <div className="vsl-notice-line">
        Arraste um campo para:{' '}
        {missing.map((role, i) => (
          <span key={role}>
            {i > 0 && ', '}
            <strong>{role}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * RF-14 — config ausente, corrompida ou de major incompativel.
 * O codigo e o que torna o suporte possivel: sem ele, o usuario so consegue
 * relatar "nao funcionou" (RNF-11).
 */
export function ErrorCard({
  code,
  detail,
  buildId,
}: {
  code: string;
  detail?: string | undefined;
  /** Impressao digital do pacote. Sem ela, um relato de erro nao identifica o artefato. */
  buildId?: string | undefined;
}) {
  return (
    // O vermelho e uma das TRES cores escritas em codigo neste pacote (as outras
    // duas sao a tinta e a tinta apagada de `design.ts`). Nao vem do
    // `design.ts` de proposito: a linguagem visual e o que o AUTOR compoe, e ele
    // nao compoe a aparencia de um erro. Erro tem uma cor so, e nao e negociavel.
    <div className="vsl-notice" style={{ color: hcInk('#b91c1c') }}>
      <div className="vsl-notice-title">Não foi possível renderizar o visual</div>
      {detail !== undefined && detail !== '' && (
        <div className="vsl-notice-line" style={{ color: hcInk('#7f1d1d') }}>
          {detail}
        </div>
      )}
      <div className="vsl-notice-line" style={{ color: hcInk(INK_MUTED) }}>
        Código: {code}
        {buildId !== undefined && buildId !== '' && ` · build ${buildId}`}
      </div>
    </div>
  );
}

/*
 * Aqui existia o `BuildStamp`, o selo de build no canto inferior direito.
 *
 * Removido em 2026-08-03: um hash sobre o relatorio de quem usa o visual e ruido
 * que o usuario final nao pediu. O `buildId` continua no `ErrorCard` acima e no
 * cabecalho do `visual.tsx` gerado, que viaja no bundle — mas nao ha mais como
 * le-lo da tela com o visual renderizando normalmente.
 */

/** RF-25 — o dataReductionAlgorithm truncou o conjunto. */
export function TruncationNotice({ shown, limit }: { shown: number; limit: number }) {
  return (
    <div className="vsl-footnote" style={{ color: hcInk(INK_MUTED) }}>
      Exibindo {shown} de mais de {limit} categorias
    </div>
  );
}
