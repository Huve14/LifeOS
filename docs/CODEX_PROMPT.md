# Codex prompt: SA-expat one-stop shop + real Abu Dhabi pricing

## Mission

`/home/user/LifeOS` is a React + Supabase + Capacitor app built for one person's move from
South Africa to Al Khalifa City, Abu Dhabi. Suveda has arrived, so the premise has expired.
The app must now serve **every South African in Abu Dhabi**: open registration, name
auto-populated, and a price/settling-in reference they keep coming back to.

Codex executes this document. It does not redesign it.

---

## Ground rules

1. **Branch.** Work on `claude/sa-app-redesign-codex-bj3upi`. It is **level with
   `origin/main` (0 ahead, 0 behind)**. Do not rebase, do not `checkout -B`, do not reset.
   Any instruction you have seen elsewhere about this branch being "3 behind" is stale.
2. **Baselines are green today.** `npm run typecheck` passes. `npm run lint` passes.
   `npx vitest run` → **286 passed / 28 files**. That is the number to protect, not 218/17.
   Do not delete a test to go green.
3. **Keys are server-side.** `VITE_`-prefixed variables are compiled into the browser bundle
   and are public. Retailer API credentials live in Edge Function secrets only.
4. **No scraping** of Carrefour, Noon, Lulu, Talabat or Sharaf DG — client or server. A source
   without a licensed API is community-sourced or absent.
5. **Do not touch:** `call.jsx`, `games.jsx`, `src/lifeos/{outbox,sync,lock,ice,net}.ts`,
   any existing migration file.
6. Prefer **deleting dead code** to editing it. Several items below are satisfied by a single
   deletion; check the dead-code map before writing a patch.

---

## What changed against the previous plan

The earlier audit was written against an older tree and against `origin/main` as it stood
before the merge. Nine of its claims are wrong or expensive in the wrong place. Corrections
are inline below and summarised here so you do not re-litigate them:

| Previous claim | Reality on HEAD today |
|---|---|
| Branch is 3 behind; rebase first | Branch **equals** `origin/main`. Nothing to rebase. |
| 218 tests / 17 files | **286 tests / 28 files** |
| Lint/typecheck are broken | Both **pass**; they simply do not *cover* the `.jsx` |
| "Strip 9 SABIS refs from Budget" | 14 of 18 sit in **dead code**. Delete one function. |
| "Delete `const FX = 4.5` + 3 literals" | **All four** are in that same dead function. |
| "Add an employer-benefits field" | Already exists: `BudgetCategory.coveredByEmployer` |
| "Reuse `src/budget/currency.ts`" | `src/budget/` is **orphaned** — only tests import it |
| "Shopping is priced in ZAR" | Prices are already AED-scale; the **label** is wrong |
| "Nav 18 → 5 at `app.jsx:858-875`" | That is the debug panel. Nav is **already 5 + More**. |

One issue the previous audit missed entirely is now item **B3** below.

---

## Audit (re-verified on HEAD, `file:line` exact)

### The dead-code map — read this before Phase 0

`screens-modules.jsx` contains `LegacyBudgetScreen`, **lines 877–1399 (523 lines)**. Its only
occurrence anywhere in the repo is its own definition at `screens-modules.jsx:877`; there is
no call site and it is not attached to `window`. Inside those 523 lines:

- **14 of the 18 `SABIS` references** in the file (`:1105, 1218, 1220, 1231, 1287, 1293, 1298,
  1302, 1308, 1312, 1316, 1328, 1331, 1335`), including `const isSABIS = ['visa','deposit']
  .includes(c.id)` and the "Covered by SABIS" badge.
- **All four hardcoded FX literals**: `:896` `const FX = 4.5`, then `:1105`, `:1165`, `:1252`
  (plus `0.27` for USD at `:1252`).
- The `|| 8800` income default at `:881`.

**Deleting `LegacyBudgetScreen` closes most of A1 and all of A2.** Do that first; then audit
what actually remains.

### A — Live single-user assumptions (user-visible to strangers)

**A1. `SABIS`, a real employer, appears in live UI.** After the dead function goes, four
sites remain:
- `screens-modules.jsx:1679` — the badge string `'SABIS'` rendered when
  `category.coveredByEmployer` is true.
