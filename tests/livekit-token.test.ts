import { afterEach, describe, expect, it, vi } from 'vitest';
import handler from '../api/livekit-token.js';

type Captured = { code: number; body: unknown };

function fakeResponse() {
  const captured: Partial<Captured> = {};
  return {
    captured: captured as Captured,
    writeHead: vi.fn((code: number) => { captured.code = code; }),
    end: vi.fn((body: string) => { captured.body = JSON.parse(body); }),
  };
}

async function post(body: unknown, headers: Record<string, string> = {}) {
  const res = fakeResponse();
  await handler({ method: 'POST', body, headers } as never, res as never);
  return res;
}

const originalFlag = process.env.ENABLE_CALLS;

function setCallingFlag(value: string | undefined) {
  if (value === undefined) delete process.env.ENABLE_CALLS;
  else process.env.ENABLE_CALLS = value;
}

afterEach(() => setCallingFlag(originalFlag));

describe('POST /api/livekit-token with calling switched off', () => {
  it('refuses to mint a call token', async () => {
    setCallingFlag(undefined);
    const res = await post({});
    expect(res.captured.code).toBe(404);
    expect(res.captured.body).toEqual({ error: 'Calling is not available.' });
  });

  it('refuses a browser invitation link just as firmly', async () => {
    setCallingFlag(undefined);
    const res = await post({ inviteToken: 'a'.repeat(64), guestName: 'Guest' });
    expect(res.captured.code).toBe(404);
  });

  it('refuses a signed-in member before looking anything up', async () => {
    setCallingFlag(undefined);
    const res = await post({}, { authorization: 'Bearer a-session-token' });
    expect(res.captured.code).toBe(404);
  });

  it('is not fooled by a near-miss flag value', async () => {
    for (const value of ['1', 'yes', 'True!', 'false']) {
      setCallingFlag(value);
      expect((await post({})).captured.code).toBe(404);
    }
  });

  it('still rejects non-POST requests', async () => {
    setCallingFlag(undefined);
    const res = fakeResponse();
    await handler({ method: 'GET', headers: {} } as never, res as never);
    expect(res.captured.code).toBe(405);
  });
});

describe('POST /api/livekit-token with calling switched on', () => {
  it('gets past the compliance gate and on to the usual configuration check', async () => {
    setCallingFlag('true');
    const res = await post({});
    // No LiveKit credentials in this environment, so the endpoint reaches its
    // pre-existing 503. Anything other than 404 proves the gate opened.
    expect(res.captured.code).not.toBe(404);
    expect(res.captured.code).toBe(503);
  });
});
