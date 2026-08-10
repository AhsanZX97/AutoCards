import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * The last thing between a thrown render and a blank white page.
 *
 * React unmounts the whole tree when a render throws and nothing catches it,
 * which looks exactly like a dead deployment — no message, no way back, and
 * nothing in the UI to report. This turns that into a screen someone can act
 * on, and puts the real error somewhere support can ask them to read out.
 *
 * A class because there is still no hook equivalent of `componentDidCatch`.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[autocards] a screen failed to render', error, info.componentStack);
  }

  private reload = (): void => {
    window.location.reload();
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
        <div className="w-full max-w-md text-center">
          <span className="text-4xl">⚠️</span>
          <h1 className="mt-4 text-xl font-bold text-slate-900 dark:text-white">
            Something went wrong on this screen
          </h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Your decks are safe. Reloading usually clears it — if it keeps happening, send us the
            details below and we&apos;ll fix it.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <button
              onClick={this.reload}
              className="rounded-xl bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600"
            >
              Reload
            </button>
            <a
              href="/app/decks"
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Back to my decks
            </a>
          </div>
          <details className="mt-6 text-left">
            <summary className="cursor-pointer text-xs font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
              Technical details
            </summary>
            <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-slate-100 p-3 text-left text-xs text-slate-600 dark:bg-slate-900 dark:text-slate-400">
              {error.message}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}
