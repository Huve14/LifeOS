import React from 'react';
import { createRoot } from 'react-dom/client';
import '../styles.css';
import {
  createSuvedaStore,
  initAuth,
  signUp,
  signIn,
  signOut,
  onAuthChange,
  loadShoppingItems,
  claimShoppingItem,
  unclaimShoppingItem,
  subscribeShoppingItems,
  generateShareToken,
  validateShareToken,
  uploadPhoto,
  listPhotos,
  deletePhoto,
  type SuvedaStore,
} from './supabase';
import type { User } from '@supabase/supabase-js';

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
    __suvedaUser?: User | null;
    __suvedaAuth: {
      signUp: typeof signUp;
      signIn: typeof signIn;
      signOut: typeof signOut;
      onAuthChange: typeof onAuthChange;
    };
    __suvedaShopping: {
      load: typeof loadShoppingItems;
      claim: typeof claimShoppingItem;
      unclaim: typeof unclaimShoppingItem;
      subscribe: typeof subscribeShoppingItems;
      generateShareToken: typeof generateShareToken;
      validateShareToken: typeof validateShareToken;
    };
  }
}

window.React = React;
window.ReactDOM = { createRoot };
window.__SUVEDA_MOUNTED = false;
window.__suvedaStore = createSuvedaStore();
window.__suvedaApiUrl = (import.meta.env.VITE_API_URL || '/api/huve').trim();
window.__suvedaAuth = { signUp, signIn, signOut, onAuthChange };
window.__suvedaShopping = {
  load: loadShoppingItems,
  claim: claimShoppingItem,
  unclaim: unclaimShoppingItem,
  subscribe: subscribeShoppingItems,
  generateShareToken,
  validateShareToken,
};
window.__suvedaPhotos = { upload: uploadPhoto, list: listPhotos, del: deletePhoto };

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
  // Initialize auth before anything else (restores persisted session).
  await initAuth();

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
  await import('../auth.jsx');
  // @ts-expect-error legacy global JSX modules are injected for compatibility.
  await import('../shared-list.jsx');
  // @ts-expect-error legacy global JSX modules are injected for compatibility.
  await import('./components/ui/map-utils.jsx');
  // @ts-expect-error legacy global JSX modules are injected for compatibility.
  await import('./components/ui/memory-photo-grid.jsx');
  // @ts-expect-error legacy global JSX modules are injected for compatibility.
  await import('./components/ui/animated-icon.jsx');
  // @ts-expect-error legacy global JSX modules are injected for compatibility.
  await import('./components/ui/glass-calendar.jsx');
  // @ts-expect-error legacy global JSX modules are injected for compatibility.
  await import('../screens-map.jsx');
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
