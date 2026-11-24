import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { sanitizarMensagemErroUi } from '@/src/utils/security';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: sanitizarMensagemErroUi(error?.message),
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Erro capturado pelo ErrorBoundary:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="app-shell-height flex items-center justify-center bg-[var(--bg-canvas)] px-4 text-[var(--text-primary)]">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300">
                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <h1 className="text-base font-semibold">Algo deu errado</h1>
                <p className="text-xs text-[var(--text-muted)]">
                  Não foi possível concluir a operação atual.
                </p>
              </div>
            </div>

            <p className="rounded-lg bg-[var(--bg-canvas)] p-3 text-xs text-[var(--text-secondary)] break-words">
              {this.state.message}
            </p>

            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent-primary)] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[var(--accent-hover)] cursor-pointer"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Recarregar aplicação
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
