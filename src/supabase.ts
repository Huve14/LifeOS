import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import type { GameType } from './lifeos/games';

type AppSnapshot = Record<string, unknown>;

type ChatMessage = {
  role: 'user' | 'ai';
  text: string;
};

type LifeOSStore = {
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
const LOCAL_STATE_KEY = 'lifeos:app-state';
const LEGACY_LOCAL_STATE_KEY = 'suveda:app-state';
const LOCAL_CHAT_KEY = 'lifeos:chat';
const LEGACY_LOCAL_CHAT_KEY = 'suveda:chat-main';

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

function getStoreUserId(): string | null {
  return typeof window !== 'undefined' ? window.__suvedaUser?.id ?? null : null;
}

function createFallbackStore(): LifeOSStore {
  return {
    hasConfig: false,
    ready: Promise.resolve(false),
    async loadAppState() {
      return safeLocalRead<AppSnapshot | null>(
        LOCAL_STATE_KEY,
        safeLocalRead<AppSnapshot | null>(LEGACY_LOCAL_STATE_KEY, null),
      );
    },
    async saveAppState(payload: AppSnapshot) {
      safeLocalWrite(LOCAL_STATE_KEY, payload);
    },
    async loadChatMessages(threadId = 'main') {
      return safeLocalRead<ChatMessage[]>(
        `${LOCAL_CHAT_KEY}:${threadId}`,
        safeLocalRead<ChatMessage[]>(`${LEGACY_LOCAL_CHAT_KEY}:${threadId}`, []),
      );
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

/** Every read and write is keyed by the active Auth user and reinforced by RLS. */
function createRemoteStore(client: SupabaseClient): LifeOSStore {
  return {
    hasConfig: true,
    ready: Promise.resolve(true),
    async loadAppState() {
      const userId = getStoreUserId();
      if (!userId) return null;
      const { data, error } = await client
        .from('lifeos_user_state')
        .select('payload')
        .eq('user_id', userId)
        .maybeSingle();

      if (error || !data?.payload || typeof data.payload !== 'object') return null;
      return data.payload as AppSnapshot;
    },
    async saveAppState(payload: AppSnapshot) {
      const userId = getStoreUserId();
      if (!userId) throw new Error('Not signed in');
      const { error } = await client.from('lifeos_user_state').upsert({
        user_id: userId,
        payload,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });
      if (error) throw error;
    },
    async loadChatMessages() {
      const userId = getStoreUserId();
      if (!userId) return [];
      const { data, error } = await client
        .from('lifeos_chat_messages')
        .select('role, text, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

      if (error || !data) {
        return [];
      }

      return data.map((row) => ({ role: row.role as ChatMessage['role'], text: row.text }));
    },
    async appendChatMessage(message: ChatMessage) {
      const userId = getStoreUserId();
      if (!userId) return;
      await client.from('lifeos_chat_messages').insert({
        user_id: userId,
        role: message.role,
        text: message.text,
      });
    },
    async clearChatMessages() {
      const userId = getStoreUserId();
      if (!userId) return;
      await client
        .from('lifeos_chat_messages')
        .delete()
        .eq('user_id', userId);
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
      data: { name: name.trim(), display_name: name.trim() },
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
  const { error } = await client.auth.signOut({ scope: 'local' });
  if (error) throw error;
  notifyAuthListeners(null);
}

// ---------- Call profiles, contacts, and browser invitations ----------

export type UserProfile = {
  user_id: string;
  handle: string;
  display_name: string;
  time_zone: string;
};

export type CallProfile = Pick<UserProfile, 'user_id' | 'handle' | 'display_name'>;

export type CallContact = CallProfile & {
  created_at: string;
};

export type CallInvite = {
  invite_id: string;
  invite_token: string;
  invite_mode: 'audio' | 'video';
  invite_expires_at: string;
  target_display_name: string | null;
};

export type GameRoom = {
  id: number;
  code: string;
  game_type: GameType;
  status: 'waiting' | 'playing' | 'finished';
  state: Record<string, unknown>;
  version: number;
  max_players: number;
  owner_id: string;
  winner_id: string | null;
  updated_at: string;
};
export type GameParticipant = {
  user_id: string;
  display_name: string;
  seat: number;
  joined_at: string;
};
export type GameHand = {
  cards: string[];
  points: number;
  stood: boolean;
  meta: Record<string, unknown>;
};
export type GameRoomBundle = {
  room: GameRoom;
  players: GameParticipant[];
  hand: GameHand | null;
};

type GameRoomRpcRow = {
  room_id: number;
  room_code: string;
  room_game_type: GameType;
  room_status: GameRoom['status'];
  room_state: Record<string, unknown>;
  room_version: number;
  room_max_players: number;
  room_owner_id: string;
  room_winner_id: string | null;
  room_updated_at: string;
};

function toGameRoom(value: GameRoomRpcRow): GameRoom {
  return {
    id: value.room_id,
    code: value.room_code,
    game_type: value.room_game_type,
    status: value.room_status,
    state: value.room_state,
    version: value.room_version,
    max_players: value.room_max_players,
    owner_id: value.room_owner_id,
    winner_id: value.room_winner_id,
    updated_at: value.room_updated_at,
  };
}

function firstRpcRow<T>(data: T | T[] | null): T | null {
  if (Array.isArray(data)) return data[0] ?? null;
  return data;
}

export async function loadMyProfile(): Promise<UserProfile | null> {
  if (!hasConfig) return null;
  const user = getCurrentUser();
  if (!user) return null;

  const { data, error } = await getAuthClient()
    .from('lifeos_profiles')
    .select('user_id, handle, display_name, time_zone')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error || !data) return null;
  return data as UserProfile;
}

export async function updateMyProfile(patch: {
  display_name?: string;
  time_zone?: string;
}): Promise<UserProfile> {
  const user = getCurrentUser();
  if (!hasConfig || !user) throw new Error('Sign in to update your profile.');

  const safePatch: { display_name?: string; time_zone?: string } = {};
  if (typeof patch.display_name === 'string') {
    const displayName = patch.display_name.trim();
    if (!displayName) throw new Error('Please enter your name.');
    safePatch.display_name = displayName.slice(0, 80);
  }
  if (typeof patch.time_zone === 'string' && patch.time_zone.trim()) {
    safePatch.time_zone = patch.time_zone.trim().slice(0, 80);
  }

  const { data, error } = await getAuthClient()
    .from('lifeos_profiles')
    .update(safePatch)
    .eq('user_id', user.id)
    .select('user_id, handle, display_name, time_zone')
    .single();

  if (error || !data) throw new Error(error?.message || 'Your profile could not be updated.');

  if (safePatch.display_name) {
    // Keep Auth metadata aligned for features that consume the current session
    // directly, while `lifeos_profiles` remains the private source of truth.
    const { data: authData } = await getAuthClient().auth.updateUser({
      data: {
        name: safePatch.display_name,
        display_name: safePatch.display_name,
      },
    });
    if (authData.user) window.__suvedaUser = authData.user;
  }

  return data as UserProfile;
}

export async function loadMyCallProfile(): Promise<CallProfile | null> {
  const profile = await loadMyProfile();
  if (!profile) return null;
  return {
    user_id: profile.user_id,
    handle: profile.handle,
    display_name: profile.display_name,
  };
}

export async function loadCallContacts(): Promise<CallContact[]> {
  if (!hasConfig || !getCurrentUser()) return [];

  const { data, error } = await getAuthClient().rpc('lifeos_list_call_contacts');

  if (error || !data) return [];
  return data as CallContact[];
}

export async function addCallContact(handle: string): Promise<CallProfile> {
  if (!hasConfig || !getCurrentUser()) throw new Error('Sign in to add a call contact.');
  const normalized = handle.trim().toLowerCase().replace(/^@/, '');
  if (!normalized) throw new Error('Enter their Life OS ID.');

  const { data, error } = await getAuthClient().rpc('lifeos_add_contact_by_handle', {
    input_handle: normalized,
  });
  if (error) throw new Error(error.message);

  const profile = Array.isArray(data) ? data[0] : data;
  if (!profile) throw new Error('No Life OS user has that ID.');
  return profile as CallProfile;
}

export async function createCallInvite(
  mode: 'audio' | 'video' = 'audio',
  targetHandle?: string,
): Promise<CallInvite> {
  if (!hasConfig || !getCurrentUser()) throw new Error('Sign in to create a call link.');

  const { data, error } = await getAuthClient().rpc('lifeos_create_call_invite', {
    input_mode: mode,
    input_target_handle: targetHandle?.trim().toLowerCase().replace(/^@/, '') || null,
  });
  if (error) throw new Error(error.message);

  const invite = Array.isArray(data) ? data[0] : data;
  if (!invite?.invite_token) throw new Error('The call link could not be created.');
  return invite as CallInvite;
}

export async function revokeCallInvite(inviteId: string): Promise<boolean> {
  if (!hasConfig || !getCurrentUser() || !inviteId) return false;
  const { data, error } = await getAuthClient().rpc('lifeos_revoke_call_invite', {
    input_invite_id: inviteId,
  });
  return !error && data === true;
}

// ---------- Multiplayer game rooms ----------

async function loadGameRoomPlayers(roomId: number): Promise<GameParticipant[]> {
  const { data, error } = await getAuthClient().rpc('lifeos_game_room_players', {
    input_room_id: roomId,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as GameParticipant[];
}

async function loadMyGameHand(roomId: number): Promise<GameHand | null> {
  const { data, error } = await getAuthClient().rpc('lifeos_my_game_hand', {
    input_room_id: roomId,
  });
  if (error) throw new Error(error.message);
  const hand = firstRpcRow(data as GameHand | GameHand[] | null);
  return hand ?? null;
}

export async function loadGameRoom(roomId: number): Promise<GameRoomBundle> {
  if (!hasConfig || !getCurrentUser()) throw new Error('Sign in to open a game room.');

  const [{ data, error }, players, hand] = await Promise.all([
    getAuthClient().rpc('lifeos_game_room_snapshot', { input_room_id: roomId }),
    loadGameRoomPlayers(roomId),
    loadMyGameHand(roomId),
  ]);
  if (error) throw new Error(error.message);
  const row = firstRpcRow(data as GameRoomRpcRow[] | null);
  if (!row) throw new Error('That game room is no longer available.');
  return { room: toGameRoom(row), players, hand };
}

export async function createGameRoom(gameType: GameType): Promise<GameRoomBundle> {
  if (!hasConfig || !getCurrentUser()) throw new Error('Sign in to create a game room.');
  const { data, error } = await getAuthClient().rpc('lifeos_create_game_room', {
    input_game_type: gameType,
  });
  if (error) throw new Error(error.message);
  const row = firstRpcRow(data as GameRoomRpcRow[] | null);
  if (!row) throw new Error('The game room could not be created.');
  return loadGameRoom(row.room_id);
}

export async function joinGameRoom(code: string): Promise<GameRoomBundle> {
  if (!hasConfig || !getCurrentUser()) throw new Error('Sign in to join a game room.');
  const normalized = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  if (normalized.length !== 6) throw new Error('Enter the six-character room code.');

  const { data, error } = await getAuthClient().rpc('lifeos_join_game_room', {
    input_code: normalized,
  });
  if (error) throw new Error(error.message);
  const row = firstRpcRow(data as GameRoomRpcRow[] | null);
  if (!row) throw new Error('That game room is no longer available.');
  return loadGameRoom(row.room_id);
}

export async function applyGameMove(options: {
  roomId: number;
  expectedVersion: number;
  state: Record<string, unknown>;
  status: 'playing' | 'finished';
  winnerId?: string | null;
}): Promise<GameRoomBundle> {
  const { data, error } = await getAuthClient().rpc('lifeos_apply_game_move', {
    input_room_id: options.roomId,
    input_expected_version: options.expectedVersion,
    input_state: options.state,
    input_status: options.status,
    input_winner_id: options.winnerId ?? null,
  });
  if (error) throw new Error(error.message);
  const row = firstRpcRow(data as GameRoomRpcRow[] | null);
  if (!row) throw new Error('Your move could not be saved.');
  return loadGameRoom(row.room_id);
}

export async function startGameRoom(roomId: number, expectedVersion: number): Promise<GameRoomBundle> {
  const { data, error } = await getAuthClient().rpc('lifeos_start_game_room', {
    input_room_id: roomId,
    input_expected_version: expectedVersion,
  });
  if (error) throw new Error(error.message);
  const row = firstRpcRow(data as GameRoomRpcRow[] | null);
  if (!row) throw new Error('The card table could not be started.');
  return loadGameRoom(row.room_id);
}

export async function applyCardGameAction(options: {
  roomId: number;
  expectedVersion: number;
  action: Record<string, unknown>;
}): Promise<GameRoomBundle> {
  const { data, error } = await getAuthClient().rpc('lifeos_card_game_action', {
    input_room_id: options.roomId,
    input_expected_version: options.expectedVersion,
    input_action: options.action,
  });
  if (error) throw new Error(error.message);
  const row = firstRpcRow(data as GameRoomRpcRow[] | null);
  if (!row) throw new Error('That card-game move could not be saved.');
  return loadGameRoom(row.room_id);
}

export async function restartGameRoom(roomId: number, expectedVersion: number): Promise<GameRoomBundle> {
  const { data, error } = await getAuthClient().rpc('lifeos_restart_game_room', {
    input_room_id: roomId,
    input_expected_version: expectedVersion,
  });
  if (error) throw new Error(error.message);
  const row = firstRpcRow(data as GameRoomRpcRow[] | null);
  if (!row) throw new Error('The rematch could not be started.');
  return loadGameRoom(row.room_id);
}

export async function leaveGameRoom(roomId: number): Promise<boolean> {
  const { data, error } = await getAuthClient().rpc('lifeos_leave_game_room', {
    input_room_id: roomId,
  });
  if (error) throw new Error(error.message);
  return data === true;
}

export function subscribeGameRoom(
  roomId: number,
  onChange: (bundle: GameRoomBundle) => void,
  onError?: (error: Error) => void,
): () => void {
  let active = true;
  let refreshPending = false;

  const refresh = async () => {
    if (!active || refreshPending) return;
    refreshPending = true;
    try {
      const bundle = await loadGameRoom(roomId);
      if (active) onChange(bundle);
    } catch (error) {
      if (active) onError?.(error instanceof Error ? error : new Error('The room could not refresh.'));
    } finally {
      refreshPending = false;
    }
  };

  const channel = getAuthClient()
    .channel(`lifeos-game-room-${roomId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'lifeos_game_rooms', filter: `id=eq.${roomId}` },
      () => { void refresh(); },
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'lifeos_game_participants', filter: `room_id=eq.${roomId}` },
      () => { void refresh(); },
    )
    .subscribe();

  return () => {
    active = false;
    void getAuthClient().removeChannel(channel);
  };
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

function getPublicClient(): SupabaseClient {
  // Reuse the app client. Creating a second GoTrue client with the same
  // storage key can contend for the session lock and stall otherwise public
  // shopping requests.
  return getAuthClient();
}

export async function loadShoppingItems(shareToken?: string): Promise<ShoppingItem[]> {
  if (!hasConfig) return [];
  if (shareToken) {
    const { data, error } = await getPublicClient().rpc('lifeos_shared_shopping_items', {
      input_token: shareToken,
    });
    return error || !data ? [] : data as ShoppingItem[];
  }

  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const request = getPublicClient()
    .from('suveda_shopping_items')
    .select('*')
    .order('sort_order', { ascending: true })
    .abortSignal(controller.signal);

  const { data, error } = await Promise.race([
    request,
    new Promise<{ data: null; error: null }>((resolve) => {
      timeoutId = setTimeout(() => {
        controller.abort();
        resolve({ data: null, error: null });
      }, 3_000);
    }),
  ]);
  if (timeoutId) clearTimeout(timeoutId);

  if (error || !data) return [];
  return data as ShoppingItem[];
}

export async function claimShoppingItem(itemId: string, name: string, shareToken?: string): Promise<void> {
  if (!hasConfig) return;
  if (!itemId || !name?.trim()) return;
  if (shareToken) {
    await getPublicClient().rpc('lifeos_claim_shared_shopping_item', {
      input_token: shareToken,
      input_item_id: itemId,
      input_name: name.trim(),
    });
    return;
  }
  await getPublicClient()
    .from('suveda_shopping_items')
    .update({ supplied_by: name.trim(), updated_at: new Date().toISOString() })
    .eq('id', itemId);
}

export async function unclaimShoppingItem(itemId: string, shareToken?: string): Promise<void> {
  if (!hasConfig) return;
  if (!itemId) return;
  if (shareToken) {
    await getPublicClient().rpc('lifeos_claim_shared_shopping_item', {
      input_token: shareToken,
      input_item_id: itemId,
      input_name: '',
    });
    return;
  }
  await getPublicClient()
    .from('suveda_shopping_items')
    .update({ supplied_by: '', updated_at: new Date().toISOString() })
    .eq('id', itemId);
}

export function subscribeShoppingItems(
  onChange: (items: ShoppingItem[]) => void,
  shareToken?: string,
): () => void {
  if (shareToken) {
    let active = true;
    const refresh = async () => {
      const items = await loadShoppingItems(shareToken);
      if (active) onChange(items);
    };
    const timer = window.setInterval(() => { void refresh(); }, 4_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }

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
  const userId = getStoreUserId();
  if (!hasConfig || !userId) return null;
  const { data, error } = await getPublicClient()
    .from('suveda_share_tokens')
    .insert({ label, active: true, owner_id: userId })
    .select('token')
    .single();

  if (error || !data) return null;
  return data.token;
}

export async function validateShareToken(token: string): Promise<boolean> {
  if (!hasConfig) return false;
  const { data, error } = await getPublicClient().rpc('lifeos_validate_shopping_share', {
    input_token: token,
  });
  return !error && data === true;
}

// ---------- Storage (photo uploads) ----------

const PHOTO_BUCKET = 'memory-photos';

export async function uploadPhoto(
  file: File,
): Promise<string | null> {
  const userId = getStoreUserId();
  if (!hasConfig || !userId) return null;
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `${userId}/${Date.now()}.${ext}`;
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

  return data.path;
}

export async function listPhotos(): Promise<string[]> {
  const userId = getStoreUserId();
  if (!hasConfig || !userId) return [];
  const client = getAuthClient();
  const prefix = `${userId}/`;

  const { data, error } = await client.storage
    .from(PHOTO_BUCKET)
    .list(prefix, {
      sortBy: { column: 'created_at', order: 'desc' },
    });

  if (error || !data) return [];

  return data
    .filter(f => f.metadata?.mimetype?.startsWith('image/'))
    .map(f => `${prefix}${f.name}`);
}

function photoPath(value: string): string {
  if (!value) return '';
  if (!/^https?:\/\//i.test(value)) return value.replace(/^\/+/, '');
  const marker = `${PHOTO_BUCKET}/`;
  const index = value.indexOf(marker);
  if (index === -1) return '';
  return decodeURIComponent(value.slice(index + marker.length).split('?')[0]);
}

export async function createPhotoUrl(value: string, expiresIn = 3_600): Promise<string | null> {
  if (!hasConfig) return null;
  const path = photoPath(value);
  if (!path || path.split('/')[0] !== getStoreUserId()) return null;
  const { data, error } = await getAuthClient().storage
    .from(PHOTO_BUCKET)
    .createSignedUrl(path, expiresIn);
  return error ? null : data?.signedUrl ?? null;
}

export async function deletePhoto(value: string): Promise<boolean> {
  if (!hasConfig) return false;
  const client = getAuthClient();
  const path = photoPath(value);
  if (!path || path.split('/')[0] !== getStoreUserId()) return false;

  const { error } = await client.storage
    .from(PHOTO_BUCKET)
    .remove([path]);

  return !error;
}

// ---------- Storage (private document vault) ----------

const DOCUMENT_BUCKET = 'lifeos-documents';

function safeFileExtension(fileName: string): string {
  const candidate = fileName.split('.').pop()?.toLowerCase() ?? 'bin';
  return /^[a-z0-9]{1,8}$/.test(candidate) ? candidate : 'bin';
}

export async function uploadDocument(file: File): Promise<string | null> {
  if (!hasConfig) return null;
  const userId = getCurrentUser()?.id;
  if (!userId) return null;

  const path = `${userId}/${crypto.randomUUID()}.${safeFileExtension(file.name)}`;
  const { data, error } = await getAuthClient().storage
    .from(DOCUMENT_BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      contentType: file.type || undefined,
      upsert: false,
    });

  if (error || !data) {
    console.error('Document upload failed:', error?.message);
    return null;
  }
  return data.path;
}

export async function createDocumentUrl(path: string): Promise<string | null> {
  if (!hasConfig || !path) return null;
  const { data, error } = await getAuthClient().storage
    .from(DOCUMENT_BUCKET)
    .createSignedUrl(path, 60);

  if (error || !data?.signedUrl) {
    console.error('Document link failed:', error?.message);
    return null;
  }
  return data.signedUrl;
}

export async function deleteDocument(path: string): Promise<boolean> {
  if (!hasConfig || !path) return false;
  const { error } = await getAuthClient().storage
    .from(DOCUMENT_BUCKET)
    .remove([path]);
  return !error;
}

// ---------- Store factory ----------

export function createLifeOSStore() {
  if (!hasConfig) {
    return createFallbackStore();
  }

  const client = getAuthClient();
  return createRemoteStore(client);
}

/** @deprecated Kept for the legacy entry module while the public brand is Life OS. */
export const createSuvedaStore = createLifeOSStore;

export type SuvedaStore = LifeOSStore;
export type { AppSnapshot, ChatMessage, LifeOSStore, ShoppingItem };
