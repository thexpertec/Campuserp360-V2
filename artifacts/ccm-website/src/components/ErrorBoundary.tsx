import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

type Props = { children: ReactNode };
type State = { error: Error | null };

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (typeof console !== "undefined" && console.error) {
      console.error("[ErrorBoundary]", error, info.componentStack);
    }
  }

  handleReset = (): void => {
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith("ccm-"))
        .forEach((k) => localStorage.removeItem(k));
    } catch {
      /* ignore */
    }
    if (typeof window !== "undefined") {
      window.location.href = "/";
    }
  };

  handleReload = (): void => {
    if (typeof window !== "undefined") window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        className="min-h-[60vh] flex items-center justify-center px-4 py-16"
        data-testid="error-boundary"
      >
        <div className="max-w-lg w-full bg-card border border-border rounded-2xl p-8 shadow-lg text-center">
          <div className="w-14 h-14 rounded-full bg-rose-100 text-rose-600 mx-auto mb-5 flex items-center justify-center">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <h2 className="text-2xl font-bold text-primary mb-2">Something went wrong</h2>
          <p className="text-foreground/75 leading-relaxed mb-6">
            We hit an unexpected problem while loading this page. Please try reloading — if
            the issue continues, return to the home page to clear any saved draft and start
            fresh.
          </p>

          {error.message ? (
            <pre className="text-left text-xs bg-muted text-foreground/70 rounded-lg p-3 mb-6 overflow-x-auto max-h-32">
              {error.message}
            </pre>
          ) : null}

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              type="button"
              onClick={this.handleReload}
              className="inline-flex items-center justify-center gap-2 px-5 h-11 rounded-full bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
              data-testid="error-reload"
            >
              <RefreshCw className="w-4 h-4" /> Reload page
            </button>
            <button
              type="button"
              onClick={this.handleReset}
              className="inline-flex items-center justify-center gap-2 px-5 h-11 rounded-full bg-accent text-accent-foreground font-semibold hover:bg-accent/90 transition-colors"
              data-testid="error-reset"
            >
              <Home className="w-4 h-4" /> Reset &amp; go home
            </button>
          </div>

          <p className="text-xs text-foreground/55 mt-5">
            Need help? Email{" "}
            <a className="underline" href="mailto:burdiwaheed@gmail.com">
              burdiwaheed@gmail.com
            </a>
            .
          </p>
        </div>
      </div>
    );
  }
}