- `screens-modules.jsx:1952` — Housing subtitle `"SABIS provides housing — make it yours"`.
- `screens-modules.jsx:1961` — `"Housing covered by SABIS"` card.
- `src/budget/store.ts:51` — seed income row `'SABIS Salary', amount: 8800`.
- `screens-map.jsx:319` — clinic tip `"SABIS health insurance covers visits"`.

**The abstraction you need is already built.** `src/lifeos/budget.ts` defines
`BudgetCategory.coveredByEmployer: boolean`, it is typed, it is covered by
`src/lifeos/budget.test.ts`, and it is already inside the typecheck and lint scope. The live
`BudgetScreen` (`screens-modules.jsx:1400+`) reads it at `:1433`, `:1576`, `:1624`, `:1678`,
`:1679`. Do **not** design a new field. Add `employerName?: string` to the profile and render
that where `'SABIS'` is currently a literal; fall back to `"your employer"`.

**A2. Hardcoded FX.** Entirely inside the dead function. No live code converts currency.

**A3. Fake-email auth cannot support multiple users.** `auth.jsx:22-23` builds
`` `${name.toLowerCase().replace(/\s+/g,'.')}@lifeos.local` `` with fallback name `'Member'`
(`:21`). Two people named Priya collide onto one account. `.local` is a reserved mDNS TLD: it
can never receive mail, so verification and password reset are impossible and Supabase may
reject it. The screen already has a working email mode (`mode === 'email'`, `:117-140`) — the
fix is to delete the `name` mode's auto-email path, keep name as a *profile* field passed to
`signUp`, and require a real address.

Server side is already done: `lifeos_handle_new_user()` writes `lifeos_profiles.display_name`
from `raw_user_meta_data ->> 'name'`. The client only has to send it.

**B3 (new — not in the previous audit). A personal email is hardcoded as a UI gate.**
`screens-home.jsx:1496`:
```js
const hasPrivateNote = userEmail.trim().toLowerCase() === 'suvedap@gmail.com';
```
This is the same class of defect as A1 and arguably worse, because it embeds a private
individual's address in a bundle shipped to every registrant. Remove the constant; if the
feature is worth keeping, gate it on a profile flag.

**A4. The AI never learns where the user is.** `data.jsx:192` reads
`window.__suvedaDestination`. Nothing in `app.jsx`, `screens-home.jsx` or
`src/legacy-entry.ts` ever writes it — `src/legacy-entry.ts:55-118` declares every other
`__suveda*` global and not this one. Either write it at bootstrap or drop the read.

**A5. Two-person assumption in the client.** `src/lifeos/spaces.ts:76`
`partner: all.find(p => p.user_id !== me)` is an arbitrary pick from the member list; `:77`
`paired: members.length > 1`; `displayNameFor()` returns the literal `'Them'` for anyone who
is neither `me` nor `partner`. Any community read policy exposes more than two profiles and
this silently mislabels people. **Fix before the community layer ships**, not after:
`partner` → `members: Profile[]`, and `displayNameFor` → a real lookup across all members.

### B — Coverage and correctness

**B1. Lint and typecheck do not see the screens — and widening them is cheap.**
`eslint.config.js:11` matches only `files: ['**/*.{ts,tsx}']`, and `package.json` runs
`eslint src/`. `tsconfig.app.json` has `include: ["src"]` and
`exclude: [..., "src/budget", "tests"]`. So every root `.jsx` (14,284 lines across 19 files)
plus `src/components/ui/*.jsx` and `src/budget/` is invisible to CI.

**Measured, not estimated.** Running `js.configs.recommended` over `*.jsx` +
`src/components/ui/*.jsx` produces **470 problems**, of which:

| Rule | Count | Nature |
|---|---:|---|
| `no-undef` | 440 | **False positives.** Cross-file globals, by design. |
| `no-unused-vars` | 23 | Real, cosmetic |
| `no-empty` | 4 | Real, cosmetic (empty `catch {}`) |
| `react-hooks/exhaustive-deps` | 3 | "rule not found" — plugin not extended for `.jsx` |

