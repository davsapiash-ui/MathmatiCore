import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useAuthStore } from '@/application/useAuthStore';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  copied: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    copied: false,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary caught an error]:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleResetStorage = () => {
    try {
      useAuthStore.getState().logout();
    } catch (e) {
      console.warn('Failed to logout:', e);
    }
    window.location.href = '/login';
  };

  private handleGoHome = () => {
    window.location.href = '/login';
  };

  private handleCopyError = () => {
    const errorText = `[MathmatiCore Error Details]\nTime: ${new Date().toISOString()}\nURL: ${window.location.href}\nError: ${this.state.error?.toString() || 'Unknown'}\nStack: ${this.state.error?.stack || ''}\nComponentStack: ${this.state.errorInfo?.componentStack || ''}`;
    
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(errorText).then(() => {
        this.setState({ copied: true });
        setTimeout(() => this.setState({ copied: false }), 2500);
      }).catch(() => {
        this.fallbackCopy(errorText);
      });
    } else {
      this.fallbackCopy(errorText);
    }
  };

  private fallbackCopy = (text: string) => {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2500);
    } catch {
      alert('לא ניתן היה להעתיק אוטומטית. אנא העתק את הטקסט באופן ידני.');
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div
          dir="rtl"
          className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-50 dark:bg-slate-950 font-body text-slate-900 dark:text-slate-100 select-none text-center"
        >
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 shadow-xl flex flex-col items-center gap-6">
            <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center text-3xl shadow-inner">
              ⚠️
            </div>

            <div className="flex flex-col gap-2">
              <h2 className="font-display font-black text-2xl text-slate-900 dark:text-white">
                אירעה שגיאה בטעינת הדף
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
                המערכת זיהתה תקלה זמנית. ניתן לרענן את הדף, לחזור למסך הכניסה או לאפס את הזיכרון המקומי.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 w-full">
              <button
                onClick={this.handleReload}
                className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl font-bold transition-all shadow-md cursor-pointer"
              >
                רענן דף 🔄
              </button>
              <button
                onClick={this.handleResetStorage}
                className="flex-1 py-3 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-xl font-bold transition-all shadow-xs cursor-pointer"
              >
                איפוס זיכרון מקומי 🧹
              </button>
              <button
                onClick={this.handleGoHome}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-bold transition-all border border-slate-300 dark:border-slate-700 cursor-pointer"
              >
                למסך הכניסה 🚪
              </button>
            </div>

            {this.state.error && (
              <div className="w-full flex flex-col gap-2 text-right">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-slate-600 dark:text-slate-300">
                    פרטי שגיאה טכניים:
                  </span>
                  <button
                    onClick={this.handleCopyError}
                    className="text-xs px-3 py-1.5 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    {this.state.copied ? '✓ הועתק ללוח!' : '📋 העתק שגיאה לשליחה'}
                  </button>
                </div>
                <pre className="p-3 bg-slate-100 dark:bg-slate-900 rounded-xl overflow-x-auto text-[11px] font-mono text-rose-600 dark:text-rose-400 border border-slate-200 dark:border-slate-800 select-text max-h-48 text-left" dir="ltr">
                  {this.state.error.toString()}
                  {this.state.error.stack ? `\n\n${this.state.error.stack}` : ''}
                </pre>
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
