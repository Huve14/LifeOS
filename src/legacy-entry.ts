import React from 'react';
import { createRoot } from 'react-dom/client';
import '../styles.css';
import { createSuvedaStore, type SuvedaStore } from './supabase';

declare global {
  interface Window {
    React: typeof React;
    ReactDOM: {
      createRoot: typeof createRoot;
    };
    __suvedaDefaults?: {
      moveDate: string;
      progressLevel: 'empty' | 'half' | 'almost';
      initialTab: string;
      accent: 'terracotta' | 'teal' | 'gold';
      density: 'cozy' | 'compact';
      layout: 'classic' | 'cards' | 'timeline';
      progressStyle: 'bar' | 'circle' | 'segmented';
      dark: boolean;
    };
    __suvedaStore?: SuvedaStore;
    __suvedaApiUrl?: string;
  }
}

window.React = React;
window.ReactDOM = { createRoot };
window.__SUVEDA_MOUNTED = false;
window.__suvedaStore = createSuvedaStore();
window.__suvedaApiUrl = import.meta.env.VITE_API_URL || '/api/deepseek';

if (!window.__suvedaDefaults) {
  window.__suvedaDefaults = {
    moveDate: '2026-08-10',
    progressLevel: 'empty',
    initialTab: 'home',
    accent: 'terracotta',
    density: 'cozy',
    layout: 'classic',
    progressStyle: 'bar',
    dark: false,
  };
}

async function bootstrap() {
  // Load the legacy modules in the same order they were included in index.html.
  // @ts-expect-error legacy global JSX modules are injected for compatibility.
  await import('../ios-frame.jsx');
  // @ts-expect-error legacy global JSX modules are injected for compatibility.
  await import('../tweaks-panel.jsx');
  // @ts-expect-error legacy global JSX modules are injected for compatibility.
  await import('../components.jsx');
  // @ts-expect-error legacy global JSX modules are injected for compatibility.
  await import('../loading-globe.jsx');
  // @ts-expect-error legacy global JSX modules are injected for compatibility.
  await import('../data.jsx');
  // @ts-expect-error legacy global JSX modules are injected for compatibility.
  await import('../screens-home.jsx');
  // @ts-expect-error legacy global JSX modules are injected for compatibility.
  await import('../screens-modules.jsx');
  // @ts-expect-error legacy global JSX modules are injected for compatibility.
  await import('../app.jsx');

  // Mount the app root after all modules are loaded.
  const rootElement = document.getElementById('root');
  if (rootElement && !rootElement.hasChildNodes()) {
    const Root = (window as any).Root;
    if (Root) {
      createRoot(rootElement).render(React.createElement(Root));
    }
  }
}

void bootstrap();
