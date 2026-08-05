'use client';

import { useEffect, useState } from 'react';

/**
 * Uma media query como booleano de React.
 *
 * POR QUE NAO DA PARA FAZER SO COM CSS aqui. O resto da responsividade do editor
 * e classe (`md:hidden`, `xl:not-sr-only`), e e assim que tem de ser — o
 * navegador decide antes de pintar e nao ha salto. Mas o grupo de paineis
 * redimensionaveis calcula largura em JavaScript: se a coluna deve ser uma coluna
 * ou uma gaveta e uma decisao de ESTRUTURA, e nao de aparencia, e o CSS nao tem
 * como devolver essa resposta para o grupo.
 *
 * Comeca em `false` no servidor e na primeira renderizacao, e so entao mede. O
 * consumidor unico e o `Workbench`, que so monta depois da hidratacao — entao a
 * medida chega antes de qualquer pixel do shell, e nao ha o salto que essa
 * escolha normalmente custa.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    // O jsdom nao implementa `matchMedia` sem stub, e o editor tem de montar
    // mesmo assim — o teste que faltar o stub deve falhar na asserticao dele, e
    // nao aqui.
    if (typeof window.matchMedia !== 'function') return;

    const list = window.matchMedia(query);
    setMatches(list.matches);

    const onChange = (event: MediaQueryListEvent): void => {
      setMatches(event.matches);
    };
    list.addEventListener('change', onChange);
    return () => {
      list.removeEventListener('change', onChange);
    };
  }, [query]);

  return matches;
}
