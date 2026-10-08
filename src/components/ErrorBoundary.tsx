import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/** Một trang lỗi không làm sập toàn bộ app */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('UI error', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto max-w-md p-8 text-center" role="alert">
        <p className="mb-2 text-lg font-semibold">Đã xảy ra lỗi khi hiển thị trang này</p>
        <p className="mb-4 text-sm text-muted">Dữ liệu của bạn vẫn an toàn. Thử tải lại trang.</p>
        <pre className="mb-4 max-h-32 overflow-auto rounded-lg bg-surface-2 p-2 text-left text-xs text-muted">{this.state.error.message}</pre>
        <div className="flex justify-center gap-2">
          <button type="button" className="rounded-lg border border-border px-4 py-2 text-sm" onClick={() => this.setState({ error: null })}>Thử lại</button>
          <button type="button" className="rounded-lg bg-accent px-4 py-2 text-sm text-accent-fg" onClick={() => window.location.reload()}>Tải lại</button>
        </div>
      </div>
    );
  }
}
