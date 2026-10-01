import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { reportError } from '../shared/logging';

export class ErrorBoundary extends Component<{ children: ReactNode; onFailure: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { reportError(`${error.message}\n${info.componentStack ?? ''}`); this.props.onFailure(); }
  render() {
    return this.state.failed
      ? null
      : this.props.children;
  }
}
