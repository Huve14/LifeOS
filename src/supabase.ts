import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

type AppSnapshot = Record<string, unknown>;

type ChatMessage = {
  role: 'user' | 'ai';
  text: string;
};

type SuvedaStore = {
  hasConfig: boolean;
  ready: Promise<boolean>;
  loadAppState: () => Promise<AppSnapshot | null>;
  saveAppState: (payload: AppSnapshot) => Promise<void>;
  loadChatMessages: (threadId?: string) => Promise<ChatMessage[]>;
  appendChatMessage: (message: ChatMessage, threadId?: string) => Promise<void>;
  clearChatMessages: (threadId?: string) => Promise<void>;
};

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';
const hasConfig = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export { SUPABASE_URL, SUPABASE_ANON_KEY, hasConfig };
const LOCAL_STATE_KEY = 'suveda:app-state';
const LOCAL_CHAT_KEY = 'suveda:chat-main';

function safeLocalRead<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function safeLocalWrite(key: string, value: unknown) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore quota / serialization issues and keep the app working.
  }
}

function getStoreId(): string {
  if (typeof window !== 'undefined' && window.__suvedaUser?.id) {
    return window.__suvedaUser.id;
  }
  return 'suveda-main';
}

function getThreadId(): string {
  if (typeof window !== 'undefined' && window.__suvedaUser?.id) {
    return window.__suvedaUser.id;
  }
  return 'main';
}

function createFallbackStore(): SuvedaStore {
  return {
    hasConfig: false,
    ready: Promise.resolve(false),
    async loadAppState() {
      return safeLocalRead<AppSnapshot | null>(LOCAL_STATE_KEY, null);
    },
    async saveAppState(payload: AppSnapshot) {
      safeLocalWrite(LOCAL_STATE_KEY, payload);
    },
    async loadChatMessages(threadId = 'main') {
      return safeLocalRead<ChatMessage[]>(`${LOCAL_CHAT_KEY}:${threadId}`, []);
    },
    async appendChatMessage(message: ChatMessage, threadId = 'main') {
      const existing = safeLocalRead<ChatMessage[]>(`${LOCAL_CHAT_KEY}:${threadId}`, []);
      safeLocalWrite(`${LOCAL_CHAT_KEY}:${threadId}`, [...existing, message]);
    },
    async clearChatMessages(threadId = 'main') {
      safeLocalWrite(`${LOCAL_CHAT_KEY}:${threadId}`, []);
    },
  };
}

/**
 * App state lives per space, split one row per top-level module.
 *
 * The old shape was a single jsonb document keyed by user id. Two people
 * sharing one space would have made every save a race: whoever debounced last
 * would overwrite the other's edit to a completely unrelated screen. Splitting
 * by module means editing the budget cannot clobber a packing list.
 */
async function currentSpaceId(client: SupabaseClient): Promise<string | null> {
  const { data } = await client.from('lifeos_space_members').select('space_id').limit(1);
  return data?.[0]?.space_id ?? null;
}

// Only modules that actually changed get written back.
let lastSaved: Record<string, string> = {};

/** The pre-0009 single blob, keyed by user rather than by space. */
async function loadLegacyState(client: SupabaseClient): Promise<AppSnapshot | null> {
  const { data, error } = await client
    .from('suveda_app_state')
    .select('payload')
    .eq('id', getStoreId())
    .maybeSingle();

  if (error || !data?.payload || typeof data.payload !== 'object') return null;
  return data.payload as AppSnapshot;
}