The 440 resolve to **exactly 37 distinct names**, all deliberately attached to `window` by the
legacy loader (`src/legacy-entry.ts:200-222` imports each `.jsx` for side effects only):

```
AnimatedIcon AskHuveSheet Badge Button Card Checkbox Confetti Dashboard EmptyState
MapControls MapLibreMap MapMarker MemoryPhotoGrid Modal ModulePage NotesJournalScreen
Onboarding Pill PrivateMemoryPhotoGrid PrivatePhoto ProgressBar React SEED SectionHeader
Sheet SpinningGlobe TweakColor TweakRadio TweakSection TweakToggle TweaksPanel
applyProgress askHuve daysUntil moduleProgress uid useTweaks
```

So Phase 0 is **a 37-entry `languageOptions.globals` block**, not a refactor. Declaring them
turns 470 problems into ~30 cosmetic ones and leaves `no-undef` doing useful work on typos.
**Do not convert the `.jsx` files to ES modules to satisfy the linter.**

Typecheck is equally cheap: un-excluding `src/budget` yields **4 errors, all in
`src/budget/store.ts:1-8`**, all `TS2591` for Node builtins (`fs`, `fs/promises`, `path`,
`process`). Add `"node"` to `types`, or move that one file to `tsconfig.node.json`.

**Do not add `allowJs`/`checkJs` for the root `.jsx`.** They are untyped, they rely on 37
ambient globals, and there is no incremental path — it converts a half-day into a multi-day
churn with no bug-finding payoff, because ESLint already covers this tier.

`.github/workflows/ci.yml` already runs `typecheck`, `lint`, `test` and `build` on every PR,
so widening the configs is the whole of the CI work.

**B2. `src/budget/` is an orphan library, not a fix waiting to be applied.**
`computed.ts currency.ts errors.ts forecasting.ts index.ts mutations.ts nudges.ts
reporting.ts store.ts types.ts` — 10 modules. The only importers anywhere are
`tests/{computed,mutations,nudges,store}.test.ts`. **No application code imports it.** The
live Budget screen instead uses `src/lifeos/budget.ts` via `src/lifeos/index.ts:9`, and
formats money with a local helper at `screens-modules.jsx:1426`:
```js
const money = value => `${Math.round(Number(value) || 0).toLocaleString()} AED`;
```
So "reuse `src/budget/currency.ts` instead of the hardcoded rate" is not a swap — it means
wiring an unwired 10-module library into a live screen. **Decide before you build** (see
Phase 1, step 5). Recommendation: implement the AED⇄ZAR display on `src/lifeos/budget.ts`,
which is already wired, typed and tested, and treat `src/budget/` as a separate adopt-or-
delete call. Do not leave it orphaned *and* excluded from typecheck.

**B4. Shopping's real bugs** (`screens-modules.jsx:1728-1890`):
- `:1755` `parseInt(newPrice)` — "12.99" becomes 12. Money parsed as an integer.
- `:1754` `[...s.shopping, …]` and `:1763` `s.shopping.filter(…)` have **no `|| []` guard**,
  while `toggle` at `:1744` does. Undefined → crash.
- Add-form default `newCat` is `'Essentials'` (`:1734`) against a hardcoded set
  `['Essentials','Kitchen','Tech','Furniture','Decor']`, while the seed uses
  `Tech / Clothing / Apartment` (`data.jsx:91-99`). Only `Tech` overlaps, so the filter pills
  built at `:1738` from `new Set(items.map(s => s.cat))` fragment into near-duplicates.
- `status: 'packed'` is reused to mean "bought" (`:1744`) — packing semantics leaking in.

**B5. The ZAR label is a display bug, not a conversion bug.** `screens-modules.jsx:1786`
renders `~${total} ZAR` and `:1827` renders `{item.price} ZAR`, but the seed prices in
`data.jsx:91-99` are `60, 480, 90, 110, 75` — AED-scale, not ZAR-scale (60 ZAR for plug
adapters is not a real price; 60 AED is). **Change the two labels to AED.** Do not write a
conversion, and do not multiply the seed values.

