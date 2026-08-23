# Closeness without a call

Live audio and video calling is hidden for UAE compliance (see
[CALLS.md](CALLS.md)). That removes the one channel in the app that carried an
unplanned *I'm thinking of you*: everything left in the couple space — notes,
the daily question, the adventure jar — asks you to compose something first.

These four surfaces are what fills that gap. Three of them are new; one was
data the app already had and never showed.

| Surface | Where | Needs the migration |
|---|---|---|
| Thoughts | Above the tabs in the couple space | Yes |
| Dates that matter | A fourth tab, plus a pin in the header and a line on Home | Yes |
| Their local time | The couple space header | No |
| Pulse rhythm | The Today tab | No |

All of the rules live in `src/lifeos/closeness.ts` as pure functions, so the
screen stays a renderer and every edge case is tested in
`src/lifeos/closeness.test.ts` without a database.

## Thoughts

Six gestures — thinking of you, a hug, you made me smile, proud of you, good
morning, goodnight — each one tap, each landing as a push notification on the
other phone.

The vocabulary is closed on purpose. The entire value of a thought is that it
costs one tap; a free-text box would just be a slower note, and the app already
has notes. Two of the six are greetings, because a shared morning is the first
thing a couple loses to a time difference.

The gesture offered first follows the hour where *they* are, not where you are.
Sending "goodnight" while they are at breakfast is the small wrongness that
makes software feel inattentive.

**Rate limited in the database.** `lifeos_throttle_couple_thought` refuses a
second thought from the same person inside thirty seconds. The client also
shows a countdown, but that is only there to make the wait legible — a disabled
button is not a rate limit, and a second device would not have one at all.

**The notification body is composed server-side** from the gesture alone, in
`lifeos_queue_couple_thought`. Nothing anyone typed is ever placed in a push,
which is the same rule the prompt-answer trigger follows: a notification body
is visible on a locked screen.

Marking a thought seen is the recipient's write and only theirs. The RLS policy
refuses `update` from the sender, so "seen" means what it says.

## Dates that matter

One table for four kinds of countdown: a reunion, an anniversary, a birthday,
a milestone. Anniversaries and birthdays repeat annually; the stored date stays
the true original, so "7 years today" is counted rather than typed.

The **soonest reunion still ahead** is pinned in the couple space header and
echoed on the Home "Us, right now" card, which is the space the call buttons
used to occupy. A reunion that has just passed stays pinned for a week — *you
made it* should not vanish overnight — and then makes way.

Either partner may edit or remove any date. A wrong flight date entered by one
person is exactly what the other needs to be able to fix, so these are shared
facts rather than authored posts, and the RLS policy says so.

Two edge cases worth knowing, both tested: a 29 February anniversary lands on
the 28th in a common year rather than rolling into March, and a repeating date
falling on today counts as ahead, not behind.

## Their local time

Every couple member has carried a `time_zone` since pairing shipped, and it was
never rendered anywhere. The header now shows the partner's clock and whether
they are inside quiet hours (before 07:00 or from 22:00, matching the Home
connection window).

The couple space is where you decide whether to send something. Knowing it is
04:00 where they are is the difference between a nice surprise and waking them.

## Pulse rhythm

`loadSharedData` used to fetch only today's check-ins, so the relationship had
no memory. It now fetches a fortnight in the same query — today's pair is just
the last entry — and the Today tab draws it as a strip: your half on top,
theirs below, gaps left as gaps.

The run counter stops at the most recent *completed* day rather than today, so
it does not drop to zero every morning before either of you has opened the app.
The summary line is never a reprimand; an empty fortnight reads "your first
shared day is one tap away".

## The migration

`supabase/migrations/20260822000000_couple_closeness.sql` adds
`lifeos_couple_thoughts` and `lifeos_couple_dates`, their policies, the
throttle and notification triggers, and the realtime publication entries.

**It also fixes a pre-existing bug.** Every `lifeos_couple_*` policy is
`using (private.lifeos_is_couple_member(...))`, and Postgres evaluates a policy
expression as the role running the query. `20260814215702_secure_couple_spaces`
revoked `execute` on that helper from `authenticated`, so the policies raised

```
permission denied for function lifeos_is_couple_member
```

instead of returning false — taking down the whole couple space, not just the
new tables. `scripts/verify-migration-chain.sh` reproduces it against a real
cluster and now asserts the fix. `SECURITY DEFINER` is what makes the lookup
safe; keeping the function in `private` is what keeps it off the Data API,
since PostgREST serves only the schemas it is configured with.

Until the migration runs, `isMissingRelation` in `src/lifeos/couples.ts` treats
the two new tables as empty rather than an error, so the rest of the couple
space keeps working. Every other database error still surfaces — a permission
problem must never look like an empty list.

### Verifying

```bash
scripts/verify-migration-chain.sh      # needs initdb/pg_ctl on PATH
npm test                               # the pure rules, no database
```

Every statement in it is guarded, so pasting it into the SQL editor twice is
harmless — verified against a real cluster, including re-applying inside a
single transaction, with the policy count unchanged at four per table.

The chain script applies every migration to a throwaway cluster and then
asserts the security contract: a partner can read and correct a shared date, a
recipient can mark a thought seen, a sender cannot, an outsider sees neither
table, the throttle rejects a second thought inside the cooldown, and sending
one queues a push for the partner and not for yourself.
