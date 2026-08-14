# Setup and verification

Everything the four phases need, in the order it has to happen, with a way to
check each step actually worked.

Project ref: `snpgmoedtkstbcpbtpcc`

---

## Step 0: confirm the app points at this project

Worth thirty seconds, because everything else is wasted if it does not. There
are two Vercel projects wired to this repo (`life-os` and `suveda-pwa`), and
migrations run against the wrong database will look like they worked and change
nothing.

Open the deployed app, then in the browser console:

```js
// Should print https://snpgmoedtkstbcpbtpcc.supabase.co
console.log(
  [...document.scripts]
    .map(s => s.src).filter(Boolean).length && 'check the network tab instead'
);
```

Simpler: open the Network tab, do anything that loads data, and look at the
host the XHR requests go to. If it is not `snpgmoedtkstbcpbtpcc.supabase.co`,
fix `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the Vercel project
settings and redeploy before going further.

---

## Step 1: both accounts must exist first

**This has to happen before any migration runs**, for one specific reason:
`0001` seeds the original pair by looking them up in `auth.users` by email, and
`0009` then carries whoever it found into a shared space along with all the
existing content. If only one of you has signed in when `0001` runs, the other
ends up in a separate empty space and none of the history follows them.

New accounts created later need none of this. `0009` installs a trigger that
gives every signup a profile and a space automatically, and `0010` backfills
anyone who predates it. This step is about your two accounts specifically.

So: both of you open the app and sign in once. Then check what actually landed:

```sql
select id, email, created_at
from auth.users
order by created_at;
```

Expect two rows, with emails `huve14@gmail.com` and `suvedap@gmail.com`.

**If the emails do not match**, it is because the app's onboarding has a
name-only mode that invents an address like `huve@suveda.app`. In that case,
edit the seed block at the bottom of `0001_lifeos_members.sql` to whatever the
query above actually returned, before running it.

---

## Step 2: run the migrations

In the Supabase dashboard, **SQL Editor**, run these in order. Each is
idempotent, so re-running one is safe.

| File | What it does |
|---|---|
| `0001_lifeos_members.sql` | Allowlist and `is_member()`. Everything else depends on it. |
| `0002_lifeos_video_notes.sql` | Video journal tables, policies, `video-notes` bucket |
| `0004_lifeos_prompts.sql` | Prompt tables, reveal gate, `voice-notes` bucket |
| `0005_lifeos_prompt_seed.sql` | The 365 questions |
| `0006_lifeos_trips.sql` | Trip board tables |
| `0007_lifeos_trip_seed.sql` | The October trip |
| `0008_lifeos_devices.sql` | Push tokens, notification queue, triggers |
| `0009_lifeos_spaces.sql` | Replaces the allowlist with spaces. Rewrites every policy. |
| `0010_lifeos_pairing.sql` | Couple match codes, and the merge that pairing performs |

`0009` is the one to watch. It rewrites about 25 policies and then drops
`lifeos_members` and `is_member()`, so it is not re-runnable from a half
applied state. Check it completes without error before running `0010`. If you
have a Supabase branch database available, run both there first.

`0003_tighten_legacy_policies.sql` is **optional and deliberately separate**.
It closes a hole where any signed-in account can read the legacy `suveda_*`
rows, but it touches live data I could not inspect, so read its header and run
its checks first.

---

## Step 3: verify the migrations

Paste this whole block. Every line should come back as described.

```sql
-- One profile per account, and one space each.
select p.display_name, p.time_zone
from public.lifeos_profiles p
order by p.created_at;

-- Everyone is in exactly one space. Both of you should share the same id.
select m.space_id, p.display_name
from public.lifeos_space_members m
join public.lifeos_profiles p on p.user_id = m.user_id
order by m.space_id, p.display_name;

-- Counts must match: no account without a profile, none without a space.
select
  (select count(*) from auth.users) as users,
  (select count(*) from public.lifeos_profiles) as profiles,
  (select count(*) from public.lifeos_space_members) as memberships;

-- The allowlist is gone. Both of these should return nothing.
select 1 from pg_proc where proname = 'is_member';
select 1 from pg_tables where tablename = 'lifeos_members';