**B6. Zero screen tests.** All 286 tests cover `src/lifeos/*` and `tests/*` store logic; not
one renders a screen. With B1 unfixed, the 14k lines of `.jsx` have no safety net at all.

### C — Cheap cleanups

**C1.** `CountdownHero` is orphaned. Defined at `screens-home.jsx:471`, exported to `window`
at `:2002`, and **there is no `<CountdownHero` call site anywhere**. Delete both lines.

**C2.** Duplicate map location, and the two copies disagree. `screens-map.jsx:178`
`id: 'lulu-hypermarket'`, `category: 'essential'`, `lng 54.3986 / lat 24.1559`; and
`screens-map.jsx:264` `id: 'lulu-khalifa'`, `category: 'neighbourhood'`,
`lng 54.4298 / lat 24.1638`. Same store, ~2 km apart. Verify which coordinate is right, keep
one record, drop the other.

**C3.** Nav does **not** need rebuilding. `BottomNav` (`app.jsx:1538`) already renders
`NAV_CATALOG[0]` plus `prepared.quickNav` as primary tabs and everything else behind a More
sheet, driven by `src/lifeos/preferences.ts` (`app.jsx:1548-1556`). The 18-item list the
previous plan pointed at (`app.jsx:858-875`) is the **tweaks debug panel's "Jump to" grid**,
not navigation. To ship `Home · Map · Community · Shop & Save · Me`, edit `NAV_CATALOG`
(`app.jsx:1422-1441`), `QUICK_NAV_OPTIONS` (`:1443`) and the `quickNav` default in
`src/lifeos/preferences.ts`. That is a data edit, not a shell rewrite.

**C4.** `pickStoredState()` (`app.jsx:19-27`) returns `null` — resetting the user to seed —
if any of `packing, documents, tasks, budget, shopping, housing` is missing. **Any commit
that removes a seed key must update this guard in the same commit** or existing accounts get
wiped on next load.

---

## Phases

Phases are gates. Do not start N+1 until N is committed and CI is green.

### Phase 0 — Make CI see the code, then clear what it finds *(target: half a day)*

1. `eslint.config.js`: add a second config block for `files: ['**/*.jsx']` extending
   `js.configs.recommended` + `reactHooks.configs.flat.recommended`, with
   `languageOptions.globals` = `globals.browser` **plus the 37 names listed in B1** set to
   `'readonly'` (`React` included). Keep the existing `.{ts,tsx}` block untouched.
2. `package.json`: `"lint": "eslint ."`. Add `dist`, `ios`, `node_modules` to
   `globalIgnores`.
3. `tsconfig.app.json`: drop `"src/budget"` from `exclude`. Fix the resulting 4 `TS2591`
   errors by scoping Node types to `src/budget/store.ts` — do not add `"node"` globally to a
   browser bundle's `types`.
4. Fix the ~30 real lint findings. They are unused vars, four empty `catch {}` blocks, and
   three `exhaustive-deps` warnings that only appear once the react-hooks plugin extends to
   `.jsx`. Suppress nothing without a comment saying why.
5. **Delete `LegacyBudgetScreen`, `screens-modules.jsx:877-1399`.** Confirm zero references
   first (`grep -rn LegacyBudgetScreen .`). This is the single highest-value commit in the
   phase.
6. C1 (delete `CountdownHero` + its `window` export) and C2 (de-dupe Lulu).

**Gate:** `npm run lint`, `npm run typecheck`, `npx vitest run` (≥286) and `npm run build`
all pass, with `.jsx` and `src/budget` inside lint/type scope.

### Phase 1 — Identity: real accounts, no personal data in the bundle

1. `auth.jsx` — one email+password form. Remove the `mode === 'name'` auto-email branch
   (`:19-33`) and the mode toggle (`:196-214`); keep name as a required field passed through
   to `signUp` so `lifeos_handle_new_user()` populates `display_name`. One component, so the
   duplicate cannot come back.
2. `screens-home.jsx:1496` — delete the hardcoded `suvedap@gmail.com` gate (B3).
3. A1 — replace the four live `'SABIS'` strings with a profile `employerName`, defaulting to
   `"your employer"`; reword `screens-map.jsx:319` to not assert a specific insurer.
