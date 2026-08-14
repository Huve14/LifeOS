import React from 'react';
import { createRoot } from 'react-dom/client';
import '../styles.css';
import {
  createLifeOSStore,
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
  createPhotoUrl,
  uploadDocument,
  createDocumentUrl,
  deleteDocument,
  loadMyCallProfile,
  loadCallContacts,
  addCallContact,
  createCallInvite,
  revokeCallInvite,
  loadMyProfile,
  updateMyProfile,
  createGameRoom,
  joinGameRoom,
  loadGameRoom,
  applyGameMove,
  startGameRoom,
  applyCardGameAction,
  restartGameRoom,
  leaveGameRoom,
  subscribeGameRoom,
  type LifeOSStore,
} from './supabase';
import { installLifeOS } from './lifeos';
import { initSync, flushOutbox } from './lifeos/sync';
import { initNative } from './lifeos/native';
import { registerPush } from './lifeos/push';
import type { User } from '@supabase/supabase-js';

declare global {
  interface Window {
    React: typeof React;
    ReactDOM: {
      createRoot: typeof createRoot;
    };
    Root?: React.ComponentType;
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
    __suvedaStore?: LifeOSStore;
    __suvedaApiUrl?: string;
    __suvedaUser?: User | null;
    __suvedaAuth: {
      signUp: typeof signUp;
      signIn: typeof signIn;
      signOut: typeof signOut;
      onAuthChange: typeof onAuthChange;
      profile: typeof loadMyProfile;
      updateProfile: typeof updateMyProfile;
    };
    __suvedaShopping: {
      load: typeof loadShoppingItems;
      claim: typeof claimShoppingItem;
      unclaim: typeof unclaimShoppingItem;
      subscribe: typeof subscribeShoppingItems;
      generateShareToken: typeof generateShareToken;
      validateShareToken: typeof validateShareToken;
    };
    __suvedaDocuments?: {
      upload: typeof uploadDocument;
      signedUrl: typeof createDocumentUrl;
      del: typeof deleteDocument;
    };
    __suvedaPhotos?: {
      upload: typeof uploadPhoto;
      list: typeof listPhotos;
      signedUrl: typeof createPhotoUrl;
      del: typeof deletePhoto;
    };
    __suvedaCalls?: {
      profile: typeof loadMyCallProfile;
      contacts: typeof loadCallContacts;
      addContact: typeof addCallContact;
      createInvite: typeof createCallInvite;
      revokeInvite: typeof revokeCallInvite;
    };
    __suvedaGames?: {
      create: typeof createGameRoom;
      join: typeof joinGameRoom;
      load: typeof loadGameRoom;
      move: typeof applyGameMove;
      start: typeof startGameRoom;
      cardAction: typeof applyCardGameAction;
      restart: typeof restartGameRoom;
      leave: typeof leaveGameRoom;
      subscribe: typeof subscribeGameRoom;
    };
  }
}

window.React = React;
window.ReactDOM = { createRoot };
window.__SUVEDA_MOUNTED = false;
window.__suvedaStore = createLifeOSStore();
window.__suvedaApiUrl = (import.meta.env.VITE_API_URL || '/api/huve').trim();
window.__suvedaAuth = {
  signUp,
  signIn,
  signOut,
  onAuthChange,
  profile: loadMyProfile,
  updateProfile: updateMyProfile,
};
window.__suvedaShopping = {
  load: loadShoppingItems,
  claim: claimShoppingItem,
  unclaim: unclaimShoppingItem,
  subscribe: subscribeShoppingItems,
  generateShareToken,
  validateShareToken,
};
window.__suvedaPhotos = { upload: uploadPhoto, list: listPhotos, signedUrl: createPhotoUrl, del: deletePhoto };
window.__suvedaDocuments = { upload: uploadDocument, signedUrl: createDocumentUrl, del: deleteDocument };
window.__suvedaCalls = {
  profile: loadMyCallProfile,
  contacts: loadCallContacts,
  addContact: addCallContact,
  createInvite: createCallInvite,
  revokeInvite: revokeCallInvite,
};
window.__suvedaGames = {
  create: createGameRoom,
  join: joinGameRoom,
  load: loadGameRoom,
  move: applyGameMove,
  start: startGameRoom,
  cardAction: applyCardGameAction,
  restart: restartGameRoom,
  leave: leaveGameRoom,
  subscribe: subscribeGameRoom,
};
installLifeOS();

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

  // Requeue anything interrupted last session, then drain in the background.
  void initSync();

  // Native shell, when running as the iOS app. No-ops in a browser.
  void initNative({
    onResume: () => {
      void flushOutbox();
      window.dispatchEvent(new CustomEvent('lifeos:resumed'));
    },
    // iOS grants a short window before suspending. Spend it finishing an
    // upload rather than losing the progress.
    onBackground: () => flushOutbox(),
    onNetworkChange: (online) => {
      window.dispatchEvent(new CustomEvent(online ? 'online' : 'offline'));
      if (online) void flushOutbox();
    },
  });

  void registerPush((data) => {
    // Deep link from a tapped notification into the screen it was about.
    window.dispatchEvent(new CustomEvent('lifeos:open-screen', { detail: data }));
  });

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
  await import('../video-journal.jsx');
  // @ts-expect-error legacy global JSX modules are injected for compatibility.
  await import('../daily-prompt.jsx');
  // @ts-expect-error legacy global JSX modules are injected for compatibility.
  await import('../trip-board.jsx');
  // @ts-expect-error legacy global JSX modules are injected for compatibility.
  await import('../call.jsx');
  // @ts-expect-error legacy global JSX modules are injected for compatibility.
  await import('../games.jsx');
  // @ts-expect-error legacy global JSX modules are injected for compatibility.
  await import('../space.jsx');
  // @ts-expect-error legacy global JSX modules are injected for compatibility.
  await import('../app.jsx');

  // Mount the app root after all modules are loaded.
  const rootElement = document.getElementById('root');
  if (rootElement && !rootElement.hasChildNodes()) {
    const Root = window.Root;
    if (Root) {
      createRoot(rootElement).render(React.createElement(Root));
    }
  }
}

void bootstrap();