-- Nothing orphaned: every shared row belongs to a space.
select
  (select count(*) from public.lifeos_video_notes where space_id is null) as notes,
  (select count(*) from public.lifeos_prompt_answers where space_id is null) as answers,
  (select count(*) from public.lifeos_trips where space_id is null) as trips;

-- All nine tables exist with RLS switched on. Every row must say true.
select c.relname, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'lifeos_%'
order by c.relname;

-- Policies per table. lifeos_notifications is deliberately 0: RLS on with no
-- policy means default deny, and only the service role reads it.
select tablename, count(*) as policies
from pg_policies
where schemaname = 'public' and tablename like 'lifeos_%'
group by tablename order by tablename;

-- Both buckets private. public must be false on each.
select id, public, file_size_limit
from storage.buckets
where id in ('video-notes', 'voice-notes');

-- All 365 questions.
select count(*) as prompts from public.lifeos_prompts;

-- The October trip.
select title, origin, destination, start_date, end_date from public.lifeos_trips;

-- Realtime on the four tables that need it.
select tablename from pg_publication_tables
where pubname = 'supabase_realtime' and tablename like 'lifeos_%'
order by tablename;
-- expect lifeos_prompt_answers, lifeos_trip_items, lifeos_trips, lifeos_video_notes

-- The two notification triggers.
select t.tgname, c.relname
from pg_trigger t join pg_class c on c.oid = t.tgrelid
where t.tgname like 'lifeos%' order by t.tgname;
```

### Testing RLS properly

**The SQL editor runs as a superuser, so `auth.uid()` is null and RLS does not
apply.** Checking access by running a plain `select` there tells you nothing.
To test as one of you, impersonate inside a transaction:

```sql
begin;
  select set_config(
    'request.jwt.claims',
    json_build_object('sub', 'PASTE-A-USER-UUID', 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;

  select public.current_space_id();   -- expect a uuid
  select count(*) from public.lifeos_video_notes;
  select count(*) from public.lifeos_prompts;   -- expect 365
rollback;
```

**The test that matters most now.** Make a throwaway third account, then run
the same block with its uuid. It should get its own space id, and zero video
notes, zero answers and zero trips. If it can see any of yours, stop and tell
me: that is the multi-user model failing, and it is the whole point of `0009`.

### Testing the reveal gate

The most interesting property to verify. With one answer submitted for today:

```sql
begin;
  select set_config(
    'request.jwt.claims',
    json_build_object('sub', 'THE-PERSON-WHO-HAS-NOT-ANSWERED', 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;

  -- Expect 0. Their answer exists, but is not visible to someone who has not
  -- answered that day.
  select count(*) from public.lifeos_prompt_answers
  where prompt_date = (current_date at time zone 'Asia/Dubai')::date;
rollback;
```

Then the same query as the person who *has* answered: expect 1, their own.
Once both have answered, both see 2.

---

## Step 3b: check pairing end to end

Worth doing with two throwaway accounts before trusting it with real content,
because the merge is not reversible.

1. Sign in as throwaway A, go to **More > Pairing**, create a code.
2. Sign in as throwaway B, add something identifiable (a trip, a note).
3. Enter A's code as B. B should land in A's space.
4. Check B's content is now visible to A.

```sql
-- One space, two people.
select m.space_id, count(*) from public.lifeos_space_members m
group by m.space_id;

-- The code is spent and cannot be reused.
select code, redeemed_at, redeemed_by from public.lifeos_invites;
```

Then unpair from B and confirm B gets a fresh empty space while A keeps
everything. That asymmetry is deliberate and documented on the screen, but
see it once so it is not a surprise later.

## Step 4: close the front door

This one now depends on what you want.

**If the app stays private to the two of you**, go to **Authentication > Sign
In / Providers > Email** and turn off *Allow new users to sign up*.

**If you want other people to use it**, leave signups on. Every new account
gets its own empty space and can see nothing of yours. Before you do, satisfy
yourself of that with the throwaway account test in step 3, and settle the two
open items at the end of this document.

---

## Step 5: environment variables

On Vercel, for the project that actually serves the app:

| Variable | Scope | Value |
|---|---|---|
| `VITE_SUPABASE_URL` | build | `https://snpgmoedtkstbcpbtpcc.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | build | anon key |
| `VITE_LIVEKIT_URL` | build | `wss://<project>.livekit.cloud`, calls only |
| `LIVEKIT_API_KEY` | server | calls only |
| `LIVEKIT_API_SECRET` | server | calls only |
| `SUPABASE_URL` | server | same as above, used by the token endpoint |
| `SUPABASE_ANON_KEY` | server | same as above |

`VITE_` variables are baked in at build time, so changing one needs a redeploy,
not just a restart.

---

## Step 6: smoke test the app

In the browser first, on both accounts. This needs nothing native.

**Video journal** (More > Video)
- Record a clip. The stop button stays disabled until 15 seconds, hard stops at 120.
- Send it. It appears under Today with both clocks.
- On the other account it shows a "New" badge and a dot on the nav.
- Watch it to the end; the dot clears on that account only.
- Airplane mode, record, send. Shows "Waiting for a connection". Close the tab
  entirely, reopen still offline: still queued. Go back online: it uploads.

**Daily prompt** (More > Prompt)
- Answer as one account. You see yours and "Waiting on them", never theirs.
- With devtools open on that account, check the `lifeos_prompt_answers`
  response. Their row should not be in the payload at all, not merely hidden.
- Answer as the second account. Both appear on both screens within a second or
  two, without a refresh.

**Trip board** (More > Trip)
- The October trip shows with its date range and countdown.
- Add a flight with a cost and a booking reference. It appears instantly.
- On the other device it appears within a second.
- Offline, add and edit several items, restart, go back online: they send.

**Call** (More > Call)
- Without LiveKit configured it says so and names what is missing. That is the
  correct behaviour, not a failure.

---

## Step 7: push notifications, iOS only

Needs the app built on a Mac first. Full detail in `docs/IOS.md`.

1. Create an APNs key (`.p8`) in the Apple Developer portal.
2. Set the secrets:

```bash
supabase secrets set \
  APNS_KEY_ID=XXXXXXXXXX \
  APNS_TEAM_ID=YYYYYYYYYY \
  APNS_BUNDLE_ID=app.lifeos.suveda \
  APNS_PRODUCTION=false \
  --project-ref snpgmoedtkstbcpbtpcc

supabase secrets set APNS_PRIVATE_KEY="$(cat AuthKey_XXXXXXXXXX.p8)" \
  --project-ref snpgmoedtkstbcpbtpcc
```

3. Deploy and schedule:

```bash
supabase functions deploy notify --project-ref snpgmoedtkstbcpbtpcc
```

Enable `pg_cron` and `pg_net` under **Database > Extensions**, then schedule it
as shown in `docs/IOS.md`.

`APNS_PRODUCTION` is `false` for builds run from Xcode and `true` for
TestFlight. Getting it wrong is the most common reason push silently never
arrives, and it fails with a misleading `BadDeviceToken`.

### Verifying push

```sql
-- After opening the app on a device and allowing notifications.
select platform, created_at from public.lifeos_devices;

-- After one of you records a video note.
select title, body, sent_at, attempts, last_error
from public.lifeos_notifications
order by created_at desc limit 10;
```

`sent_at` filled in means it reached Apple. `last_error` tells you what went
wrong if not.

---

## Step 8: calls

Needs a LiveKit Cloud project. See `docs/CALLS.md`, which also explains why the
transport strip on the call screen is the thing to read, and why only "Relayed
over TLS on port 443" counts.

---

## Quick reference: what breaks if you skip a step

| Skipped | Symptom |
|---|---|
| Both accounts signing in before `0001` | One or both see "This account is not on the list" |
| `0001` before both have signed in | The other person lands in an empty space with none of the shared history |
| `0005` | Prompt screen shows "Question unavailable offline" |
| `0007` | Trip board says "No trip yet" |
| `0008` | Everything works, no notifications |
| `0009` | Every shared screen fails; the old policies reference a dropped function |
| `0010` | Pairing screen loads but creating or entering a code errors |
| Wrong Supabase project | Migrations appear to work, app sees none of it |
