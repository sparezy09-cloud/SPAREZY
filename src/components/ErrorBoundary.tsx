import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("⚡ [ErrorBoundary Caught Error]:", error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReset = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
      window.location.reload();
    } catch (e) {
      console.error("Failed to clear storage:", e);
      window.location.reload();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-150 font-sans flex flex-col items-center justify-center p-6 text-xs">
          <div className="max-w-2xl w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 space-y-6 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-rose-600"></div>
            
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-500 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h2 className="text-base font-bold tracking-tight text-white">Critical Runtime Exception</h2>
                <p className="text-slate-400 text-[11px]">React intercepted an unhandled render error. The application has halted to prevent data corruption.</p>
              </div>
            </div>

            <div className="bg-slate-950 border border-slate-800/80 p-5 rounded-2xl space-y-3 font-mono text-[10.5px] text-slate-300 leading-relaxed overflow-x-auto max-h-60">
              <p className="font-bold text-rose-400">Error Name / Message:</p>
              <pre className="whitespace-pre-wrap font-sans text-rose-300 select-all leading-normal">
                {this.state.error?.toString() || "Unknown Error"}
              </pre>
              
              {this.state.errorInfo && (
                <div className="mt-3 pt-3 border-t border-slate-800/60">
                  <p className="font-bold text-indigo-400 mb-1">Component Stack Trace:</p>
                  <pre className="whitespace-pre text-slate-400 leading-normal select-all overflow-x-auto text-[10px]">
                    {this.state.errorInfo.componentStack}
                  </pre>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2">
              <button
                onClick={() => window.location.reload()}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 px-4 rounded-xl transition cursor-pointer text-center text-xs flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Reload Web Portal
              </button>

              <button
                onClick={this.handleReset}
                className="bg-slate-800 hover:bg-slate-700 hover:text-rose-400 text-slate-300 font-bold py-2.5 px-4 rounded-xl transition cursor-pointer text-center text-xs flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Clear Cache &amp; Reset
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