4. `data.jsx:83` `monthlyIncome: 8800` → `0`, prompting on first run.
   `src/budget/store.ts:51` seed → generic. **Apply C4 in the same commit.**
5. `src/lifeos/spaces.ts` — A5: `partner` → `members: Profile[]`, `paired` derived from it,
   `displayNameFor` resolving across all members. Extend `src/lifeos/*.test.ts` to cover a
   three-member space; this is the regression that the community layer depends on.
6. Decide `src/budget/` (B2) and record the decision in this file. Recommended: build ZAR
   display on `src/lifeos/budget.ts`; adopt or delete `src/budget/` explicitly.

**Gate:** two accounts with different emails and the **same first name** both register, both
see their own name, neither sees the other's data. `grep -rn "SABIS\|suvedap@" .` returns
nothing outside `supabase/migrations/`.

### Phase 2 — Schema

`supabase/migrations/0013_prices.sql` and `0014_community.sql`, both append-only. Never edit
an applied migration.

The private half of the model **already shipped**: `20260814163629_private_user_accounts.sql`
creates `lifeos_user_state` (per-`user_id` payload) and `lifeos_chat_messages`, both
owner-scoped under RLS. Build only the community half on top of it.

New tables: `lifeos_products`, `lifeos_stores`, `lifeos_price_points`,
`lifeos_price_watches`, `lifeos_deals`. RLS: read for any authenticated member; insert own
price points only; `lifeos_price_watches` private to its owner.

`0009_lifeos_spaces.sql`'s own header calls adding signups without correct policies "a
privacy breach, not a rough edge". **Policies land and are tested before any screen reads
them, and A5 lands before either.**

### Phase 3 — Shell

C3: `Home · Map · Community · Shop & Save · Me` via `NAV_CATALOG` + `preferences.ts`
defaults. Retire the pre-move modules (packing, trip, countdown) from the catalog rather than
deleting their screens in the same commit — smaller blast radius, and C4 applies.

### Phase 4 — Pricing pipeline

```
pg_cron ─► supabase/functions/prices/  (server-side only)
             ├── Amazon PA-API 5.0 (amazon.ae)   [Tier 1, licensed]
             ├── Open Food Facts + Open Prices   [Tier 2, free/no key]
             └── frankfurter.app → ZAR/AED rate  [Tier 0, feeds the app]
                        │  normalise
                        ▼
             lifeos_price_points (product, store, price_aed, source, seen_at, confidence)
                        │
   client ──────────────┘  reads Supabase only. Never calls a retailer directly.
```

Four tiers, ordered by trustworthiness:

- **Tier 1 — licensed API.** Amazon Product Advertising API 5.0 officially serves
  `amazon.ae`: live price, image, discount fields, under an Associates UAE account. It is the
  only major UAE retailer with a legitimate programmatic feed. **Build the pipeline
  source-agnostic** so this tier can be added later without a rewrite — the user must create
  the Associates account, and Tiers 2–4 make the feature work without it.
- **Tier 2 — open data.** Open Food Facts for product identity/barcodes; Open Prices
  (`prices.openfoodfacts.org`) for crowdsourced real prices with store and date.
- **Tier 3 — community prices.** Members log what they paid, where, when. *"Woolworths
  biltong, Spinneys Khalifa City — AED 34, seen 2 days ago by Thabo."* Zero legal risk,
  improves with every user, and nobody else has this data. Optional shelf-tag photo as proof.
- **Tier 4 — AI estimate.** The existing Huve/NVIDIA proxy (`data.jsx`, `api/deepseek.js`)
  returns a price *band* when nothing else has data, rendered in a visibly different style and
  labelled "estimate". Never mixed with real prices.

Every price renders **source + age**: "Amazon.ae · 2 h ago" / "Thabo · 3 days ago" /
"estimate". A stale price shown as current is worse than no price.

The existing workbox `NetworkFirst` rule for Supabase (`vite.config.ts:74-82`) gives offline
price browsing for free — no extra caching work.

**Shop & Save** replaces Shopping, in AED with a ZAR toggle:
1. **My list** — the existing list with B4 and B5 fixed (decimal prices, `|| []` guards,
   one category set, `bought` instead of `packed`, AED labels), each row showing the best
   known price and where.
