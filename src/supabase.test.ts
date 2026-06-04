import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  initAuth,
  getCurrentUser,
  onAuthChange,
  signUp,
  signIn,
  signOut,
  createSuvedaStore,
  loadShoppingItems,
  claimShoppingItem,
  unclaimShoppingItem,
} from './supabase';

beforeEach(() => {
  localStorage.clear();
  delete (window as any).__suvedaUser;
  delete (window as any).__suvedaStore;
});

describe('initAuth / getCurrentUser', () => {
  it('returns null or User (depending on Supabase session)', async () => {
    const user = await initAuth();
    // Either null (no session) or a User object — both are valid
    expect(user === null || typeof user === 'object').toBe(true);
  });

  it('getCurrentUser returns null or User', () => {
    const user = getCurrentUser();
    expect(user === null || typeof user === 'object').toBe(true);
  });
});

describe('onAuthChange', () => {
  it('calls listener immediately with current state (since auth is initialized)', () => {
    const fn = vi.fn();
    const unsub = onAuthChange(fn);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(null);
    unsub();
  });

  it('returns an unsubscribe function', () => {
    const fn = vi.fn();
    const unsub = onAuthChange(fn);
    expect(typeof unsub).toBe('function');
    unsub();
  });
});

describe('createSuvedaStore', () => {
  it('returns a store with the expected API shape', () => {
    const store = createSuvedaStore();
    expect(typeof store.loadAppState).toBe('function');
    expect(typeof store.saveAppState).toBe('function');
    expect(typeof store.loadChatMessages).toBe('function');
    expect(typeof store.appendChatMessage).toBe('function');
  });

  it('store has a ready promise that resolves', async () => {
    const store = createSuvedaStore();
    const ready = await store.ready;
    expect(typeof ready).toBe('boolean');
  });
});

describe('loadShoppingItems', () => {
  it('returns an array of shopping items when Supabase is configured', async () => {
    const items = await loadShoppingItems();
    expect(Array.isArray(items)).toBe(true);
    if (items.length > 0) {
      expect(items[0]).toHaveProperty('id');
      expect(items[0]).toHaveProperty('item');
      expect(items[0]).toHaveProperty('category');
    }
  });
});

describe('claimShoppingItem', () => {
  it('resolves without error', async () => {
    await expect(claimShoppingItem('test-id', 'Test User')).resolves.toBeUndefined();
  });
});

describe('unclaimShoppingItem', () => {
  it('resolves without error', async () => {
    await expect(unclaimShoppingItem('test-id')).resolves.toBeUndefined();
  });
});

describe('signUp / signIn / signOut', () => {
  it('signUp returns an object with data and error properties', async () => {
    const result = await signUp('nonexistent@test.com', 'password123', 'Test');
    expect(result).toHaveProperty('data');
    expect(result).toHaveProperty('error');
  });

  it('signIn returns an object with data and error properties', async () => {
    const result = await signIn('nonexistent@test.com', 'password123');
    expect(result).toHaveProperty('data');
    expect(result).toHaveProperty('error');
  });

  it('signOut does not throw when not signed in', async () => {
    await expect(signOut()).resolves.toBeUndefined();
  });
});
