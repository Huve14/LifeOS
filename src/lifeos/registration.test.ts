import { describe, expect, it } from 'vitest';
import { describeSignUpOutcome, signUpRedirectUrl } from './registration';

describe('what a new member is told after registering', () => {
  it('does not paint a successful registration as a failure', () => {
    const outcome = describeSignUpOutcome({ data: { session: null, user: { identities: [{}] } } }, 'sam@example.com');
    expect(outcome.tone).toBe('notice');
    expect(outcome.message).toContain('sam@example.com');
    expect(outcome.message).toContain('confirmation link');
  });

  it('says so plainly when the session arrives without a confirmation step', () => {
    expect(describeSignUpOutcome({ data: { session: { access_token: 'x' } } }).tone).toBe('success');
  });

  it('reads the same whether the address is new or already registered', () => {
    // Supabase returns an empty identities array for an address that already
    // exists so the form cannot be used to enumerate accounts. One message has
    // to serve both, and it must point an existing account at sign-in.
    const fresh = describeSignUpOutcome({ data: { session: null, user: { identities: [{}] } } }, 'sam@example.com');
    const taken = describeSignUpOutcome({ data: { session: null, user: { identities: [] } } }, 'sam@example.com');
    expect(taken.message).toBe(fresh.message);
    expect(taken.message).toContain('sign in instead');
  });

  it('names the one failure the person cannot fix themselves', () => {
    const outcome = describeSignUpOutcome({ error: { message: 'Signups not allowed for this instance', status: 422 } });
    expect(outcome.tone).toBe('error');
    expect(outcome.message).toContain('switched off');
  });

  it('recognises that failure by code as well as by wording', () => {
    const outcome = describeSignUpOutcome({ error: { code: 'signup_disabled', message: 'nope' } });
    expect(outcome.message).toContain('switched off');
  });

  it('explains a throttled confirmation email rather than blaming the form', () => {
    expect(describeSignUpOutcome({ error: { code: 'over_email_send_rate_limit' } }).message).toContain('hour');
  });

  it('tells someone a server-side signup failure is not their typing', () => {
    const outcome = describeSignUpOutcome({ error: { message: 'Database error saving new user' } });
    expect(outcome.tone).toBe('error');
    expect(outcome.message).toContain('Nothing you typed is wrong');
  });

  it('sends a duplicate address to sign-in when confirmations are off', () => {
    const outcome = describeSignUpOutcome({ error: { code: 'user_already_exists' } });
    expect(outcome.tone).toBe('notice');
    expect(outcome.message).toContain('Sign in instead');
  });

  it('passes an unrecognised failure through rather than swallowing it', () => {
    expect(describeSignUpOutcome({ error: { message: 'Network request failed' } })).toEqual({
      tone: 'error',
      message: 'Network request failed',
    });
  });
});

describe('where the confirmation link comes back to', () => {
  it('returns the origin the person registered from', () => {
    expect(signUpRedirectUrl('https://life-os-hs.vercel.app')).toBe('https://life-os-hs.vercel.app/');
  });

  it('does not double the trailing slash', () => {
    expect(signUpRedirectUrl('https://life-os-hs.vercel.app/')).toBe('https://life-os-hs.vercel.app/');
  });

  it('falls back to the project Site URL rather than sending something unusable', () => {
    expect(signUpRedirectUrl('')).toBeUndefined();
    expect(signUpRedirectUrl(null)).toBeUndefined();
    expect(signUpRedirectUrl('capacitor://localhost')).toBeUndefined();
  });
});
