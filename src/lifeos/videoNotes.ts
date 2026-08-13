// Video journal data layer.
//
// The write path is queue first: a recording lands in the outbox before any
// network call, then a flusher drains it. Nothing in the UI waits on the
// network to show the clip, and nothing is lost if the connection dies between
// the two halves of the write (object upload, then row insert).

import { getAuthClient, hasConfig } from '../supabase';
import { currentUserId } from './members';
import { withRetry } from './net';
import {
  entryBlob,
  entryPoster,
  putEntry,
  updateEntry,
  updateProgress,
  type OutboxEntry,
  type VideoNoteEntry,
} from './outbox';
import { baseMime, posterPath, storagePath } from './recording';
import { flushOutbox, registerSender, subscribeSent } from './sync';
import { removeFiles, signedUrl, uploadFile } from './upload';

export const BUCKET = 'video-notes';

export type VideoNote = {
  id: string;
  author_id: string;
  client_id: string;
  storage_path: string;
  poster_path: string | null;
  duration_seconds: number;
  size_bytes: number;
  mime_type: string;
  width: number | null;
  height: number | null;
  caption: string;
  recorded_at: string;
  created_at: string;
};

export type NoteView = {
  note_id: string;
  watched_seconds: number;
  completed: boolean;
};

const NOTE_COLUMNS =
  'id, author_id, client_id, storage_path, poster_path, duration_seconds, size_bytes, mime_type, width, height, caption, recorded_at, created_at';

// ---------- Reads ----------

