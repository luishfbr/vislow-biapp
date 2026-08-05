'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * Claro, escuro ou o que o sistema disser.
 *
 * **O icone do gatilho troca por CSS, nao por JavaScript.** Ler `resolvedTheme`
 * para escolher qual desenhar e o caminho obvio e o errado: no servidor esse
 * valor e `undefined`, entao o React renderiza um icone, hidrata, descobre o
 * tema e troca — o que da erro de hidratacao, ou obriga ao `useState(mounted)`
 * que pisca um espaco vazio em todo carregamento. Dois icones sobrepostos, um
 * escondido pelo `dark:`, saem certos ja na primeira pintura, porque a classe do
 * tema e escrita antes dela.
 *
 * Grupo de RADIO, e nao tres itens soltos: as tres opcoes sao exclusivas, e
 * `role="menuitemradio"` e o que faz o leitor de tela anunciar qual esta ativa.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon-sm" aria-label="Tema do editor" title="Tema do editor">
            <Sun className="dark:hidden" aria-hidden />
            <Moon className="hidden dark:block" aria-hidden />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-36">
        <DropdownMenuRadioGroup
          value={theme ?? 'system'}
          // O `RadioGroup` do Base UI tipa o valor como `any` — ele aceita
          // qualquer coisa como valor de item. `String` aqui nao e defensivo, e
          // o estreitamento que o `setTheme` exige.
          onValueChange={(value) => {
            setTheme(String(value));
          }}
        >
          <DropdownMenuRadioItem value="light">
            <Sun aria-hidden />
            Claro
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <Moon aria-hidden />
            Escuro
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <Monitor aria-hidden />
            Sistema
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
