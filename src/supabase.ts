import { createClient, type SupabaseClient } from '@supabase/supabase-js';

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
};

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';
const hasConfig = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
const APP_STATE_ID = 'suveda-main';
const THREAD_ID = 'main';
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
    async loadChatMessages(threadId = THREAD_ID) {
      return safeLocalRead<ChatMessage[]>(`${LOCAL_CHAT_KEY}:${threadId}`, []);
    },
    async appendChatMessage(message: ChatMessage, threadId = THREAD_ID) {
      const existing = safeLocalRead<ChatMessage[]>(`${LOCAL_CHAT_KEY}:${threadId}`, []);
      safeLocalWrite(`${LOCAL_CHAT_KEY}:${threadId}`, [...existing, message]);
    },
  };
}

function createRemoteStore(client: SupabaseClient): SuvedaStore {
  return {
    hasConfig: true,
    ready: Promise.resolve(true),
    async loadAppState() {
      const { data, error } = await client
        .from('suveda_app_state')
        .select('payload')
        .eq('id', APP_STATE_ID)
        .maybeSingle();

      if (error || !data?.payload || typeof data.payload !== 'object') {
        return null;
      }

      return data.payload as AppSnapshot;
    },
    async saveAppState(payload: AppSnapshot) {
      await client.from('suveda_app_state').upsert({
        id: APP_STATE_ID,
        payload,
        updated_at: new Date().toISOString(),
      });
    },
    async loadChatMessages(threadId = THREAD_ID) {
      const { data, error } = await client
        .from('suveda_chat_messages')
        .select('role, text, created_at')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true });

      if (error || !data) {
        return [];
      }

      return data.map((row) => ({ role: row.role as ChatMessage['role'], text: row.text }));
    },
    async appendChatMessage(message: ChatMessage, threadId = THREAD_ID) {
      await client.from('suveda_chat_messages').insert({
        thread_id: threadId,
        role: message.role,
        text: message.text,
      });
    },
  };
}

export function createSuvedaStore() {
  if (!hasConfig) {
    return createFallbackStore();
  }

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return createRemoteStore(client);
}

export type { AppSnapshot, ChatMessage, SuvedaStore };