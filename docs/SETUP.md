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

**This has to happen before any migration runs.** `0001` seeds the allowlist by
looking up accounts in `auth.users`. If only one of you has ever signed in,
only one member gets seeded, and the other person is locked out of every
shared surface. The notification trigger also looks for "the other member" and
quietly does nothing when there is only one.

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

`0003_tighten_legacy_policies.sql` is **optional and deliberately separate**.
It closes a hole where any signed-in account can read the legacy `suveda_*`
rows, but it touches live data I could not inspect, so read its header and run
its checks first.

---

## Step 3: verify the migrations

Paste this whole block. Every line should come back as described.

```sql
-- Two members, one per timezone.
select display_name, time_zone from public.lifeos_members;
-- expect 2 rows: Africa/Johannesburg and Asia/Dubai

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

  select public.is_member();          -- expect true
  select count(*) from public.lifeos_video_notes;
  select count(*) from public.lifeos_prompts;   -- expect 365
rollback;
```

Then try it with a uuid that is not on the allowlist. `is_member()` should be
false and every count should be zero. That is the guarantee the whole design
rests on, so it is worth seeing it fail for a stranger.

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

## Step 4: close the front door

**Authentication > Sign In / Providers > Email**, turn off *Allow new users to
sign up*.

Both accounts exist by now, and the `lifeos_*` tables are gated on the
allowlist regardless, but an open signup form on a private app is not worth
keeping.

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
| `0001` | Every shared screen says not on the list |
| `0005` | Prompt screen shows "Question unavailable offline" |
| `0007` | Trip board says "No trip yet" |
| `0008` | Everything works, no notifications |
| Wrong Supabase project | Migrations appear to work, app sees none of it |
