import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './ui/App';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { desktop } from './platform/tauri';
import { localAI } from './platform/localAI';
import { reportError } from './shared/logging';
import './ui/styles.css';

window.addEventListener('error', (event) => reportError(event.error ?? event.message));
window.addEventListener('unhandledrejection', (event) => reportError(event.reason));
const root = ReactDOM.createRoot(document.getElementById('root')!);
if (import.meta.env.DEV && new URLSearchParams(location.search).has('notch-motion-lab')) {
  void import('./notch/NotchMotionLab').then(({ NotchMotionLab }) => root.render(<React.StrictMode><NotchMotionLab /></React.StrictMode>));
} else if (import.meta.env.DEV && new URLSearchParams(location.search).has('character-lab')) {
  void import('./character/slime/CharacterLab').then(({ CharacterLab }) => root.render(<React.StrictMode><CharacterLab /></React.StrictMode>));
} else root.render(
  <React.StrictMode><ErrorBoundary onFailure={() => { void desktop.window.hide().catch(reportError); }}><App notch={desktop.notch} provider={localAI} /></ErrorBoundary></React.StrictMode>,
);
