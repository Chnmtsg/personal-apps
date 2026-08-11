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
        <h1 className="font-serif text-3xl">Something went wrong</h1>
        <p className="text-ink-muted">
          The app has a problem and cannot continue. Your writing is still safe on this device.
          Please tap Reload. This usually fixes it.
        </p>
        <p className="rounded-lg bg-sunk p-3 font-mono text-xs text-ink-soft">
          {error.message}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="min-h-11 self-start rounded-full bg-accent px-6 font-semibold text-paper"
        >
          Reload
        </button>
      </div>
    );
  }
}
