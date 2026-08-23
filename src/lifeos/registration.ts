// registration.ts — what to tell someone after they tap "Create account".
//
// Supabase reports every one of these outcomes through the same
// { data, error } shape, and both auth screens used to render all of them in
// the red error box — including the successful ones. Someone registering for
// the first time was told, in red, that their account had been created.

export type SignUpTone = 'error' | 'notice' | 'success';

export type SignUpOutcome = {
  tone: SignUpTone;
  message: string;
};

type SignUpResult = {
  data?: {
    session?: unknown | null;
    user?: { identities?: unknown[] | null } | null;
  } | null;
  error?: { message?: string; code?: string; status?: number } | null;
};

function matches(error: { message?: string; code?: string }, code: string, ...phrases: string[]): boolean {
  if (String(error.code ?? '') === code) return true;
  const message = String(error.message ?? '').toLowerCase();
  return phrases.some((phrase) => message.includes(phrase));
}

/**
 * The confirmation link should come back to wherever the person registered,
 * rather than to whatever the project's Site URL happens to be set to. Supabase
 * ignores a redirect that is not on the project's allow list and falls back to
 * the Site URL, so this can only ever improve on the default.
 */
export function signUpRedirectUrl(origin?: string | null): string | undefined {
  const value = (origin ?? '').trim();
  if (!value || !/^https?:\/\//i.test(value)) return undefined;
  return value.replace(/\/+$/, '') + '/';
}

/**
 * A registration that needs email confirmation and one for an address that is
 * already registered are deliberately indistinguishable: Supabase returns the
 * same empty-identities success for both so that a stranger cannot use the form
 * to discover who has an account. One message has to be true of both, and this
 * is it — it points a new person at their inbox and an existing one at sign-in.
 */
export function describeSignUpOutcome(result: SignUpResult, email = ''): SignUpOutcome {
  const error = result?.error;
  if (error) {
    if (matches(error, 'signup_disabled', 'signups not allowed', 'signup is disabled')) {
      return {
        tone: 'error',
        message: 'New accounts are switched off for this app right now. Ask whoever runs it to turn signups back on.',
      };
    }
    if (matches(error, 'over_email_send_rate_limit', 'email rate limit', 'rate limit exceeded')) {
      return {
        tone: 'error',
        message: 'Too many confirmation emails have gone out recently. Give it an hour and try again.',
      };
    }
    if (matches(error, 'email_address_invalid', 'invalid email', 'unable to validate email')) {
      return { tone: 'error', message: 'That email address was not accepted. Check it for a typo.' };
    }
    if (matches(error, 'weak_password', 'password should be', 'password is too short')) {
      return { tone: 'error', message: 'Choose a longer password — at least six characters.' };
    }
    if (matches(error, 'user_already_exists', 'already registered', 'already been registered')) {
      return { tone: 'notice', message: 'That email already has an account. Sign in instead.' };
    }
    // The signup trigger raising anything at all surfaces as this. It is a
    // server-side fault, so say so rather than sending someone back to retype
    // a form that was never the problem.
    if (matches(error, 'unexpected_failure', 'database error saving new user')) {
      return {
        tone: 'error',
        message: 'The account could not be finished on the server. Nothing you typed is wrong — try again, and if it keeps happening the app owner needs to look at the signup trigger.',
      };
    }
    return { tone: 'error', message: error.message || 'Something went wrong. Try again.' };
  }

  if (result?.data?.session) {
    return { tone: 'success', message: 'You are in. Setting up your space…' };
  }

  const where = email.trim() ? `Check ${email.trim()}` : 'Check your email';
  return {
    tone: 'notice',
    message: `${where} for a confirmation link, then sign in. If this address already has an account, sign in instead.`,
  };
}
