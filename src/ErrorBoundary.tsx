import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 bg-white z-[100] flex flex-col items-center justify-center p-4">
          <div className="bg-red-50 p-6 rounded-2xl max-w-md w-full border border-red-200 overflow-auto max-h-screen">
            <h2 className="text-xl font-bold text-red-700 mb-2">React Error Boundary</h2>
            <p className="text-sm font-bold text-red-800 mb-1">{this.state.error?.toString()}</p>
            <pre className="text-xs text-red-600 font-mono break-words whitespace-pre-wrap">{this.state.errorInfo?.componentStack}</pre>
            <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg">Ricarica App</button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
