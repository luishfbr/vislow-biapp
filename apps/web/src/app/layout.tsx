import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google';
import { ThemeProvider } from '@/components/ThemeProvider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * IBM Plex, e nao a dupla de fabrica (Inter, Geist). E uma face de linhagem
 * tecnica, desenhada para produto de dados, e aguenta bem os 10-13px em que este
 * editor trabalha.
 *
 * A Mono nao e decoracao: TODA MEDIDA do editor e composta nela — coordenada,
 * dimensao, escala, versao do pacote, tamanho em KB, contador. O painel da
 * direita e uma folha de especificacao, nao um formulario com numeros dentro, e
 * a face e o que sustenta essa leitura. Ate aqui `font-mono` era usado em 7
 * lugares sem que `--font-mono` existisse, entao caia na pilha do navegador.
 *
 * As duas vem por `next/font`, que auto-hospeda: nao ha requisicao para o Google
 * em tempo de execucao.
 */
const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-sans',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'Vislow — editor de visuais do Power BI',
  description: 'Crie visuais customizados do Power BI sem instalar nada.',
};

/**
 * A cor da barra do navegador e o MESMO valor de `--background` no tema escuro
 * (zinc-950). Vai em hex literal por obrigacao do formato: o `themeColor` do Next
 * vira uma `<meta>` no `<head>`, lida antes de qualquer CSS existir — uma
 * `var(--background)` ali nao resolveria para nada. Mudar a rampa exige mudar
 * este valor junto, e nenhum teste guarda o par.
 *
 * VALOR UNICO, e nao mais um par por `prefers-color-scheme`. O par so faz sentido
 * quando o tema segue o SO, e desde a troca para escuro por padrao ele nao segue:
 * quem esta num SO claro e nao mexeu no alternador ve o editor ESCURO, e a
 * `<meta>` casada com o SO pintaria a barra de claro contra uma tela escura. O
 * preco e o inverso, menor: quem escolher o tema claro a mao fica com a barra
 * escura. Uma `<meta>` nao enxerga a classe que o next-themes escreve, entao nao
 * ha como acertar os dois casos aqui.
 */
export const viewport: Viewport = {
  themeColor: '#09090b',
};

/**
 * `scheme-light-dark` nao e decorativo: sem `color-scheme`, o navegador desenha
 * os controles NATIVOS no tema claro dentro de uma interface escura — as setas
 * do campo numerico da prancheta ficam cinza-claro sobre cinza-claro, e a barra
 * de rolagem sai branca. Os `dark:` do Tailwind so alcancam o que e nosso.
 *
 * `suppressHydrationWarning` no `<html>` e exigencia do next-themes, e so ali: o
 * script dele escreve a classe do tema ANTES da hidratacao, entao o markup do
 * servidor e o do cliente divergem nesse atributo por construcao. Nao vale a
 * pena espalhar isso para baixo — o aviso do React nao propaga.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={cn(
        'h-full scheme-light-dark',
        'font-sans',
        plexSans.variable,
        plexMono.variable,
      )}
    >
      <body className="h-full bg-background text-foreground antialiased">
        <ThemeProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