function createRemoteStore(client: SupabaseClient): SuvedaStore {
  return {
    hasConfig: true,
    ready: Promise.resolve(true),
    async loadAppState() {
      const spaceId = await currentSpaceId(client);

      // Before 0009 has run there is no space and no space state. Reading the
      // old per-user row keeps the app working through the gap, so deploying
      // the client and running the migration do not have to be simultaneous.
      // Without this, an un-migrated database makes the app look wiped: no
      // state comes back, and onboarding starts from scratch over data that
      // is still sitting safely in the old table.
      if (!spaceId) return loadLegacyState(client);

      const { data, error } = await client
        .from('lifeos_space_state')
        .select('module, payload')
        .eq('space_id', spaceId);

      if (error) return loadLegacyState(client);
      if (data.length === 0) return loadLegacyState(client);

      const snapshot: AppSnapshot = {};
      lastSaved = {};

      for (const row of data as Array<{ module: string; payload: unknown }>) {
        // The migration parks the old single blob under 'legacy'. Unpack it
        // once so nothing is lost, then let the per-module rows take over.
        if (row.module === 'legacy' && row.payload && typeof row.payload === 'object') {
          Object.assign(snapshot, row.payload as AppSnapshot);
          continue;
        }
        // A module carried over from a joiner keeps its own key so it is not
        // silently binned, but it is not part of the live state.
        if (row.module.endsWith(':joined')) continue;

        snapshot[row.module] = (row.payload as { value: unknown }).value;
        lastSaved[row.module] = JSON.stringify((row.payload as { value: unknown }).value);
      }

      return Object.keys(snapshot).length > 0 ? snapshot : null;
    },
    async saveAppState(payload: AppSnapshot) {
      const spaceId = await currentSpaceId(client);

      // Same gap. Keep writing where the app can still read from.
      if (!spaceId) {
        await client.from('suveda_app_state').upsert({
          id: getStoreId(),
          payload,
          updated_at: new Date().toISOString(),
        });
        return;
      }

      const changed = Object.entries(payload)
        .filter(([module, value]) => {
          const serialised = JSON.stringify(value);
          if (lastSaved[module] === serialised) return false;
          lastSaved[module] = serialised;
          return true;
        })
        .map(([module, value]) => ({
          space_id: spaceId,
          module,
          payload: { value },
          updated_at: new Date().toISOString(),
        }));

      if (changed.length === 0) return;
      await client.from('lifeos_space_state').upsert(changed, { onConflict: 'space_id,module' });
    },
    async loadChatMessages() {
      const { data, error } = await client
        .from('suveda_chat_messages')
        .select('role, text, created_at')
        .eq('thread_id', getThreadId())
        .order('created_at', { ascending: true });

      if (error || !data) {
        return [];
      }

      return data.map((row) => ({ role: row.role as ChatMessage['role'], text: row.text }));
    },
    async appendChatMessage(message: ChatMessage) {
      await client.from('suveda_chat_messages').insert({
        thread_id: getThreadId(),
        role: message.role,
        text: message.text,
      });
    },
    async clearChatMessages() {
      await client
        .from('suveda_chat_messages')
        .delete()
        .eq('thread_id', getThreadId());
    },
  };
}

// ---------- Auth ----------

let authClient: SupabaseClient | null = null;
let authInitialized = false;

const authListeners: Array<(user: User | null) => void> = [];

export function getAuthClient(): SupabaseClient {
  if (!authClient) {
    authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }
  return authClient;
}

function notifyAuthListeners(user: User | null) {
  window.__suvedaUser = user;
  authListeners.forEach((fn) => fn(user));
}

export async function initAuth(): Promise<User | null> {
  if (authInitialized) return window.__suvedaUser ?? null;
  authInitialized = true;

  if (!hasConfig) {
    notifyAuthListeners(null);
    return null;
  }

  const client = getAuthClient();

  const { data: { session } } = await client.auth.getSession();
  const user = session?.user ?? null;
  notifyAuthListeners(user);

  client.auth.onAuthStateChange((_event, session) => {
    notifyAuthListeners(session?.user ?? null);
  });

  return user;
}

export function getCurrentUser(): User | null {
  return window.__suvedaUser ?? null;
}

export function onAuthChange(fn: (user: User | null) => void) {
  // If auth already initialized, immediately call with current state.
  if (authInitialized) {
    try { fn(window.__suvedaUser ?? null); } catch { /* safe */ }
  }
  authListeners.push(fn);
  return () => {
    const idx = authListeners.indexOf(fn);
    if (idx !== -1) authListeners.splice(idx, 1);
  };
}

export async function signUp(email: string, password: string, name: string) {
  if (!hasConfig) return { data: null, error: new Error('Supabase is not configured.') };
  if (!email || !email.includes('@')) {
    return { data: null, error: new Error('Please enter a valid email address.') };
  }
  if (!password || password.length < 6) {
    return { data: null, error: new Error('Password must be at least 6 characters.') };
  }
  if (!name || !name.trim()) {
    return { data: null, error: new Error('Please enter your name.') };
  }
  const client = getAuthClient();
  return client.auth.signUp({
    email,
    password,
    options: {
      data: { name: name.trim() },
    },
  });
}

