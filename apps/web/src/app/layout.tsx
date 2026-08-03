import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Vislow — editor de visuais do Power BI',
  description: 'Crie visuais customizados do Power BI sem instalar nada.',
};

/**
 * `scheme-light-dark` nao e decorativo: sem `color-scheme`, o navegador desenha
 * os controles NATIVOS no tema claro dentro de uma interface escura — as setas
 * do campo numerico da prancheta ficam cinza-claro sobre cinza-claro, e a barra
 * de rolagem sai branca. Os `dark:` do Tailwind so alcancam o que e nosso.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className="h-full scheme-light-dark">
      <body className="h-full bg-slate-100 text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100">
        {children}
      </body>
    </html>
  );
}
