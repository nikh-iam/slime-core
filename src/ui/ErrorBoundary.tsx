import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { reportError } from '../shared/logging';

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { reportError(`${error.message}\n${info.componentStack ?? ''}`); }
  render() {
    return this.state.failed
      ? <main className="panel" role="alert">The interface could not load. Use the tray to quit and restart.</main>
      : this.props.children;
  }
}
