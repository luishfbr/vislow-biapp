'use client';

import { MonitorSmartphone } from 'lucide-react';

/**
 * Abaixo de 768px o editor nao se oferece.
 *
 * Nao e preguica: e a resposta honesta. O painel de propriedades e um
 * instrumento de precisao — grade de duas colunas, arrasto de 4px por passo no
 * rotulo numerico, alcas de 8px na prancheta — e nada disso sobrevive a um alvo
 * de toque de 44px sem virar outro produto. Entregar uma versao espremida em que
 * os gestos erram seria pior do que dizer que nao cabe.
 *
 * E o mesmo que o Figma faz, pelo mesmo motivo.
 *
 * A ESCOLHA E POR CSS, e nao por `matchMedia` em JavaScript. Medir a largura no
 * cliente obrigaria a decidir alguma coisa antes da primeira medida, e as duas
 * saidas sao ruins: montar o editor e troca-lo pelo aviso e um salto visivel, e
 * segurar tudo ate medir atrasa a tela em quem esta no caso normal. Com
 * `md:hidden` os dois estados existem no HTML e o navegador escolhe antes de
 * pintar.
 */
export function SmallScreenNotice() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center md:hidden">
      <MonitorSmartphone className="size-8 text-muted-foreground" />
      <div className="space-y-1.5">
        <h1 className="text-title font-semibold text-foreground">
          O Vislow pede uma tela maior
        </h1>
        <p className="mx-auto max-w-xs text-pretty text-body leading-relaxed text-muted-foreground">
          Compor um visual envolve arrastar, redimensionar e ajustar medida ao pixel. Abra em uma
          janela de 768&nbsp;px ou mais para começar.
        </p>
      </div>
    </div>
  );
}
