// Resumable upload to Supabase Storage.
//
// Uses the TUS endpoint, so an interrupted upload picks up from the last
// completed chunk instead of starting over. On a 14MB clip over hotel wifi
// that is the difference between eventually finishing and never finishing.
//
// If the resumable path fails outright, we fall back to a single shot upload
// with backoff. The object path is deterministic and upsert is on, so a retry
// through either path overwrites rather than duplicating.

import * as tus from 'tus-js-client';
import { getAuthClient, SUPABASE_URL } from '../supabase';
import { withRetry } from './net';

/** Supabase's resumable endpoint requires exactly this chunk size. */
const CHUNK_SIZE = 6 * 1024 * 1024;

export type UploadArgs = {
  bucket: string;
  path: string;
  blob: Blob;
  contentType: string;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
};

async function accessToken(): Promise<string | null> {
  const { data } = await getAuthClient().auth.getSession();
  return data.session?.access_token ?? null;
}

function uploadResumable(args: UploadArgs, token: string): Promise<void> {
  const { bucket, path, blob, contentType, onProgress, signal } = args;

  return new Promise((resolve, reject) => {
    const upload = new tus.Upload(blob, {
      endpoint: `${SUPABASE_URL}/storage/v1/upload/resumable`,
      retryDelays: [0, 1000, 3000, 8000, 15000],
      headers: {
        authorization: `Bearer ${token}`,
        'x-upsert': 'true',
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: bucket,
        objectName: path,
        contentType,
        cacheControl: '3600',
      },
      chunkSize: CHUNK_SIZE,
      onError: (error) => reject(error),
      onProgress: (sent, total) => {
        if (total > 0) onProgress?.(sent / total);
      },
      onSuccess: () => {
        onProgress?.(1);
        resolve();
      },
    });

    function abort() {
      void upload.abort();
      reject(new DOMException('Upload aborted', 'AbortError'));
    }

    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener('abort', abort, { once: true });

    // Resume from a previous session if this blob has been tried before.
    upload.findPreviousUploads().then((previous) => {
      if (previous.length > 0) upload.resumeFromPreviousUpload(previous[0]);
      upload.start();
    }, () => upload.start());
  });
}

async function uploadSingleShot(args: UploadArgs): Promise<void> {
  const { bucket, path, blob, contentType, onProgress, signal } = args;
  await withRetry(
    async () => {
      const { error } = await getAuthClient()
        .storage.from(bucket)
        .upload(path, blob, { contentType, upsert: true, cacheControl: '3600' });
      if (error) throw error;
    },
    { attempts: 4, signal },
  );
  onProgress?.(1);
}

/**
 * Resumable first, single shot as a backstop. Small files skip the resumable
 * machinery entirely, since one request will either work or not.
 */
export async function uploadFile(args: UploadArgs): Promise<void> {
  const token = await accessToken();
  if (!token) throw new Error('Not signed in');

  if (args.blob.size <= CHUNK_SIZE) {
    await uploadSingleShot(args);
    return;
  }

  try {
    await uploadResumable(args, token);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    await uploadSingleShot(args);
  }
}

/** Short lived read URL. Signed URLs honour range requests, so seeking works. */
export async function signedUrl(
  bucket: string,
  path: string,
  expiresInSeconds = 60 * 60 * 4,
): Promise<string | null> {
  const { data, error } = await getAuthClient()
    .storage.from(bucket)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data) return null;
  return data.signedUrl;
}

export async function removeFiles(bucket: string, paths: string[]): Promise<void> {
  const wanted = paths.filter(Boolean);
  if (wanted.length === 0) return;
  await getAuthClient().storage.from(bucket).remove(wanted);
}
