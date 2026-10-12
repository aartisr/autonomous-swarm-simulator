/**
 * Mission-Critical Tactical Error Boundary.
 * Catches unhandled runtime exceptions, preventing blank preview screens
 * and providing real-time diagnostic telemetry and one-click subsystem reset.
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Terminal, ShieldAlert } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
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
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('System fault caught by Tactical Error Boundary:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full min-h-[300px] flex flex-col items-center justify-center p-6 bg-[#07090e] text-slate-200 font-mono select-none">
          <div className="max-w-md w-full bg-[#0c1220] border border-rose-900/80 rounded-lg p-5 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center gap-2.5 text-rose-400">
              <ShieldAlert className="w-5 h-5 text-rose-500 animate-pulse shrink-0" />
              <div>
                <h2 className="text-sm font-bold tracking-wider uppercase text-rose-300">
                  {this.props.fallbackTitle || 'Subsystem Exception Intercepted'}
                </h2>
                <div className="text-[10px] text-rose-400/80">FAULT CONTAINMENT ACTIVE · SANDBOX RECOVERY READY</div>
              </div>
            </div>

            <div className="bg-[#05080e] rounded p-3 border border-slate-800 text-[11px] flex flex-col gap-1.5 overflow-hidden">
              <div className="flex items-center gap-1.5 text-slate-400 text-[10px]">
                <Terminal className="w-3 h-3 text-cyan-400" />
                <span>DIAGNOSTIC LOG:</span>
              </div>
              <div className="text-rose-300 font-semibold break-words">
                {this.state.error?.message || 'Unknown runtime error occurred.'}
              </div>
              {this.state.errorInfo && (
                <pre className="text-[9px] text-slate-500 overflow-x-auto max-h-28 whitespace-pre-wrap mt-1">
                  {this.state.errorInfo.componentStack}
                </pre>
              )}
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-[10px] text-slate-500">
                Safe Mode Protocol Available
              </span>
              <button
                onClick={this.handleReset}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-950 hover:bg-rose-900 text-rose-200 border border-rose-700 rounded text-xs transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reboot Subsystem</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