2. **Price check** — search or scan a barcode; every known price, cheapest first, with
   "you'd save AED X vs the priciest".
3. **Deals this week** — Tier 1 discounts + community-flagged specials.
4. **Price watch** — set a target, get pushed on a drop.
5. **Log a price** — the Tier 3 flow, two taps from any list row.
6. **SA basket** — biltong, rooibos, Mrs Ball's, boerewors spice: who stocks them, at what
   price. The retention hook.

---

## Automations

Notification plumbing already exists and is reusable as-is: `lifeos_notifications` and the
`lifeos_queue_notification()` trigger (`supabase/migrations/0008_lifeos_devices.sql:63-147`),
`supabase/functions/notify/`, and `src/lifeos/push.ts` (`registerPush`, `clearBadge`,
`unregisterPush`). Mirror the existing trigger pattern; do not build a second queue.

1. **Price watch** — target → daily Edge Function check → push on drop. Highest value in the
   app.
2. **ZAR/AED rate alert** — "good day to send money home".
3. **Weekly deals digest** — Sunday push: new deals, drops on your list, new SA-basket stock.
4. **Settling-in autopilot** — arrival date from registration generates deadline-aware tasks
   (medical fitness within 30 days, Emirates ID after visa stamp, licence conversion window).
5. **Daily brief on Home** — prayer times, weather, ZAR/AED, today's events, next deadline.
6. **New-arrival auto-welcome** — "just landed" triggers a Community intro post + Toolkit
   essentials.
7. **Event reminders** — RSVP schedules 24 h / 2 h pushes.
8. **Ask-the-community fallback** — Huve answers first; one tap escalates to the feed.
9. **SA calendar** — Heritage Day, Youth Day, Springbok/Proteas fixtures auto-seeded.
10. **Offline Toolkit** — extend `globPatterns` (`vite.config.ts:56-60`) so visa, emergency
    and embassy pages work with no signal.
11. **Newcomer buddy match** — opt-in pairing with someone from the same SA home town who has
    been here 12+ months. Reuses the invite/redeem RPCs from `0010_lifeos_pairing.sql`.

---

## Components (21st.dev)

`npx shadcn@latest add "<url>?api_key=$API_KEY_21ST"`. Tailwind v4, framer-motion and
lucide-react are already installed. **Install under `src/components/ui/` and use them in new
screens only — do not restyle the inline-styled legacy screens to match.** Note that
`src/components/ui/*.jsx` is inside the Phase 0 lint scope, so new components must lint clean.

### Pricing & shopping

| Need | Component | Slug |
|---|---|---|
| Price watchlist, sortable + sparkline | Market Watchlist | `@ssicevs/market-watchlist` |
| Price history, scrubbable 1D→All | Market Snapshot | `@ssicevs/market-snapshot` |
| Long-range history w/ brush zoom | Range Navigator | `@ssicevs/range-navigator` |
| Store-vs-store compare | Comparison Table | `@ruixen.ui/comparison-table` |
| Product card w/ discount badge | Product Card | `@beratberkayg/product-card-1` |
| Product grid card | Product Card | `@ravikatiyar162/product-card-2` |
| Loading state | Product Grid Skeleton | `@cnippet.dev/v-skeleton-11` |
| List w/ quantities + totals | Shopping Cart | `@vaib215/shopping-cart` |
| Quantity stepper | Quantity | `@youcefbnm/quantity` |
| Basket interaction | Interactive Checkout | `@kokonutd/interactive-checkout` |
| Price-watch target | Amount Slider | `@serafimcloud/amount-slider` |
| Log-a-price sheet | Drawer (vaul) | `@sshahaider/drawer` |
| ZAR⇄AED converter | Currency Exchange Card | `@ravikatiyar162/currency-exchange-card` |
| Animated rate readout | Number Ticker | `@shadcnspace/number-ticker-02` |
| Savings/spend tile | Stats Widget | `@ravikatiyar162/stats-widget` |
| Budget headroom meter | Meter | `@hero_ui/heroui-meter` |

### Shell, community, onboarding

