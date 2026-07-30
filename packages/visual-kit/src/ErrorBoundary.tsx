import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ErrorCard } from './states.js';

/**
 * Ultima linha de defesa da RN-04.
 *
 * Um `try/catch` em volta de `root.render()` NAO basta: no modo concorrente do
 * React a fase de render e assincrona, entao a excecao acontece fora do bloco
 * try e o visual ficaria em branco — exatamente o cenario que a RN-04 proibe.
 * Somente um error boundary captura falhas de render de componente.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode; buildId?: string | undefined },
  { message: string | null }
> {
  public override state: { message: string | null } = { message: null };

  public static getDerivedStateFromError(error: unknown): { message: string } {
    return { message: error instanceof Error ? error.message : 'Falha na renderizacao.' };
  }

  public override componentDidCatch(error: unknown, info: ErrorInfo): void {
    // RNF-11: o console do visual e a unica telemetria disponivel no sandbox.
    console.error('[vislow] falha de render', error, info.componentStack);
  }

  public override render(): ReactNode {
    if (this.state.message !== null) {
      // O buildId vai no card porque e ele que o usuario fotografa ao relatar.
      return (
        <ErrorCard code="RENDER_FAIL" detail={this.state.message} buildId={this.props.buildId} />
      );
    }
    return this.props.children;
  }
}
