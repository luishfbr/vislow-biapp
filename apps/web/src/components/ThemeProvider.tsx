'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ReactNode } from 'react';

/**
 * O tema do EDITOR — nao o do visual.
 *
 * Duas coisas que este arquivo existe para nao deixar acontecer:
 *
 * 1. **O flash branco.** O React so hidrata depois da primeira pintura, entao um
 *    alternador feito em estado pinta a pagina clara e so depois escurece, a
 *    cada reload. O next-themes injeta um script SINCRONO no `<head>` que le a
 *    preferencia e escreve a classe antes de qualquer pixel — e a unica razao de
 *    haver dependencia aqui em vez de um `useState`.
 *
 * 2. **O padrao e ESCURO, e nao mais "sistema".** Num editor de canvas o chrome
 *    escuro recua e a prancheta — que e branca nos dois temas, porque representa
 *    a moldura do relatorio — salta como objeto. Com chrome claro a prancheta se
 *    dissolve no fundo e some a nocao de "isto e a peca, aquilo e a mesa".
 *    "Sistema" continua disponivel no alternador, so deixou de ser o padrao.
 *
 * `attribute="class"` casa com o `@custom-variant dark` de `globals.css`. Trocar
 * um sem o outro desliga o dark inteiro em silencio — foi exatamente o que
 * aconteceu quando o shadcn entrou pela metade.
 *
 * `enableSystem` fica: e o que mantem a opcao "sistema" funcionando no
 * alternador. Tira-lo transformaria essa escolha num no-op silencioso.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="dark" enableSystem>
      {children}
    </NextThemesProvider>
  );
}
