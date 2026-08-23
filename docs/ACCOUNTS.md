# Letting someone new register

Nothing in the app decides who may have an account. There is no allow list, no
invite gate, no email check beyond "does it look like an address". `signUp` in
`src/supabase.ts` passes straight through to Supabase Auth.

So when someone cannot register, the cause is one of four settings in the
Supabase dashboard, and each one fails in its own way. This is the order worth
checking them in.

## 1. Are signups allowed at all?

**Authentication → Sign In / Providers → Email → _Allow new users to sign up_.**

[SETUP.md](SETUP.md) step 4 recommends turning this **off** once the app is
private to two people, so on an established project this is the most likely
answer. With it off, Supabase rejects every registration with

```
Signups not allowed for this instance
```

The form now says so in plain words — *New accounts are switched off for this
app right now* — rather than showing the raw message, because it is the one
failure the person registering cannot do anything about.

Turn it back on to let someone register, and turn it off again afterwards if
you want the door shut behind them.

## 2. Will the confirmation email actually arrive?

If **Confirm email** is on, an account is not usable until the person clicks a
link. That link has to reach them.

Supabase's built-in email sender is a convenience for development, not a
delivery service: it is rate limited to a handful of messages per hour, and
delivery to addresses outside the project's own team is restricted. Check
**Authentication → Emails** for the current limit on this project before
assuming a missing email means a broken signup — nothing in the app can tell
the difference between "not sent" and "sent and ignored".

Two ways through:

- **Configure custom SMTP** (Resend, Postmark, SES) under
  **Authentication → Emails → SMTP Settings**. This is the real fix and the
  only one that scales past one or two people.
- **Turn *Confirm email* off** for as long as it takes them to register. Then
  the account works immediately and the form says *You are in*. Turn it back
  on afterwards: with it off, anyone can register under an address they do not
  own.

## 3. Does the confirmation link come back to the right place?

`signUp` now sends `emailRedirectTo` set to the origin the person actually
registered from, so the link returns them to the app they were just using
rather than to whatever **Site URL** happens to be.

Supabase ignores a redirect that is not on the allow list and quietly falls
back to the Site URL, so both still need to be right:

- **Authentication → URL Configuration → Site URL** — the production origin.
- **Redirect URLs** — add any other origin people register from (a preview
  deployment, `http://localhost:5173` while developing).

## 4. Can they use the couple space once they are in?

Registering is only half of "the full experience". The shared space needs the
migration in
`supabase/migrations/20260822000000_couple_closeness.sql` to have been applied,
because it carries the `grant execute` fix described in
[CLOSENESS.md](CLOSENESS.md#the-migration). Without it every `lifeos_couple_*`
policy raises

```
permission denied for function lifeos_is_couple_member
```

which takes down the whole couple space for both people, not just the new
tables. A newly registered partner would pair successfully and then find the
space broken.

## Pairing, once the account exists

One person opens **Us → Create pairing link** and sends the code; the other
enters it on the same screen. Until then a new account has its own empty
space and can see nothing of anyone else's.

## The Gmail dot trap

Gmail ignores dots in the local part, so `name@gmail.com` and `na.me@gmail.com`
land in the same inbox. **Postgres and Supabase Auth do not** — they are two
different accounts, and `20260814163629_private_user_accounts` matches the
original member by exact string.

The failure this produces is quiet and confusing: registering the dotted form
of an address that already exists creates a *second, empty* account, and its
confirmation email arrives in the same inbox as the first one's did. Everything
looks like it worked, and none of the existing data is there.

Before registering someone, check which form already exists:

```sql
select id, email, created_at, last_sign_in_at
from auth.users
where regexp_replace(split_part(lower(email), '@', 1), '\.', '', 'g')
      = 'thelocalpart'
order by created_at;
```

If a row comes back, they have an account already — reset its password rather
than registering a new one.

## Checking it worked

```sql
select id, email, created_at, confirmed_at
from auth.users
order by created_at desc
limit 5;

-- Every account should have exactly one profile and one state row.
select u.email, p.display_name, p.handle, s.updated_at
from auth.users u
left join public.lifeos_profiles p on p.user_id = u.id
left join public.lifeos_user_state s on s.user_id = u.id
order by u.created_at desc
limit 5;
```

A row in `auth.users` with no matching profile means the signup trigger failed
after the account was created. `20260820000000_resilient_signup_provisioning`
makes the optional parts of that trigger non-fatal, so this should not happen —
but if it does, the profile row can be created by hand and the account will
work.
