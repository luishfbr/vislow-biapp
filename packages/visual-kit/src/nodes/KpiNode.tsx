import type { FontSize } from '@vislow/config-schema';
import { FONT_SIZE_CLASS, cx } from '../tokens.js';
import { EmptyState } from '../states.js';
import { sumOf, type DataFrame } from './frame.js';

/**
 * Numero unico, agregado da medida.
 *
 * Papel nao preenchido no relatorio cai no estado vazio com instrucao, nunca em
 * tela branca (RN-04 / RF-20). O nome exibido e o que o USUARIO deu ao papel —
 * e o unico rotulo que ele reconhece no painel de campos.
 */
export function KpiNode({
  frame,
  measureRole,
  label,
  valueFontSize,
  valueColor,
  labelColor,
}: {
  frame: DataFrame;
  measureRole: string;
  label: string;
  valueFontSize: FontSize;
  valueColor: string;
  labelColor: string;
}) {
  const aggregate = sumOf(frame, measureRole);
  if (!aggregate) return <EmptyState missing={[measureRole]} />;

  // Sem rotulo escolhido, cai no nome do campo que o usuario arrastou: e mais
  // informativo do que um espaco em branco, e some sozinho se ele escrever um.
  const caption = label === '' ? (frame.roles[measureRole]?.title ?? '') : label;

  return (
    <div className="pbi:flex-1 pbi:min-h-0 pbi:min-w-0 pbi:flex pbi:flex-col pbi:items-center pbi:justify-center">
      <div
        className={cx('pbi:truncate', 'pbi:max-w-full', 'pbi:font-bold', FONT_SIZE_CLASS[valueFontSize])}
        style={{ color: valueColor }}
        title={aggregate.formatted}
      >
        {aggregate.formatted}
      </div>
      {caption !== '' && (
        <div
          className="pbi:text-sm pbi:truncate pbi:max-w-full pbi:mt-1"
          style={{ color: labelColor }}
          title={caption}
        >
          {caption}
        </div>
      )}
    </div>
  );
}