export async function listVideoNotes(limit = 200): Promise<VideoNote[]> {
  if (!hasConfig) return [];
  const { data, error } = await getAuthClient()
    .from('lifeos_video_notes')
    .select(NOTE_COLUMNS)
    .order('recorded_at', { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data as VideoNote[];
}

/** Keyed by note id. RLS means this only ever returns the caller's own rows. */
export async function loadMyViews(): Promise<Record<string, NoteView>> {
  if (!hasConfig) return {};
  const { data, error } = await getAuthClient()
    .from('lifeos_video_note_views')
    .select('note_id, watched_seconds, completed');

  if (error || !data) return {};
  const map: Record<string, NoteView> = {};
  for (const row of data as NoteView[]) map[row.note_id] = row;
  return map;
}

export function unwatchedCount(notes: VideoNote[], views: Record<string, NoteView>): number {
  const me = currentUserId();
  return notes.filter((note) => note.author_id !== me && !views[note.id]?.completed).length;
}

export function playbackUrl(path: string): Promise<string | null> {
  return signedUrl(BUCKET, path);
}

export function posterUrl(path: string | null): Promise<string | null> {
  if (!path) return Promise.resolve(null);
  return signedUrl(BUCKET, path, 60 * 60 * 24);
}

// ---------- Watched state ----------

/**
 * Written on a throttle from the player, so a dropped write just means the
 * resume point is a few seconds stale rather than an error the reader sees.
 */
export async function recordProgress(
  noteId: string,
  watchedSeconds: number,
  completed: boolean,
): Promise<void> {
  const viewerId = currentUserId();
  if (!viewerId || !hasConfig) return;

  try {
    await withRetry(
      async () => {
        const { error } = await getAuthClient()
          .from('lifeos_video_note_views')
          .upsert(
            {
              note_id: noteId,
              viewer_id: viewerId,
              watched_seconds: Math.round(watchedSeconds * 100) / 100,
              completed,
              watched_at: new Date().toISOString(),
            },
            { onConflict: 'note_id,viewer_id' },
          );
        if (error) throw error;
      },
      { attempts: 3, base: 500 },
    );
  } catch {
    // Best effort. The clip still plays; only the resume point is affected.
  }
}

// ---------- Writes ----------

export type QueueArgs = {
  blob: Blob;
  poster: Blob | null;
  durationSeconds: number;
  mimeType: string;
  width: number | null;
  height: number | null;
  caption: string;
  clientId: string;
  recordedAt?: string;
};

/**
 * Put a finished recording on the queue. Awaits only the local write, so the
 * UI can close the recorder as soon as the bytes are safe on the device.
 */
export async function queueVideoNote(args: QueueArgs): Promise<VideoNoteEntry> {
  const bytes = await args.blob.arrayBuffer();
  const posterBytes = await args.poster?.arrayBuffer() ?? null;

  const entry: VideoNoteEntry = {
    id: args.clientId,
    kind: 'video-note',
    status: 'queued',
    createdAt: Date.now(),
    attempts: 0,
    lastError: null,
    progress: 0,
    bytes,
    size: args.blob.size,
    posterBytes,
    meta: {
      durationSeconds: args.durationSeconds,
      mimeType: args.mimeType,
      width: args.width,
      height: args.height,
      caption: args.caption,
      recordedAt: args.recordedAt ?? new Date().toISOString(),
    },
  };

  await putEntry(entry);
  void flushOutbox();
  return entry;
}

async function sendEntry(queued: OutboxEntry): Promise<void> {
  const entry = queued as VideoNoteEntry;
  const authorId = currentUserId();
  if (!authorId) throw new Error('Not signed in');

  const blob = entryBlob(entry);
  if (!blob) throw new Error('The recording is missing from this device');

  const path = storagePath(authorId, entry.id, entry.meta.mimeType);
  const posterBlob = entryPoster(entry);
  const poster = posterBlob ? posterPath(authorId, entry.id) : null;

  await uploadFile({
    bucket: BUCKET,
    path,
    blob,
    contentType: baseMime(entry.meta.mimeType),
    onProgress: (fraction) => {
      // Reserve the last slice of the bar for the poster and the row insert.
      void updateProgress(entry.id, fraction * 0.9);
    },
  });

  if (posterBlob && poster) {
    try {
      await uploadFile({
        bucket: BUCKET,
        path: poster,
        blob: posterBlob,
        contentType: 'image/jpeg',
      });
    } catch {
      // A missing thumbnail is cosmetic. Do not fail the clip over it.
    }
  }

  await updateEntry(entry.id, { progress: 0.95 });

  const { error } = await getAuthClient()
    .from('lifeos_video_notes')
    .upsert(
      {
        author_id: authorId,
        client_id: entry.id,
        storage_path: path,
        poster_path: poster,
        duration_seconds: Math.round(entry.meta.durationSeconds * 100) / 100,
        size_bytes: entry.size,
        mime_type: baseMime(entry.meta.mimeType),
        width: entry.meta.width,
        height: entry.meta.height,
        caption: entry.meta.caption,
        recorded_at: entry.meta.recordedAt,
      },
      { onConflict: 'client_id' },
    );

  if (error) throw error;
}

registerSender('video-note', sendEntry);

export async function deleteVideoNote(note: VideoNote): Promise<boolean> {
  if (!hasConfig) return false;
  const { error } = await getAuthClient()
    .from('lifeos_video_notes')
    .delete()
    .eq('id', note.id);
  if (error) return false;

  await removeFiles(BUCKET, [note.storage_path, note.poster_path ?? '']);
  notifyNotesChanged();
  return true;
}

// ---------- Change notification ----------

const NOTES_CHANGED = 'lifeos:notes-changed';

export function notifyNotesChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(NOTES_CHANGED));
}

/**
 * Local changes, queue sends and remote inserts all land here, so the timeline
 * has one refresh path whether the clip came from this device or the other one.
 */
export function subscribeVideoNotes(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  window.addEventListener(NOTES_CHANGED, onChange);
  const unsubscribeSent = subscribeSent('video-note', onChange);

  let removeChannel = () => {};
  if (hasConfig) {
    const client = getAuthClient();
    const channel = client
      .channel('lifeos-video-notes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lifeos_video_notes' },
        () => onChange(),
      )
      .subscribe();
    removeChannel = () => {
      void client.removeChannel(channel);
    };
  }

  return () => {
    window.removeEventListener(NOTES_CHANGED, onChange);
    unsubscribeSent();
    removeChannel();
  };
}