| Need | Component | Slug |
|---|---|---|
| Registration | Onboarding Form | `@ravikatiyar162/onboarding-form` |
| Registration (split-screen alt) | Auth Section 2 | `@solaceui/auth-section-2` |
| Profile setup steps | Onboarding Steps Carousel | `@cnippet.dev/v-carousel-8` |
| Settling-in tracker | Onboarding Checklist | `@chowlol202/onboarding-checklist` |
| 5-tab nav | Bottom Nav Bar (`stickyBottom`) | `@arunachalam/bottom-nav-bar` |
| Global search | Omni Command Palette | `@lovesickfromthe6ix/omni-command-palette` |
| Place cards | Place Card | `@ravikatiyar162/card-22` |
| Map place detail | Expanded Map | `@dev.shejanmahamud/expanded-map` |
| Events | Event Manager | `@vaib215/event-manager` |
| Q&A feed | News Cards | `@isaiahbjork/news-cards` |
| Community home | Community Hub Card | `@ravikatiyar162/community-hub-card` |
| AI assistant | AI Assistant Interface | `@rafa-porto/ai-assistant-interface` |
| Notifications | Notification Inbox Popover | `@ruixen.ui/notification-inbox-popover` |
| Toasts | Toast | `@cnippet.dev/toast` |

---

## What still works — do not break it

| Area | Evidence |
|---|---|
| Build / lint / typecheck | All green on HEAD |
| Tests | `npx vitest run` → 286 passed / 28 files |
| CI | `.github/workflows/ci.yml` runs typecheck, lint, test, build on every PR |
| Private per-account data | `20260814163629_private_user_accounts.sql` — `lifeos_user_state`, RLS |
| Spaces + RLS | `0009_lifeos_spaces.sql`, `20260814215702_secure_couple_spaces.sql`; security-definer `current_space_id()` / `is_space_member()` |
| Name auto-populate | `lifeos_handle_new_user()` writes `display_name` from `raw_user_meta_data ->> 'name'` |
| Typed budget engine | `src/lifeos/budget.ts` — `upgradeBudget`, `summarizeBudget`, `coveredByEmployer`, `BUDGET_VERSION = 4`, tested |
| Nav shell | `app.jsx:1538` — primary + More, preference-driven |
| Offline | `src/lifeos/{outbox,sync}.ts` + workbox NetworkFirst on Supabase, replayed on resume |
| Push | `0008_lifeos_devices.sql` + `supabase/functions/notify/` + `src/lifeos/push.ts` |
| Map | 25 curated Abu Dhabi locations, categorised (`screens-map.jsx:6-337`) |
| Native | Capacitor iOS, push, biometric lock |

---

## Exit criteria

- `npm run lint` and `npm run typecheck` **cover the root `.jsx` and `src/budget`**, and pass.
- `npx vitest run` ≥ **286** passing, none deleted to go green.
- `npm run build` passes.
- Two accounts, different emails, **same first name**: both register, both see their own
  name, neither sees the other's private data.
- `grep -rn "SABIS" .` and `grep -rn "suvedap@" .` return nothing outside
  `supabase/migrations/`.
- `grep -rn "LegacyBudgetScreen\|CountdownHero" .` returns nothing.
- No hardcoded FX literal remains anywhere in `.jsx`.
- A price point logged by account A is visible to account B, tagged with source and age.
- No client-side request ever goes to a retailer domain.
- Existing accounts survive every seed change (C4 verified against a saved state payload).

## Out of scope

Calls (`call.jsx`), games (`games.jsx`), the sync/outbox/lock/ice/net modules, and any edit to
an already-applied migration.

## Risks

- **Do not rebase this branch.** It is level with `origin/main`. A `checkout -B` against a
  stale assumption destroys work.
- **Community reads are a privacy change.** Policies before screens; A5 before either.
- **Amazon PA-API needs an Associates account** the user must create. Build source-agnostic
  so Tier 1 slots in later.
- **Seed removals reset users** via `pickStoredState()`. C4 is not optional.
- **Resist the `checkJs` temptation** in Phase 0. ESLint with the 37 declared globals is the
  whole win; typechecking 14k lines of untyped legacy JSX is not.
