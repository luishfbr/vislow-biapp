/**
 * Estados nao-felizes do visual.
 *
 * RN-04: o runtime SEMPRE renderiza um de tres estados — dados, vazio ou erro.
 * Tela branca dentro de um relatorio e indistinguivel de um bug do Power BI e
 * e tratada como defeito de severidade maxima.
 */

const SHELL =
  'pbi:w-full pbi:h-full pbi:flex pbi:flex-col pbi:items-center pbi:justify-center pbi:p-4 pbi:text-center';

/** RF-20 — roles obrigatorias nao preenchidas. Orienta, nao acusa. */
export function EmptyState({ missing }: { missing: string[] }) {
  return (
    <div className={SHELL} style={{ color: '#64748b' }}>
      <div className="pbi:text-sm pbi:font-medium">Faltam campos para montar o visual</div>
      <div className="pbi:text-xs pbi:mt-2">
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
export function ErrorCard({ code, detail }: { code: string; detail?: string }) {
  return (
    <div className={SHELL} style={{ color: '#b91c1c' }}>
      <div className="pbi:text-sm pbi:font-semibold">Nao foi possivel renderizar o visual</div>
      {detail !== undefined && detail !== '' && (
        <div className="pbi:text-xs pbi:mt-2" style={{ color: '#7f1d1d' }}>
          {detail}
        </div>
      )}
      <div className="pbi:text-xs pbi:mt-3" style={{ color: '#94a3b8' }}>
        codigo: {code}
      </div>
    </div>
  );
}

/** RF-25 — o dataReductionAlgorithm truncou o conjunto. */
export function TruncationNotice({ shown, limit }: { shown: number; limit: number }) {
  return (
    <div className="pbi:text-xs pbi:pt-1 pbi:shrink-0" style={{ color: '#94a3b8' }}>
      Exibindo {shown} de mais de {limit} categorias
    </div>
  );
}
