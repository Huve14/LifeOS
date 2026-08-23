# How an installed PWA picks up a new release

An installed Life OS is a copy of the app sitting on someone's Home Screen with
its own service worker and cache. Nothing about a Vercel deploy reaches it on
its own — the worker has to notice, fetch, activate, and reload. This is how
that happens, and the two things that stop it.

## The chain

1. **`sw.js` must be fetched fresh.** `registration.update()` compares the bytes
   of the worker script it gets back with the one it is running. Identical bytes
   mean "no new release" and the chain stops here.
2. **The new worker installs and skips waiting.** `workbox.skipWaiting` and
   `clientsClaim` are set in `vite.config.ts`, and `src/pwa.ts` also posts
   `SKIP_WAITING` to any worker it finds already waiting from a previous visit.
3. **`controllerchange` fires** and the page reloads onto the new release —
   but only when the page already had a controller. A first install claims the
   page too, and reloading then would be a pointless flash on first run.
4. **The reload waits if it would destroy something.** See below.

`src/pwa.ts` asks for a check on load, every 30 minutes, and on `focus`,
`online`, `pageshow` and `visibilitychange` — throttled to one check a minute so
tab-switching does not hammer the network. In practice the check that matters is
the one when someone brings the app back to the foreground.

## Failure one: a cached service worker

This is the failure that leaves a PWA stuck on an old release indefinitely, and
it is silent — the app looks fine, it is simply months out of date.

`navigator.serviceWorker.register(..., { updateViaCache: 'none' })` tells the
*browser* not to answer `sw.js` from its own HTTP cache. It says nothing to a
CDN, a corporate proxy, or anything else in between. If one of those holds
`sw.js`, every `update()` gets back a byte-identical worker, step 1 concludes
there is nothing new, and no amount of client-side checking helps.

`vercel.json` therefore states the policy explicitly rather than relying on a
platform default that can change:

| Path | Cache-Control | Why |
|---|---|---|
| `/sw.js` | `no-cache, max-age=0, must-revalidate` | The only thing that can notice a release |
| `/`, `/index.html`, `/shared.html` | same | Unhashed, and they name the current asset hashes |
| `/manifest.webmanifest` | same | Unhashed |
| `/assets/*` | `public, max-age=31536000, immutable` | Content-hashed: a new build is a new URL |
| `/workbox-*.js` | same | Content-hashed |

`no-cache` does not mean "do not store" — it means "revalidate before use",
which is exactly right for a file that must be checked but rarely changes.

The immutable half is what makes an update cheap. Because every hashed chunk is
a distinct URL, updating fetches only what actually changed and the rest is
served from disk.

## Failure two: an update that eats your work

An auto-updating app reloads without asking, so it has to be certain the reload
costs nothing. `src/lifeos/net.ts` already tracked recordings, uploads, syncs
and calls through `setBusy`, and the update handler defers while that flag is
set.

That flag says nothing about a half-written note. `isSafeToReload()` in
`src/pwa.ts` now also refuses while the focused element is a text field with
something in it — an empty field is fair game, whitespace counts as empty, and
checkboxes and buttons carry nothing to lose. A deferred update is never
dropped: `watchForSafeMoment()` retries on `focusout` and when the tab becomes
visible again, and `setBusy(false)` consults the same predicate so the two paths
cannot disagree.

The app uses no `contenteditable` regions, so the check deliberately does not
cover them. Add a branch there if that changes.

## Verifying it

The rules are unit-tested in `src/pwa.test.ts`, but the thing worth checking is
the whole chain, in a browser:

1. Build twice with a distinguishing `<meta name="build-id">` in `index.html`,
   keeping each `dist` as a separate snapshot.
2. Serve snapshot one, open it, and wait for `navigator.serviceWorker.controller`
   to be non-null — that is "installed and controlled".
3. Swap the served files for snapshot two. This is the deploy.
4. Dispatch `focus` and `visibilitychange`, which is what foregrounding the app
   does.
5. The page should reload on its own and report the second `build-id`.

Repeat step 4 with text in a focused field and confirm the opposite: the
build-id stays put, the text survives, and the update lands as soon as the field
loses focus.

## What this does not cover

The native iOS build wraps the same web assets with Capacitor, and those are
shipped in the app bundle rather than fetched. It updates through TestFlight and
the App Store, not through this path. See [IOS.md](IOS.md).