export async function signIn(email: string, password: string) {
  if (!hasConfig) return { data: null, error: new Error('Supabase is not configured.') };
  if (!email || !email.includes('@')) {
    return { data: null, error: new Error('Please enter a valid email address.') };
  }
  if (!password) {
    return { data: null, error: new Error('Please enter your password.') };
  }
  const client = getAuthClient();
  return client.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  if (!hasConfig) return;
  const client = getAuthClient();
  await client.auth.signOut();
  window.__suvedaUser = null;
  notifyAuthListeners(null);
}

// ---------- Shared shopping list ----------

type ShoppingItem = {
  id: string;
  category: string;
  item: string;
  quantity: string;
  price: number;
  supplied_by: string;
  note: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

let publicClient: SupabaseClient | null = null;

function getPublicClient(): SupabaseClient {
  if (!publicClient) {
    publicClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return publicClient;
}

export async function loadShoppingItems(): Promise<ShoppingItem[]> {
  if (!hasConfig) return [];
  const { data, error } = await getPublicClient()
    .from('suveda_shopping_items')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error || !data) return [];
  return data as ShoppingItem[];
}

export async function claimShoppingItem(itemId: string, name: string): Promise<void> {
  if (!hasConfig) return;
  if (!itemId || !name?.trim()) return;
  await getPublicClient()
    .from('suveda_shopping_items')
    .update({ supplied_by: name.trim(), updated_at: new Date().toISOString() })
    .eq('id', itemId);
}

export async function unclaimShoppingItem(itemId: string): Promise<void> {
  if (!hasConfig) return;
  if (!itemId) return;
  await getPublicClient()
    .from('suveda_shopping_items')
    .update({ supplied_by: '', updated_at: new Date().toISOString() })
    .eq('id', itemId);
}

export function subscribeShoppingItems(
  onChange: (items: ShoppingItem[]) => void,
): () => void {
  const channel = getPublicClient()
    .channel('shopping-list-changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'suveda_shopping_items' },
      async () => {
        const items = await loadShoppingItems();
        onChange(items);
      },
    )
    .subscribe();

  return () => {
    getPublicClient().removeChannel(channel);
  };
}

export async function generateShareToken(label: string): Promise<string | null> {
  if (!hasConfig) return null;
  const { data, error } = await getPublicClient()
    .from('suveda_share_tokens')
    .insert({ label, active: true })
    .select('token')
    .single();

  if (error || !data) return null;
  return data.token;
}

export async function validateShareToken(token: string): Promise<boolean> {
  if (!hasConfig) return false;
  const { data, error } = await getPublicClient()
    .from('suveda_share_tokens')
    .select('id')
    .eq('token', token)
    .eq('active', true)
    .maybeSingle();

  return !error && !!data;
}

// ---------- Storage (photo uploads) ----------

const PHOTO_BUCKET = 'memory-photos';

export async function uploadPhoto(
  file: File,
): Promise<string | null> {
  if (!hasConfig) return null;
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `${getStoreId()}/${Date.now()}.${ext}`;
  const client = getAuthClient();

  const { data, error } = await client.storage
    .from(PHOTO_BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (error || !data) {
    console.error('Upload failed:', error?.message);
    return null;
  }

  const { data: { publicUrl } } = client.storage
    .from(PHOTO_BUCKET)
    .getPublicUrl(path);

  return publicUrl;
}

export async function listPhotos(): Promise<string[]> {
  if (!hasConfig) return [];
  const client = getAuthClient();
  const prefix = `${getStoreId()}/`;

  const { data, error } = await client.storage
    .from(PHOTO_BUCKET)
    .list(prefix, {
      sortBy: { column: 'created_at', order: 'desc' },
    });

  if (error || !data) return [];

  return data
    .filter(f => f.metadata?.mimetype?.startsWith('image/'))
    .map(f => {
      const { data: { publicUrl } } = client.storage
        .from(PHOTO_BUCKET)
        .getPublicUrl(`${prefix}${f.name}`);
      return publicUrl;
    });
}

export async function deletePhoto(url: string): Promise<boolean> {
  if (!hasConfig) return false;
  const client = getAuthClient();

  // Extract path from public URL
  const parts = url.split(`${PHOTO_BUCKET}/`);
  if (parts.length < 2) return false;
  const path = parts[1].split('?')[0];

  const { error } = await client.storage
    .from(PHOTO_BUCKET)
    .remove([path]);

  return !error;
}

// ---------- Store factory ----------

export function createSuvedaStore() {
  if (!hasConfig) {
    return createFallbackStore();
  }

  const client = getAuthClient();
  return createRemoteStore(client);
}

export type { AppSnapshot, ChatMessage, SuvedaStore, ShoppingItem };
