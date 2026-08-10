import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Keeps one bad render from blanking the whole app.
 *
 * Feedback is stored as it was returned, so an entry written under an older
 * schema — a category since renamed, a field since added — can throw while
 * rendering. Without a boundary that removes every screen, including the ones
 * that would let the user export or delete the offending data.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled render error:", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 p-6">
        <h1 className="text-xl font-bold">Something broke</h1>
        <p className="text-slate-700">
          The app hit an error it couldn't recover from. Your entries are still stored on this
          device — reloading usually clears it.
        </p>
        <p className="rounded-lg bg-slate-100 p-3 font-mono text-xs text-slate-600">
          {error.message}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="min-h-11 self-start rounded-full bg-blue-700 px-6 font-semibold text-white"
        >
          Reload
        </button>
      </div>
    );
  }
}
