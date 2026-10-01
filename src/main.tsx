import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './ui/App';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { desktop } from './platform/tauri';
import { reportError } from './shared/logging';
import './ui/styles.css';

window.addEventListener('error', (event) => reportError(event.error ?? event.message));
window.addEventListener('unhandledrejection', (event) => reportError(event.reason));
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><ErrorBoundary onFailure={() => { void desktop.window.hide().catch(reportError); }}><App notch={desktop.notch} /></ErrorBoundary></React.StrictMode>,
);
